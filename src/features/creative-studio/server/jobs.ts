import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  AICapability,
  AIJobStatus,
} from "@/generated/prisma/enums";
import {
  assertCapabilityEnabled,
  estimatedJobCostUsd,
  getAIConfiguration,
} from "@/lib/ai/config";
import { AIUsageLimitError } from "@/lib/ai/errors";
import { getAIJobDispatcher } from "@/lib/ai/job-dispatcher";
import { getDatabase } from "@/lib/db/database";

const activeStatuses = [
  AIJobStatus.PENDING,
  AIJobStatus.QUEUED,
  AIJobStatus.RUNNING,
  AIJobStatus.RETRY_SCHEDULED,
] as const;

function usagePeriod(date = new Date()) {
  const periodStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );

  return { periodStart, periodEnd };
}

function requestFingerprint(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function createAIJob(input: {
  organizationId: string;
  creativeId: string;
  createdById: string;
  capability: AICapability;
  idempotencyKey: string;
  promptTemplateKey: string;
  promptTemplateVersion?: number;
  jobInput: Prisma.InputJsonValue;
  requestedVariantCount: number;
}) {
  assertCapabilityEnabled(input.capability);
  const configuration = getAIConfiguration();
  const estimate = new Prisma.Decimal(
    estimatedJobCostUsd(input.capability, input.requestedVariantCount),
  );
  const { periodStart, periodEnd } = usagePeriod();
  const database = getDatabase();

  const job = await database.$transaction(
    async (transaction) => {
      const existing = await transaction.aIJob.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existing) {
        return existing;
      }

      const creative = await transaction.creative.findFirst({
        where: {
          id: input.creativeId,
          organizationId: input.organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });

      if (!creative) {
        throw new Error("Creative not found.");
      }

      const settings = await transaction.organizationAISettings.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          monthlyBudget: configuration.defaults.monthlyBudgetUsd,
          perJobLimit: configuration.defaults.perJobLimitUsd,
          maxConcurrentJobs: Math.floor(
            configuration.defaults.maxConcurrentJobs,
          ),
          maxRequestsPerMinute: Math.floor(
            configuration.defaults.maxRequestsPerMinute,
          ),
          personRetentionDays: Math.floor(
            configuration.defaults.personRetentionDays,
          ),
        },
        update: {},
      });

      if (!settings.enabled) {
        throw new AIUsageLimitError("AI generation is disabled for this organization.");
      }

      const capabilityEnabled = {
        GENERATE_TEXT: settings.textEnabled,
        GENERATE_IMAGE: settings.imageEnabled,
        EDIT_IMAGE: settings.imageEditEnabled,
        GENERATE_VIRTUAL_TRY_ON: settings.virtualTryOnEnabled,
        GENERATE_VIDEO: false,
      }[input.capability];

      if (!capabilityEnabled) {
        throw new AIUsageLimitError("This AI capability is disabled for this organization.");
      }

      if (estimate.greaterThan(settings.perJobLimit)) {
        throw new AIUsageLimitError("This request exceeds the per-job AI spending limit.");
      }

      const concurrentJobs = await transaction.aIJob.count({
        where: {
          organizationId: input.organizationId,
          status: { in: [...activeStatuses] },
        },
      });

      if (concurrentJobs >= settings.maxConcurrentJobs) {
        throw new AIUsageLimitError("The organization has reached its concurrent AI job limit.");
      }

      const recentJobs = await transaction.aIJob.count({
        where: {
          organizationId: input.organizationId,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });

      if (recentJobs >= settings.maxRequestsPerMinute) {
        throw new AIUsageLimitError("The organization AI request rate limit was reached.");
      }

      const usage = await transaction.aIUsagePeriod.upsert({
        where: {
          organizationId_periodStart: {
            organizationId: input.organizationId,
            periodStart,
          },
        },
        create: {
          organizationId: input.organizationId,
          periodStart,
          periodEnd,
          budget: settings.monthlyBudget,
        },
        update: {},
      });
      const projected = usage.consumedCost.add(usage.reservedCost).add(estimate);

      if (projected.greaterThan(usage.budget)) {
        throw new AIUsageLimitError("The organization monthly AI budget is exhausted.");
      }

      const created = await transaction.aIJob.create({
        data: {
          organizationId: input.organizationId,
          creativeId: creative.id,
          createdById: input.createdById,
          capability: input.capability,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: requestFingerprint(input.jobInput),
          promptTemplateKey: input.promptTemplateKey,
          promptTemplateVersion: input.promptTemplateVersion ?? 1,
          input: input.jobInput,
          requestedVariantCount: input.requestedVariantCount,
          reservedCost: estimate,
        },
      });

      await transaction.aIUsagePeriod.update({
        where: { id: usage.id },
        data: { reservedCost: { increment: estimate } },
      });

      await transaction.creative.updateMany({
        where: { id: creative.id, organizationId: input.organizationId },
        data: { status: "GENERATING" },
      });

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (job.status === AIJobStatus.PENDING) {
    await getAIJobDispatcher().enqueue(job.id, input.organizationId);
  }

  return job;
}

export async function reconcileJobBudget(input: {
  jobId: string;
  organizationId: string;
  actualCost: Prisma.Decimal;
  terminalStatus: AIJobStatus;
  errorCode?: string;
  errorMessage?: string;
}) {
  const database = getDatabase();

  await database.$transaction(
    async (transaction) => {
      const job = await transaction.aIJob.findFirst({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          status: { in: [...activeStatuses] },
        },
      });

      if (!job) {
        return;
      }

      const { periodStart } = usagePeriod(job.createdAt);
      await transaction.aIJob.updateMany({
        where: { id: job.id, organizationId: input.organizationId },
        data: {
          status: input.terminalStatus,
          actualCost: input.actualCost,
          completedAt:
            input.terminalStatus === AIJobStatus.SUCCEEDED ? new Date() : null,
          failedAt:
            input.terminalStatus === AIJobStatus.FAILED ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      });
      await transaction.aIUsagePeriod.update({
        where: {
          organizationId_periodStart: {
            organizationId: input.organizationId,
            periodStart,
          },
        },
        data: {
          reservedCost: { decrement: job.reservedCost },
          consumedCost: { increment: input.actualCost },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
