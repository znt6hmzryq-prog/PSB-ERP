import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, tenantAdminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, tenants } from "@db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { hashPassword } from "./lib/password";
import { auditLog } from "./lib/audit";

/** Plan user limits (frontend promises: Starter=3, Professional=10, Enterprise=unlimited) */
const PLAN_USER_LIMITS: Record<string, number> = {
  free: 1,
  starter: 3,
  professional: 10,
  enterprise: 9999,
};

/** Staff roles that an admin can create within their agency */
const STAFF_ROLES = ["manager", "accountant", "agent", "viewer"] as const;

export const usersRouter = createRouter({
  // ─── LIST USERS IN CURRENT TENANT ──────────────────────────────────────────
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    const items = await db.query.users.findMany({
      where: eq(users.tenantId, tenantId),
      orderBy: [desc(users.createdAt)],
    });

    return { items };
  }),

  // ─── GET SINGLE USER (tenant-scoped) ───────────────────────────────────────
  get: tenantAdminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      const item = await db.query.users.findFirst({
        where: and(eq(users.id, input.id), eq(users.tenantId, tenantId)),
      });

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return item;
    }),

  // ─── CREATE USER (with plan limit enforcement) ─────────────────────────────
  create: tenantAdminQuery
    .input(
      z.object({
        name: z.string().min(2).max(255),
        email: z.string().email().max(320),
        password: z.string().min(8).max(100),
        role: z.enum(STAFF_ROLES),
        department: z.string().max(100).optional(),
        phone: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;

      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform users cannot create agency staff" });
      }

      // ── CHECK PLAN LIMIT ──
      const tenant = await db
        .select({ plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }

      const plan = tenant[0].plan;
      const limit = PLAN_USER_LIMITS[plan] ?? 1;

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.tenantId, tenantId));

      const currentCount = countResult[0]?.count ?? 0;
      if (currentCount >= limit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `User limit reached for your ${plan} plan (${limit} users). Please upgrade to add more users.`,
        });
      }

      // ── CHECK DUPLICATE EMAIL ──
      const existingEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingEmail.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      // ── CREATE USER ──
      const passwordHash = hashPassword(input.password);
      const result = await db.insert(users).values({
        unionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        passwordHash,
        tenantId,
        name: input.name,
        email: input.email,
        role: input.role,
        status: "active",
        department: input.department || null,
        phone: input.phone || null,
      });

      const userId = Number(result[0].insertId);

      await auditLog({
        ctx,
        action: "create_user",
        entityType: "user",
        entityId: userId,
        newValues: { name: input.name, email: input.email, role: input.role },
      });

      return {
        success: true,
        userId,
        message: `User created successfully. You are using ${currentCount + 1} of ${limit} users on your ${plan} plan.`,
      };
    }),

  // ─── UPDATE USER ───────────────────────────────────────────────────────────
  update: tenantAdminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(2).max(255).optional(),
        email: z.string().email().max(320).optional(),
        role: z.enum(STAFF_ROLES).optional(),
        department: z.string().max(100).optional(),
        phone: z.string().max(50).optional(),
        status: z.enum(["active", "inactive", "suspended"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const editorRole = ctx.user!.role;

      // Verify target user belongs to same tenant
      const target = await db
        .select({ id: users.id, name: users.name, role: users.role, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!target[0] || target[0].tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Admin cannot modify another admin or super_admin
      if (target[0].role === "admin" && editorRole !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot modify admin users" });
      }

      const update: Record<string, unknown> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.email !== undefined) {
        // Check email uniqueness if changing
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, input.email), sql`${users.id} != ${input.id}`))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        }
        update.email = input.email;
      }
      if (input.role !== undefined) update.role = input.role;
      if (input.department !== undefined) update.department = input.department;
      if (input.phone !== undefined) update.phone = input.phone;
      if (input.status !== undefined) update.status = input.status;

      if (Object.keys(update).length === 0) {
        return { success: true };
      }

      await db.update(users).set(update).where(eq(users.id, input.id));

      await auditLog({
        ctx,
        action: "update_user",
        entityType: "user",
        entityId: input.id,
        newValues: update,
      });

      return { success: true };
    }),

  // ─── DELETE USER ───────────────────────────────────────────────────────────
  delete: tenantAdminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const tenantId = ctx.user!.tenantId as number;
      const editorId = ctx.user!.id;
      const editorRole = ctx.user!.role;

      if (input.id === editorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete your own account" });
      }

      // Verify target user belongs to same tenant
      const target = await db
        .select({ id: users.id, name: users.name, role: users.role, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!target[0] || target[0].tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Admin cannot delete another admin or super_admin
      if (target[0].role === "admin" && editorRole !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete admin users" });
      }

      await db.delete(users).where(eq(users.id, input.id));

      await auditLog({
        ctx,
        action: "delete_user",
        entityType: "user",
        entityId: input.id,
        oldValues: { name: target[0].name },
      });

      return { success: true };
    }),

  // ─── PLAN USAGE ────────────────────────────────────────────────────────────
  planUsage: tenantAdminQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tenantId = ctx.user!.tenantId as number;

    if (!tenantId) {
      return { limit: 9999, used: 0, plan: "platform", canAdd: true };
    }

    const tenant = await db
      .select({ plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const plan = tenant[0]?.plan ?? "free";
    const limit = PLAN_USER_LIMITS[plan] ?? 1;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const used = countResult[0]?.count ?? 0;

    return {
      limit,
      used,
      plan,
      canAdd: used < limit,
      remaining: Math.max(0, limit - used),
    };
  }),
});
