import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { customers, leads, interactions, tickets, invoices, customerTransactions } from "@db/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";

export const crmRouter = createRouter({
  // ─── CUSTOMERS ───────────────────────────────────────────────────────────
  customers: authedQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      type: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conditions = [eq(customers.tenantId, ctx.user!.tenantId as number), isNull(customers.deletedAt)];
      if (input?.search) {
        conditions.push(sql`${customers.firstName} LIKE ${`%${input.search}%`} OR ${customers.lastName} LIKE ${`%${input.search}%`} OR ${customers.email} LIKE ${`%${input.search}%`}`);
      }
      if (input?.status) conditions.push(eq(customers.status, input.status as "active" | "inactive" | "blacklisted" | "vip"));
      if (input?.type) conditions.push(eq(customers.customerType, input.type as "individual" | "corporate" | "agent"));

      const where = and(...conditions);

      const items = await db.query.customers.findMany({
        where,
        limit: input?.limit ?? 20,
        offset: ((input?.page ?? 1) - 1) * (input?.limit ?? 20),
        orderBy: [desc(customers.createdAt)],
      });

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(customers).where(where);
      return { items, total: countResult[0]?.count ?? 0 };
    }),

  customer: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      return db.query.customers.findFirst({
        where: and(eq(customers.id, input.id), eq(customers.tenantId, ctx.user!.tenantId as number)),
      });
    }),

  customerDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const customer = await db.query.customers.findFirst({
        where: and(eq(customers.id, input.id), eq(customers.tenantId, tenantId)),
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      // Recent tickets
      const recentTickets = await db.select().from(tickets)
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.customerId, input.id)))
        .orderBy(desc(tickets.createdAt))
        .limit(10);

      // Recent invoices
      const recentInvoices = await db.select().from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.customerId, input.id)))
        .orderBy(desc(invoices.createdAt))
        .limit(10);

      // Recent transactions
      const recentTransactions = await db.select().from(customerTransactions)
        .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, input.id)))
        .orderBy(desc(customerTransactions.createdAt))
        .limit(20);

      // Recent interactions
      const recentInteractions = await db.select().from(interactions)
        .where(and(eq(interactions.tenantId, tenantId), eq(interactions.customerId, input.id)))
        .orderBy(desc(interactions.createdAt))
        .limit(10);

      // Calculate balance due from transactions
      const txSum = await db.select({
        receivable: sql<number>`COALESCE(SUM(CASE WHEN type = 'receivable' THEN amount ELSE 0 END), 0)`,
        payments: sql<number>`COALESCE(SUM(CASE WHEN type IN ('payment','deposit','credit','refund') THEN amount ELSE 0 END), 0)`,
      })
        .from(customerTransactions)
        .where(and(eq(customerTransactions.tenantId, tenantId), eq(customerTransactions.customerId, input.id)));

      const balanceDue = Number(txSum[0]?.receivable ?? 0) - Number(txSum[0]?.payments ?? 0);

      // Total paid
      const totalPaid = await db.select({
        total: sql<number>`COALESCE(SUM(amount), 0)`,
      })
        .from(customerTransactions)
        .where(and(
          eq(customerTransactions.tenantId, tenantId),
          eq(customerTransactions.customerId, input.id),
          eq(customerTransactions.type, "payment"),
        ));

      return {
        customer,
        recentTickets,
        recentInvoices,
        recentTransactions,
        recentInteractions,
        stats: {
          totalBookings: customer.totalBookings,
          totalRevenue: Number(customer.totalRevenue),
          totalPaid: Number(totalPaid[0]?.total ?? 0),
          balanceDue,
        },
      };
    }),

  createCustomer: authedQuery
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      jobTitle: z.string().optional(),
      customerType: z.enum(["individual", "corporate", "agent"]).default("individual"),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const code = `CUST-${Date.now().toString(36).toUpperCase()}`;
      const result = await db.insert(customers).values({
        ...input,
        tenantId: ctx.user!.tenantId as number,
        customerCode: code,
        status: "active",
        totalBookings: 0,
        totalRevenue: "0.00",
      });
      return { id: Number(result[0].insertId) };
    }),

  updateCustomer: authedQuery
    .input(z.object({
      id: z.number(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      status: z.enum(["active", "inactive", "blacklisted", "vip"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...update } = input;
      if (Object.keys(update).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }
      await db.update(customers).set(update).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.user!.tenantId as number)));
      return { success: true };
    }),

  // ─── LEADS ───────────────────────────────────────────────────────────────
  leads: authedQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conditions = [eq(leads.tenantId, ctx.user!.tenantId as number)];
      if (input?.status) conditions.push(eq(leads.status, input.status as "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost"));
      if (input?.search) {
        conditions.push(sql`${leads.firstName} LIKE ${`%${input.search}%`} OR ${leads.lastName} LIKE ${`%${input.search}%`} OR ${leads.company} LIKE ${`%${input.search}%`}`);
      }
      const where = and(...conditions);

      const items = await db.query.leads.findMany({
        where,
        limit: input?.limit ?? 20,
        offset: ((input?.page ?? 1) - 1) * (input?.limit ?? 20),
        orderBy: [desc(leads.createdAt)],
      });

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(leads).where(where);
      return { items, total: countResult[0]?.count ?? 0 };
    }),

  createLead: authedQuery
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      source: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      estimatedValue: z.string().optional(),
      expectedCloseDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { expectedCloseDate, ...rest } = input;
      const result = await db.insert(leads).values({
        ...rest,
        tenantId: ctx.user!.tenantId as number,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        status: "new",
      });
      return { id: Number(result[0].insertId) };
    }),

  updateLeadStatus: authedQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(leads).set({ status: input.status }).where(and(eq(leads.id, input.id), eq(leads.tenantId, ctx.user!.tenantId as number)));
      return { success: true };
    }),

  // ─── INTERACTIONS ────────────────────────────────────────────────────────
  interactions: authedQuery
    .input(z.object({ customerId: z.number().optional(), leadId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const conditions = [eq(interactions.tenantId, ctx.user!.tenantId as number)];
      if (input.customerId) conditions.push(eq(interactions.customerId, input.customerId));
      if (input.leadId) conditions.push(eq(interactions.leadId, input.leadId));
      const where = and(...conditions);

      return db.query.interactions.findMany({
        where,
        orderBy: [desc(interactions.createdAt)],
      });
    }),

  createInteraction: authedQuery
    .input(z.object({
      customerId: z.number().optional(),
      leadId: z.number().optional(),
      type: z.enum(["call", "email", "meeting", "note", "task", "sms", "whatsapp"]),
      subject: z.string().min(1),
      description: z.string().optional(),
      followUpDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { followUpDate, ...rest } = input;
      const result = await db.insert(interactions).values({
        ...rest,
        tenantId: ctx.user!.tenantId as number,
        followUpDate: followUpDate ? new Date(followUpDate) : undefined,
        status: "pending",
        createdBy: ctx.user!.id,
      });
      return { id: Number(result[0].insertId) };
    }),

  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const customerCount = await db.select({ count: sql<number>`count(*)` }).from(customers).where(and(eq(customers.tenantId, ctx.user!.tenantId as number), isNull(customers.deletedAt)));
    const leadCount = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.tenantId, ctx.user!.tenantId as number));
    const activeLeads = await db.select({ count: sql<number>`count(*)` }).from(leads).where(and(eq(leads.tenantId, ctx.user!.tenantId as number), sql`${leads.status} NOT IN ('won','lost')`));
    const vipCount = await db.select({ count: sql<number>`count(*)` }).from(customers).where(and(eq(customers.tenantId, ctx.user!.tenantId as number), eq(customers.status, "vip"), isNull(customers.deletedAt)));
    const totalRevenue = await db.select({ total: sql<number>`COALESCE(SUM(total_revenue), 0)` }).from(customers).where(and(eq(customers.tenantId, ctx.user!.tenantId as number), isNull(customers.deletedAt)));

    return {
      customers: customerCount[0]?.count ?? 0,
      leads: leadCount[0]?.count ?? 0,
      activeLeads: activeLeads[0]?.count ?? 0,
      vipCustomers: vipCount[0]?.count ?? 0,
      totalRevenue: Number(totalRevenue[0]?.total ?? 0),
    };
  }),

  deleteCustomer: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(customers).set({
        deletedAt: new Date(),
        deletedBy: ctx.user!.id,
      }).where(and(eq(customers.id, input.id), eq(customers.tenantId, ctx.user!.tenantId as number)));
      return { success: true };
    }),
});
