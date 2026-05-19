import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tenants, users, subscriptions } from "@db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/password";
import { nextNumber } from "./lib/numbering";


function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const registrationRouter = createRouter({
  // ─── REGISTER AGENCY ───────────────────────────────────────────────────────
  register: publicQuery
    .input(
      z.object({
        agencyName: z.string().min(2).max(255),
        ownerName: z.string().min(2).max(255),
        email: z.string().email().max(320),
        phone: z.string().min(5).max(50),
        address: z.string().min(5).max(500),
        city: z.string().min(2).max(100),
        password: z.string().min(8).max(100),
        plan: z.enum(["starter", "professional", "enterprise"]),
        durationMonths: z.number().int().min(1).max(12),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      // ── VALIDATIONS ──
      // Check duplicate email
      const existingEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existingEmail.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      // Check duplicate agency name / slug
      const slug = slugify(input.agencyName);
      const existingSlug = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (existingSlug.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Agency name already taken" });
      }

      // ── CREATE TENANT ──
      const tenantResult = await db.insert(tenants).values({
        name: input.agencyName,
        slug,
        status: "pending",
        plan: input.plan,
        ownerName: input.ownerName,
        ownerEmail: input.email,
        ownerPhone: input.phone,
        address: input.address,
        city: input.city,
      });
      const tenantId = Number(tenantResult[0].insertId);

      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      // Ensure tenant status persisted as "pending" (some inserts observed empty status)
      await db.update(tenants).set({ status: "pending" }).where(eq(tenants.id, tenantId));

      // ── GENERATE REGISTRATION TOKEN ──
      const regToken = await nextNumber(db, tenantId, "REG");

      await db
        .update(tenants)
        .set({ registrationToken: regToken })
        .where(eq(tenants.id, tenantId));

      // ── CREATE ADMIN USER ──
      const passwordHash = hashPassword(input.password);
      const userResult = await db.insert(users).values({
        unionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        passwordHash,
        tenantId,
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        role: "admin",
        status: "active",
      });
      const userId = Number(userResult[0].insertId);

      // ── CREATE SUBSCRIPTION ──
      await db.insert(subscriptions).values({
        tenantId,
        plan: input.plan,
        durationMonths: input.durationMonths,
        status: "pending",
      });

      const subscription = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);

      return {
        success: true,
        tenantId,
        userId,
        token: regToken,
        agencyName: input.agencyName,
        plan: input.plan,
        durationMonths: input.durationMonths,
      };
    }),

  // ─── VERIFY TOKEN ──────────────────────────────────────────────────────────
  verifyToken: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const tenant = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
          plan: tenants.plan,
          ownerName: tenants.ownerName,
          ownerEmail: tenants.ownerEmail,
          ownerPhone: tenants.ownerPhone,
          address: tenants.address,
          city: tenants.city,
          registrationToken: tenants.registrationToken,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .where(eq(tenants.registrationToken, input.token))
        .limit(1);

      if (!tenant[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid registration token" });
      }

      const sub = await db
        .select({ durationMonths: subscriptions.durationMonths, status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenant[0].id))
        .limit(1);

      return {
        ...tenant[0],
        durationMonths: sub[0]?.durationMonths ?? 1,
        subscriptionStatus: sub[0]?.status ?? "pending",
      };
    }),
});
