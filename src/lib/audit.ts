import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

type AuditInput = {
  clinicId: number;
  actorUserId?: number | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

/** Never log clinical free-text / medical details here. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      clinicId: input.clinicId,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId != null ? String(input.entityId) : null,
      metadata: input.metadata ?? null,
    });
  } catch {
    // auditing must never break the request path
  }
}
