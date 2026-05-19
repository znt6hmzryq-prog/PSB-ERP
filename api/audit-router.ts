import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { auditLogs, users, roles } from "@db/schema";
import { desc, sql, and, eq } from "drizzle-orm";

export const auditRouter = createRouter({
  logs: authedQuery
    .input(z.object({
      entityType: z.string().optional(),
      action: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(auditLogs.tenantId, tenantId)];
      if (input?.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
      if (input?.action) conditions.push(eq(auditLogs.action, input.action));
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.query.auditLogs.findMany({
        where,
        limit: input?.limit ?? 50,
        offset: ((input?.page ?? 1) - 1) * (input?.limit ?? 50),
        orderBy: [desc(auditLogs.createdAt)],
        with: { user: true },
      });

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where);
      return { items, total: countResult[0]?.count ?? 0 };
    }),

  createLog: authedQuery
    .input(z.object({
      action: z.string().min(1),
      entityType: z.string().min(1),
      entityId: z.string().optional(),
      oldValues: z.record(z.string(), z.unknown()).optional(),
      newValues: z.record(z.string(), z.unknown()).optional(),
      ipAddress: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.insert(auditLogs).values({
        tenantId: ctx.user!.tenantId as number,
        userId: ctx.user!.id,
        ...input,
      });
      return { success: true };
    }),

  users: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.users.findMany({
      where: eq(users.tenantId, ctx.user!.tenantId as number),
      orderBy: [desc(users.createdAt)],
    });
  }),

  roles: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.roles.findMany({
      where: eq(roles.tenantId, ctx.user!.tenantId as number),
      orderBy: [roles.name],
    });
  }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;
    const actionCounts = await db
      .select({ action: auditLogs.action, count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .groupBy(auditLogs.action);

    const entityCounts = await db
      .select({ entityType: auditLogs.entityType, count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .groupBy(auditLogs.entityType);

    return { actionCounts, entityCounts };
  }),
});
