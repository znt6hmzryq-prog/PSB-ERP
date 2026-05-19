import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { tenants, subscriptions } from "@db/schema";
import { eq } from "drizzle-orm";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const ALLOWED_FOR_PENDING = new Set([
  "auth.me",
  "auth.logout",
  "auth.updateProfile",
  "settings.get",
  "settings.list",
  "registration.verifyToken",
  "registration.register",
]);

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const path = (opts.path || "").toString();

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  // Check tenant status (only block serious states) and subscription expiry/status
  if (ctx.user.tenantId) {
    const db = getDb();
    const tenant = await db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, ctx.user.tenantId))
      .limit(1);

    if (tenant[0]) {
      const status = tenant[0].status;
      if (status === "rejected") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account registration was rejected. Please contact support." });
      }
      if (status === "suspended") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account suspended. Please contact support." });
      }
      if (status === "cancelled") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account cancelled. Please contact support." });
      }

      const sub = await db
        .select({ id: subscriptions.id, status: subscriptions.status, expiresAt: subscriptions.expiresAt })
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, ctx.user.tenantId))
        .limit(1);

      if (sub[0]) {
        // Expiry handling first
        if (sub[0].expiresAt && new Date(sub[0].expiresAt) < new Date()) {
          await db.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.tenantId, ctx.user.tenantId));
          throw new TRPCError({ code: "FORBIDDEN", message: "Subscription expired. Please renew your package." });
        }
        if (sub[0].status === "expired") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Subscription expired. Please renew your package." });
        }

        // If subscription is not active, block ERP routes for non-super-admins,
        // but allow a small set of procedures used by the activation page.
        if (sub[0].status !== "active" && ctx.user.role !== "super_admin" && !ALLOWED_FOR_PENDING.has(path)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Subscription not active. Complete payment verification at the office or via the Payment Activation page." });
        }
      }
    }
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

function requireAnyRole(...roles: string[]) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || !roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
export const superAdminQuery = authedQuery.use(requireRole("super_admin"));
export const tenantAdminQuery = authedQuery.use(requireAnyRole("admin", "super_admin"));
export const managerQuery = authedQuery.use(requireAnyRole("manager", "admin", "super_admin"));
export const accountantQuery = authedQuery.use(requireAnyRole("accountant", "admin", "super_admin"));
export const agentQuery = authedQuery.use(requireAnyRole("agent", "accountant", "manager", "admin", "super_admin"));
