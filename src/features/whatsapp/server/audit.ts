import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditActorType } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";

export function recordAuditEvent(input: {
  organizationId: string;
  actorUserId?: string;
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return getDatabase().auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorType: input.actorType ?? AuditActorType.USER,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      metadata: input.metadata,
    },
  });
}
