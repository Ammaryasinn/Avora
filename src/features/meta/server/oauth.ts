import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import { META_OAUTH_SCOPES, getMetaConfiguration } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/errors";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";
import { encryptMetaToken } from "@/lib/meta/token-cipher";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { OrganizationRole } from "@/generated/prisma/enums";

export const META_OAUTH_COOKIE = "avora_meta_oauth";
const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

export type MetaOAuthFailureStage =
  | "user_resolution"
  | "oauth_state_validation"
  | "organization_resolution"
  | "oauth_state_consumption"
  | "code_exchange"
  | "token_validation"
  | "token_encryption"
  | "connection_upsert";

export class MetaOAuthCompletionError extends Error {
  readonly stage: MetaOAuthFailureStage;
  readonly safeErrorType: string;
  readonly safeErrorMessage: string;
  readonly httpStatus?: number;
  readonly organizationId?: string;
  readonly redirectPath?: string;

  constructor(input: {
    stage: MetaOAuthFailureStage;
    cause: unknown;
    organizationId?: string;
    redirectPath?: string;
  }) {
    const safeErrorMessage = getSafeErrorMessage(input.stage, input.cause);
    super(safeErrorMessage, { cause: input.cause });
    this.name = "MetaOAuthCompletionError";
    this.stage = input.stage;
    this.safeErrorType =
      input.cause instanceof Error ? input.cause.name : "UnknownError";
    this.safeErrorMessage = safeErrorMessage;
    this.httpStatus =
      input.cause instanceof MetaApiError ? input.cause.httpStatus : undefined;
    this.organizationId = input.organizationId;
    this.redirectPath = input.redirectPath;
  }
}

export function logMetaOAuthEvent(input: {
  event: string;
  correlationId: string;
  organizationId?: string;
  stage?: string;
  errorType?: string;
  errorMessage?: string;
  httpStatus?: number;
}) {
  const payload = JSON.stringify({ component: "meta_oauth", ...input });
  if (input.errorType) {
    console.error(payload);
    return;
  }
  console.info(payload);
}

const safeFailureMessages: Record<MetaOAuthFailureStage, string> = {
  user_resolution: "The authenticated Avora user could not be resolved.",
  oauth_state_validation: "The Meta connection request is invalid or expired.",
  organization_resolution: "Organization access could not be verified.",
  oauth_state_consumption: "The Meta connection request was already used.",
  code_exchange: "Meta authorization-code exchange failed.",
  token_validation: "Meta identity validation failed.",
  token_encryption: "Meta token encryption failed.",
  connection_upsert: "The Meta connection could not be persisted.",
};

function getSafeErrorMessage(stage: MetaOAuthFailureStage, error: unknown) {
  if (error instanceof MetaApiError) return error.message;
  if (
    error instanceof Error &&
    (/^META_[A-Z0-9_]+/.test(error.message) ||
      error.message.startsWith("Meta token encryption") ||
      error.message.startsWith("Current Meta token encryption") ||
      error.message.startsWith("The Meta connection request"))
  ) {
    return error.message;
  }
  return safeFailureMessages[stage];
}

function stateHash(state: string, browserBinding: string) {
  return createHmac("sha256", getMetaConfiguration().oauthStateSecret)
    .update(`${state}:${browserBinding}`)
    .digest("hex");
}

export async function createMetaOAuthStart(organizationSlug: string) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const config = getMetaConfiguration();
  const state = randomBytes(32).toString("base64url");
  const browserBinding = randomBytes(32).toString("base64url");
  const redirectPath = `/dashboard/${tenant.organization.slug}/settings/integrations/meta`;

  await getDatabase().metaOAuthState.create({
    data: {
      organizationId: tenant.organizationId,
      initiatedById: user.id,
      stateHash: stateHash(state, browserBinding),
      redirectPath,
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
    },
  });

  const query = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.oauthRedirectUri,
    response_type: "code",
    state,
    scope: META_OAUTH_SCOPES.join(","),
  });

  return {
    authorizationUrl: `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth?${query}`,
    browserBinding,
    secureCookie: config.oauthRedirectUri.startsWith("https://"),
  };
}

export async function completeMetaOAuth(input: {
  code: string;
  state: string;
  browserBinding: string;
  correlationId: string;
}) {
  let stage: MetaOAuthFailureStage = "user_resolution";
  let organizationId: string | undefined;
  let redirectPath: string | undefined;

  try {
    const user = await ensureCurrentUser();
    logMetaOAuthEvent({ event: "user_resolved", correlationId: input.correlationId });
    const database = getDatabase();

    stage = "oauth_state_validation";
    const oauthState = await database.metaOAuthState.findUnique({
      where: { stateHash: stateHash(input.state, input.browserBinding) },
    });
    if (
      !oauthState ||
      oauthState.consumedAt ||
      oauthState.expiresAt <= new Date() ||
      oauthState.initiatedById !== user.id
    ) {
      throw new Error("The Meta connection request is invalid or expired.");
    }
    const resolvedOrganizationId = oauthState.organizationId;
    organizationId = resolvedOrganizationId;
    redirectPath = oauthState.redirectPath;
    logMetaOAuthEvent({
      event: "oauth_state_validated",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });

    stage = "organization_resolution";
    const membership = await database.organizationMember.findFirst({
      where: {
        organizationId: resolvedOrganizationId,
        userId: user.id,
        role: { in: [...managers] },
      },
      select: { id: true },
    });
    if (!membership) throw new Error("Organization access could not be verified.");
    logMetaOAuthEvent({
      event: "organization_resolved",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });

    stage = "oauth_state_consumption";
    const consumed = await database.metaOAuthState.updateMany({
      where: { id: oauthState.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new Error("The Meta connection request was already used.");
    }

    stage = "code_exchange";
    logMetaOAuthEvent({
      event: "code_exchange_started",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });
    const gateway = getMetaAdsGateway();
    const exchanged = await gateway.exchangeAuthorizationCode(input.code);
    logMetaOAuthEvent({
      event: "code_exchange_succeeded",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });

    stage = "token_validation";
    const [identity, inspected] = await Promise.all([
      gateway.getIdentity(exchanged.accessToken),
      gateway.inspectToken(exchanged.accessToken),
    ]);
    if (!inspected.valid) throw new Error("Meta returned an invalid access credential.");
    logMetaOAuthEvent({
      event: "meta_identity_validated",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });

    const missingScopes = META_OAUTH_SCOPES.filter(
      (scope) => scope !== "public_profile" && !inspected.scopes.includes(scope),
    );
    const existing = await database.metaConnection.findUnique({
      where: {
        organizationId_metaUserId: {
          organizationId: resolvedOrganizationId,
          metaUserId: identity.id,
        },
      },
      select: { id: true },
    });
    const connectionId = existing?.id ?? randomUUID();

    stage = "token_encryption";
    const encrypted = encryptMetaToken(
      exchanged.accessToken,
      resolvedOrganizationId,
      connectionId,
    );
    logMetaOAuthEvent({
      event: "token_encryption_succeeded",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });
    const expiresAt = inspected.expiresAt ?? exchanged.expiresAt;

    stage = "connection_upsert";
    logMetaOAuthEvent({
      event: "connection_upsert_started",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });
    const connection = await database.$transaction(async (transaction) => {
      const savedConnection = await transaction.metaConnection.upsert({
        where: {
          organizationId_metaUserId: {
            organizationId: resolvedOrganizationId,
            metaUserId: identity.id,
          },
        },
        create: {
          id: connectionId,
          organizationId: resolvedOrganizationId,
          connectedById: user.id,
          metaUserId: identity.id,
          metaUserName: identity.name,
          status: missingScopes.length ? "DEGRADED" : "CONNECTED",
          scopes: inspected.scopes,
          tokenCiphertext: encrypted.ciphertext,
          tokenIv: encrypted.iv,
          tokenAuthTag: encrypted.authTag,
          tokenKeyVersion: encrypted.keyVersion,
          tokenExpiresAt: expiresAt,
          dataAccessExpiresAt: inspected.dataAccessExpiresAt,
          lastValidatedAt: new Date(),
          lastErrorCode: missingScopes.length ? "MISSING_SCOPES" : null,
          lastErrorMessage: missingScopes.length
            ? "Reconnect Meta and grant all required permissions."
            : null,
        },
        update: {
          connectedById: user.id,
          metaUserName: identity.name,
          status: missingScopes.length ? "DEGRADED" : "CONNECTED",
          scopes: inspected.scopes,
          tokenCiphertext: encrypted.ciphertext,
          tokenIv: encrypted.iv,
          tokenAuthTag: encrypted.authTag,
          tokenKeyVersion: encrypted.keyVersion,
          tokenExpiresAt: expiresAt,
          dataAccessExpiresAt: inspected.dataAccessExpiresAt,
          lastValidatedAt: new Date(),
          lastErrorCode: missingScopes.length ? "MISSING_SCOPES" : null,
          lastErrorMessage: missingScopes.length
            ? "Reconnect Meta and grant all required permissions."
            : null,
          disconnectedAt: null,
          revokedAt: null,
        },
      });
      await transaction.metaAuditEvent.create({
        data: {
          organizationId: resolvedOrganizationId,
          actorUserId: user.id,
          action: "META_CONNECTED",
          entityType: "MetaConnection",
          entityId: savedConnection.id,
          metadata: {
            scopeCount: inspected.scopes.length,
            missingScopeCount: missingScopes.length,
          },
        },
      });
      return savedConnection;
    });
    logMetaOAuthEvent({
      event: "connection_upsert_succeeded",
      correlationId: input.correlationId,
      organizationId: resolvedOrganizationId,
    });

    return { connection, redirectPath };
  } catch (error) {
    throw new MetaOAuthCompletionError({
      stage,
      cause: error,
      organizationId,
      redirectPath,
    });
  }
}
