import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { notifications } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export const notificationRouter = createRouter({
  list: authedQuery
    .input(z.object({
      status: z.enum(["read", "unread", "all"]).default("all"),
      category: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.userId, ctx.user!.id)];

      if (input?.status === "unread") conditions.push(eq(notifications.isRead, false));
      if (input?.status === "read") conditions.push(eq(notifications.isRead, true));
      if (input?.category) conditions.push(eq(notifications.category, input.category as "ticket" | "wallet" | "expense" | "accounting" | "crm" | "system" | "security"));

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20));
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(where);

      return { items, total: countResult[0]?.count ?? 0 };
    }),

  unread: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.notifications.findMany({
      where: and(eq(notifications.tenantId, ctx.user!.tenantId as number), eq(notifications.userId, ctx.user!.id), eq(notifications.isRead, false)),
      limit: 10,
      orderBy: [desc(notifications.createdAt)],
    });
  }),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const target = await db.query.notifications.findFirst({
        where: and(eq(notifications.id, input.id), eq(notifications.tenantId, ctx.user!.tenantId as number)),
      });
      if (!target || target.userId !== ctx.user!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Notification not found" });
      }
      await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.id, input.id));
      return { success: true };
    }),

  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(
      and(eq(notifications.tenantId, ctx.user!.tenantId as number), eq(notifications.userId, ctx.user!.id), eq(notifications.isRead, false)),
    );
    return { success: true };
  }),
});
