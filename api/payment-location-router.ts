import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { paymentLocations } from "@db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export const paymentLocationRouter = createRouter({
  list: authedQuery
    .input(z.object({
      status: z.string().optional(),
      city: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const conditions = [eq(paymentLocations.tenantId, tenantId)];
      if (input?.status) conditions.push(eq(paymentLocations.status, input.status as "active" | "inactive"));
      if (input?.city) conditions.push(eq(paymentLocations.city, input.city));
      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const items = await db.select().from(paymentLocations).where(where).orderBy(desc(paymentLocations.createdAt)).limit(input?.limit ?? 20).offset(((input?.page ?? 1) - 1) * (input?.limit ?? 20));
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(paymentLocations).where(where);
      return { items, total: countResult[0]?.count ?? 0 };
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const loc = await db.query.paymentLocations.findFirst({
        where: and(eq(paymentLocations.id, input.id), eq(paymentLocations.tenantId, tenantId)),
      });
      if (!loc) throw new TRPCError({ code: "NOT_FOUND", message: "Payment location not found" });
      return loc;
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      city: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      openingHours: z.string().optional(),
      supportedMethods: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const result = await db.insert(paymentLocations).values({
        tenantId: ctx.user!.tenantId as number,
        name: input.name,
        city: input.city,
        address: input.address,
        phone: input.phone,
        email: input.email,
        openingHours: input.openingHours,
        supportedMethods: input.supportedMethods ? JSON.stringify(input.supportedMethods) : null,
        status: "active",
      });
      return { id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      city: z.string().min(1).optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      openingHours: z.string().optional(),
      supportedMethods: z.array(z.string()).optional(),
      status: z.enum(["active", "inactive"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const { id, ...update } = input;
      if (Object.keys(update).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }
      await db.update(paymentLocations).set({
        ...update,
        supportedMethods: update.supportedMethods ? JSON.stringify(update.supportedMethods) : undefined,
      }).where(and(eq(paymentLocations.id, id), eq(paymentLocations.tenantId, tenantId)));
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      await db.delete(paymentLocations).where(and(eq(paymentLocations.id, input.id), eq(paymentLocations.tenantId, tenantId)));
      return { success: true };
    }),
});
