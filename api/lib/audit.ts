import { getDb } from "../queries/connection";
import { auditLogs } from "@db/schema";
import type { TrpcContext } from "../context";

export async function auditLog({
  ctx,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
}: {
  ctx: TrpcContext;
  action: string;
  entityType: string;
  entityId?: string | number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}) {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      tenantId: ctx.user?.tenantId ?? null,
      userId: ctx.user?.id ?? null,
      action,
      entityType,
      entityId: entityId?.toString() ?? null,
      oldValues: oldValues ?? null,
      newValues: newValues ?? null,
      ipAddress: ctx.req.headers.get("x-forwarded-for") || ctx.req.headers.get("x-real-ip") || null,
      userAgent: ctx.req.headers.get("user-agent") ?? null,
    });
  } catch (err) {
    // Non-critical: don't fail the main operation if audit logging fails
    console.warn("[audit] Failed to write audit log:", err);
  }
}
