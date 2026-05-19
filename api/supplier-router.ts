import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { suppliers, supplierContacts, bills, supplierPayments } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { auditLog } from "./lib/audit";
import { nextNumber } from "./lib/numbering";

function ensureTenant(ctx: any, label = "") {
  const tid = ctx.user?.tenantId;
  console.log(`[Supplier router] ${label} tenantId:`, tid);
  if (tid == null) {
    console.log("[Supplier router] missing tenantId", ctx.user);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context missing" });
  }
  return tid as number;
}

export const supplierRouter = createRouter({
  // ─── LIST SUPPLIERS ────────────────────────────────────────────────────────
  list: authedQuery
    .input(z.object({
      search: z.string().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "list");
      console.log("[Supplier query] list input:", input);
      const conditions = [eq(suppliers.tenantId, tenantId)];

      if (input?.search) {
        conditions.push(sql`(
          ${suppliers.companyName} LIKE ${`%${input.search}%`} OR
          ${suppliers.tradeName} LIKE ${`%${input.search}%`} OR
          ${suppliers.email} LIKE ${`%${input.search}%`} OR
          ${suppliers.supplierCode} LIKE ${`%${input.search}%`}
        )`);
      }
      if (input?.type) conditions.push(eq(suppliers.supplierType, input.type as any));
      if (input?.status) conditions.push(eq(suppliers.status, input.status as any));

      const where = and(...conditions);

      const items = await db.select().from(suppliers)
        .where(where)
        .limit(input?.limit ?? 20)
        .offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20))
        .orderBy(desc(suppliers.createdAt));

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(suppliers).where(where);
      return { items, total: totalResult[0]?.count ?? 0 };
    }),

  // ─── GET SINGLE SUPPLIER ───────────────────────────────────────────────────
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "get");
      console.log("[Supplier query] get input:", input);
      const supplier = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, input.id), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      if (!supplier[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });
      return supplier[0];
    }),

  // ─── SUPPLIER DETAIL (with related data) ───────────────────────────────────
  detail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "detail");
      console.log("[Supplier query] detail input:", input);

      const supplier = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, input.id), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      if (!supplier[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });

      const contacts = await db.select().from(supplierContacts)
        .where(and(eq(supplierContacts.supplierId, input.id), eq(supplierContacts.tenantId, tenantId)))
        .orderBy(desc(supplierContacts.isPrimary));

      const recentBills = await db.select().from(bills)
        .where(and(eq(bills.supplierId, input.id), eq(bills.tenantId, tenantId)))
        .orderBy(desc(bills.createdAt))
        .limit(10);

      const recentPayments = await db.select().from(supplierPayments)
        .where(and(eq(supplierPayments.supplierId, input.id), eq(supplierPayments.tenantId, tenantId)))
        .orderBy(desc(supplierPayments.createdAt))
        .limit(10);

      const billStats = await db.select({
        totalBills: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${bills.totalAmount}), 0)`,
        totalPaid: sql<number>`COALESCE(SUM(${bills.amountPaid}), 0)`,
        totalDue: sql<number>`COALESCE(SUM(${bills.balanceDue}), 0)`,
        openBills: sql<number>`SUM(CASE WHEN ${bills.status} IN ('open','partial','overdue') THEN 1 ELSE 0 END)`,
        overdueBills: sql<number>`SUM(CASE WHEN ${bills.status} = 'overdue' THEN 1 ELSE 0 END)`,
      }).from(bills)
        .where(and(eq(bills.supplierId, input.id), eq(bills.tenantId, tenantId)));

      return {
        supplier: supplier[0],
        contacts,
        recentBills,
        recentPayments,
        stats: {
          totalBills: Number(billStats[0]?.totalBills ?? 0),
          totalAmount: Number(billStats[0]?.totalAmount ?? 0),
          totalPaid: Number(billStats[0]?.totalPaid ?? 0),
          totalDue: Number(billStats[0]?.totalDue ?? 0),
          openBills: Number(billStats[0]?.openBills ?? 0),
          overdueBills: Number(billStats[0]?.overdueBills ?? 0),
        },
      };
    }),

  // ─── CREATE SUPPLIER ───────────────────────────────────────────────────────
  create: authedQuery
    .input(z.object({
      companyName: z.string().min(1),
      tradeName: z.string().optional(),
      supplierType: z.enum(["airline", "hotel", "tour_operator", "car_rental", "insurance", "visa_service", "other"]).default("other"),
      taxId: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      website: z.string().optional(),
      creditLimit: z.number().min(0).default(0),
      paymentTerms: z.number().min(0).default(30),
      currency: z.string().length(3).default("USD"),
      notes: z.string().optional(),
      contacts: z.array(z.object({
        name: z.string().min(1),
        position: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        isPrimary: z.boolean().default(false),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "create");
      console.log("[Supplier create] input:", input);
      const supplierCode = await nextNumber(db, tenantId, "SUP");

      const result = await db.insert(suppliers).values({
        tenantId,
        supplierCode,
        companyName: input.companyName,
        tradeName: input.tradeName || null,
        supplierType: input.supplierType,
        taxId: input.taxId || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        country: input.country || null,
        website: input.website || null,
        creditLimit: input.creditLimit.toFixed(2),
        balanceDue: "0.00",
        paymentTerms: input.paymentTerms,
        currency: input.currency,
        status: "active",
        notes: input.notes || null,
      });

      const supplierId = Number(result[0].insertId);

      if (input.contacts && input.contacts.length > 0) {
        for (const c of input.contacts) {
          await db.insert(supplierContacts).values({
            tenantId,
            supplierId,
            name: c.name,
            position: c.position || null,
            email: c.email || null,
            phone: c.phone || null,
            isPrimary: c.isPrimary,
          });
        }
      }

      await auditLog({ ctx, action: "supplier_created", entityType: "supplier", entityId: supplierId, newValues: input });

      return { id: supplierId, supplierCode };
    }),

  // ─── UPDATE SUPPLIER ───────────────────────────────────────────────────────
  update: authedQuery
    .input(z.object({
      id: z.number(),
      companyName: z.string().min(1).optional(),
      tradeName: z.string().optional(),
      supplierType: z.enum(["airline", "hotel", "tour_operator", "car_rental", "insurance", "visa_service", "other"]).optional(),
      taxId: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      website: z.string().optional(),
      creditLimit: z.number().min(0).optional(),
      paymentTerms: z.number().min(0).optional(),
      currency: z.string().length(3).optional(),
      status: z.enum(["active", "inactive", "blocked"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "update");
      console.log("[Supplier update] input:", input);
      const { id, ...data } = input;

      const existing = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });

      const updateData: Record<string, any> = {};
      if (data.companyName !== undefined) updateData.companyName = data.companyName;
      if (data.tradeName !== undefined) updateData.tradeName = data.tradeName || null;
      if (data.supplierType !== undefined) updateData.supplierType = data.supplierType;
      if (data.taxId !== undefined) updateData.taxId = data.taxId || null;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.address !== undefined) updateData.address = data.address || null;
      if (data.city !== undefined) updateData.city = data.city || null;
      if (data.country !== undefined) updateData.country = data.country || null;
      if (data.website !== undefined) updateData.website = data.website || null;
      if (data.creditLimit !== undefined) updateData.creditLimit = data.creditLimit.toFixed(2);
      if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms;
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.notes !== undefined) updateData.notes = data.notes || null;

      await db.update(suppliers).set(updateData)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)));

      await auditLog({ ctx, action: "supplier_updated", entityType: "supplier", entityId: id, oldValues: existing[0], newValues: data });

      return { success: true };
    }),

  // ─── DELETE SUPPLIER ───────────────────────────────────────────────────────
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "delete");
      console.log("[Supplier delete] input:", input);

      // Check for related bills
      const billCount = await db.select({ count: sql<number>`count(*)` }).from(bills)
        .where(and(eq(bills.supplierId, input.id), eq(bills.tenantId, tenantId)));
      if ((billCount[0]?.count ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Cannot delete supplier with existing bills" });
      }

      await db.delete(supplierContacts)
        .where(and(eq(supplierContacts.supplierId, input.id), eq(supplierContacts.tenantId, tenantId)));
      await db.delete(suppliers)
        .where(and(eq(suppliers.id, input.id), eq(suppliers.tenantId, tenantId)));

      await auditLog({ ctx, action: "supplier_deleted", entityType: "supplier", entityId: input.id });

      return { success: true };
    }),

  // ─── ADD CONTACT ───────────────────────────────────────────────────────────
  addContact: authedQuery
    .input(z.object({
      supplierId: z.number(),
      name: z.string().min(1),
      position: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      isPrimary: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "addContact");
      console.log("[Supplier addContact] input:", input);

      if (input.isPrimary) {
        await db.update(supplierContacts).set({ isPrimary: false })
          .where(and(eq(supplierContacts.supplierId, input.supplierId), eq(supplierContacts.tenantId, tenantId)));
      }

      const result = await db.insert(supplierContacts).values({
        tenantId,
        supplierId: input.supplierId,
        name: input.name,
        position: input.position || null,
        email: input.email || null,
        phone: input.phone || null,
        isPrimary: input.isPrimary,
      });

      return { id: Number(result[0].insertId) };
    }),

  // ─── DELETE CONTACT ────────────────────────────────────────────────────────
  deleteContact: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ensureTenant(ctx, "deleteContact");
      console.log("[Supplier deleteContact] input:", input);
      await db.delete(supplierContacts)
        .where(and(eq(supplierContacts.id, input.id), eq(supplierContacts.tenantId, tenantId)));
      return { success: true };
    }),

  // ─── SUPPLIER STATS ────────────────────────────────────────────────────────
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ensureTenant(ctx, "stats");
    console.log("[Supplier query] stats");

    const totalSuppliers = await db.select({ count: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.tenantId, tenantId));
    const activeSuppliers = await db.select({ count: sql<number>`count(*)` }).from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.status, "active")));
    const totalPayable = await db.select({ total: sql<number>`COALESCE(SUM(balance_due), 0)` }).from(suppliers)
      .where(eq(suppliers.tenantId, tenantId));
    const overdueBills = await db.select({ count: sql<number>`count(*)` }).from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.status, "overdue")));
    const typeBreakdown = await db.select({
      type: suppliers.supplierType,
      count: sql<number>`count(*)`,
    }).from(suppliers).where(eq(suppliers.tenantId, tenantId)).groupBy(suppliers.supplierType);

    return {
      totalSuppliers: totalSuppliers[0]?.count ?? 0,
      activeSuppliers: activeSuppliers[0]?.count ?? 0,
      totalPayable: Number(totalPayable[0]?.total ?? 0),
      overdueBills: overdueBills[0]?.count ?? 0,
      typeBreakdown,
    };
  }),
});
