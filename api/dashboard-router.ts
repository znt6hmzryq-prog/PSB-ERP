import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  tickets,
  customers,
  wallets,
  walletTransactions,
  expenses,
  notifications,
  leads,
} from "@db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export const dashboardRouter = createRouter({
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    const totalTickets = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(eq(tickets.tenantId, tenantId));
    const totalCustomers = await db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.tenantId, tenantId));
    const totalRevenue = await db.select({ total: sql<number>`COALESCE(SUM(total_amount), 0)` }).from(tickets).where(eq(tickets.tenantId, tenantId));
    const totalExpenses = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(expenses).where(eq(expenses.tenantId, tenantId));
    const walletBalance = await db.select({ total: sql<number>`COALESCE(SUM(balance), 0)` }).from(wallets).where(eq(wallets.tenantId, tenantId));
    const pendingTickets = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(and(eq(tickets.tenantId, tenantId), eq(tickets.status, "pending")));
    const leadCount = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.tenantId, tenantId));
    const unreadNotifications = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));

    return {
      totalTickets: totalTickets[0]?.count ?? 0,
      totalCustomers: totalCustomers[0]?.count ?? 0,
      totalRevenue: Number(totalRevenue[0]?.total ?? 0),
      totalExpenses: Number(totalExpenses[0]?.total ?? 0),
      walletBalance: Number(walletBalance[0]?.total ?? 0),
      pendingTickets: pendingTickets[0]?.count ?? 0,
      leadCount: leadCount[0]?.count ?? 0,
      unreadNotifications: unreadNotifications[0]?.count ?? 0,
    };
  }),

  ticketTrend: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const result = await db
      .select({
        month: sql<string>`DATE_FORMAT(created_at, '%Y-%m')`,
        count: sql<number>`count(*)`,
        revenue: sql<number>`COALESCE(SUM(total_amount), 0)`,
      })
      .from(tickets)
      .where(eq(tickets.tenantId, ctx.user!.tenantId as number))
      .groupBy(sql`DATE_FORMAT(created_at, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(created_at, '%Y-%m')`);
    return result;
  }),

  recentTickets: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const items = await db.select().from(tickets).where(eq(tickets.tenantId, ctx.user!.tenantId as number)).orderBy(desc(tickets.createdAt)).limit(5);
    return items;
  }),

  recentTransactions: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const transactions = await db.select().from(walletTransactions).where(eq(walletTransactions.tenantId, ctx.user!.tenantId as number)).orderBy(desc(walletTransactions.createdAt)).limit(8);
    const walletIds = [...new Set(transactions.map(t => t.walletId).filter(Boolean))];
    const walletList = walletIds.length > 0
      ? await db.select().from(wallets).where(and(eq(wallets.tenantId, ctx.user!.tenantId as number), inArray(wallets.id, walletIds)))
      : [];
    const walletMap = new Map(walletList.map(w => [w.id, w]));
    return transactions.map(t => ({
      ...t,
      wallet: walletMap.get(t.walletId) || null,
    }));
  }),

  topCustomers: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, ctx.user!.tenantId as number))
      .orderBy(desc(customers.totalRevenue))
      .limit(5);
  }),

  ticketStatusDistribution: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({
        status: tickets.status,
        count: sql<number>`count(*)`,
      })
      .from(tickets)
      .where(eq(tickets.tenantId, ctx.user!.tenantId as number))
      .groupBy(tickets.status);
  }),

  expenseByCategory: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const expenseCategories = (await import("@db/schema")).expenseCategories;
    return db
      .select({
        categoryId: expenses.categoryId,
        categoryName: sql<string>`MAX(${expenseCategories.name})`,
        color: sql<string>`MAX(${expenseCategories.color})`,
        total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(eq(expenses.tenantId, ctx.user!.tenantId as number))
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .groupBy(expenses.categoryId);
  }),

  unreadNotifications: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.query.notifications.findMany({
      where: and(eq(notifications.tenantId, ctx.user!.tenantId as number), eq(notifications.isRead, false)),
      limit: 10,
      orderBy: [desc(notifications.createdAt)],
    });
  }),

  markNotificationRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.tenantId, ctx.user!.tenantId as number)));
      return { success: true };
    }),
});
