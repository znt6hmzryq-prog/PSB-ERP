import { z } from "zod";
import * as cookie from "cookie";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, sessions, tenants, subscriptions } from "@db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { verifyPassword } from "./lib/password";
import { signSessionToken } from "./kimi/session";

// ─── LOGIN RATE LIMITING ────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now > record.resetAt) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

export const authRouter = createRouter({
  // FIXED
  me: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const user = ctx.user!;

    // Super admin has no tenant
    if (!user.tenantId) {
      return user;
    }

    const subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, user.tenantId))
      .limit(1);

    const tenant = await db
      .select({
        registrationToken: tenants.registrationToken,
      })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    return {
      ...user,
      subscription: subscription[0] || null,
      registrationToken:
        tenant[0]?.registrationToken || null,
    };
  }),

  // ─── EMAIL/PASSWORD LOGIN ──────────────────────────────────────────────────
  login: publicQuery
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rateLimitKey =
        input.email.toLowerCase().trim();

      if (!checkRateLimit(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many failed login attempts. Please try again in 15 minutes.",
        });
      }

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user[0] || !user[0].passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Invalid email or password",
        });
      }

      if (
        !verifyPassword(
          input.password,
          user[0].passwordHash
        )
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Invalid email or password",
        });
      }

      loginAttempts.delete(
        rateLimitKey
      );

      // Check tenant status
      if (user[0].tenantId) {
        const tenant = await db
          .select({
            status: tenants.status,
          })
          .from(tenants)
          .where(
            eq(
              tenants.id,
              user[0].tenantId
            )
          )
          .limit(1);

        if (tenant[0]) {
          const status =
            tenant[0].status;

          if (
            status === "rejected"
          ) {
            throw new TRPCError({
              code:
                "FORBIDDEN",
              message:
                "Account registration was rejected. Please contact support.",
            });
          }

          if (
            status === "suspended"
          ) {
            throw new TRPCError({
              code:
                "FORBIDDEN",
              message:
                "Account suspended. Please contact support.",
            });
          }

          if (
            status === "cancelled"
          ) {
            throw new TRPCError({
              code:
                "FORBIDDEN",
              message:
                "Account cancelled. Please contact support.",
            });
          }

          // Subscription expiry check
          const sub = await db
            .select({
              status:
                subscriptions.status,
              expiresAt:
                subscriptions.expiresAt,
            })
            .from(
              subscriptions
            )
            .where(
              eq(
                subscriptions.tenantId,
                user[0].tenantId
              )
            )
            .limit(1);

          if (sub[0]) {
            if (
              sub[0].status ===
              "expired"
            ) {
              throw new TRPCError({
                code:
                  "FORBIDDEN",
                message:
                  "Subscription expired. Please renew your package.",
              });
            }

            if (
              sub[0].expiresAt &&
              new Date(
                sub[0].expiresAt
              ) < new Date()
            ) {
              await db
                .update(
                  subscriptions
                )
                .set({
                  status:
                    "expired",
                })
                .where(
                  eq(
                    subscriptions.tenantId,
                    user[0].tenantId
                  )
                );

              throw new TRPCError({
                code:
                  "FORBIDDEN",
                message:
                  "Subscription expired. Please renew your package.",
              });
            }
          }
        }
      }

      console.log(
        "[login] Signing for unionId:",
        user[0].unionId
      );

      const token =
        await signSessionToken({
          unionId:
            user[0].unionId,
          clientId:
            "psb-erp",
        });

      console.log(
        "[login] Token length:",
        token.length
      );

      const opts =
        getSessionCookieOptions(
          ctx.req.headers
        );

      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(
          Session.cookieName,
          token,
          {
            httpOnly:
              opts.httpOnly,
            path: opts.path,
            sameSite:
              opts.sameSite?.toLowerCase() as
                | "lax"
                | "none",
            secure:
              opts.secure,
            maxAge:
              Session.maxAgeMs /
              1000,
          }
        )
      );

      return {
        user: {
          id: user[0].id,
          name: user[0].name,
          email:
            user[0].email,
          role:
            user[0].role,
          tenantId:
            user[0].tenantId,
          avatar:
            user[0].avatar,
        },
      };
    }),

  logout: authedQuery.mutation(
    async ({ ctx }) => {
      const opts =
        getSessionCookieOptions(
          ctx.req.headers
        );

      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(
          Session.cookieName,
          "",
          {
            httpOnly:
              opts.httpOnly,
            path: opts.path,
            sameSite:
              opts.sameSite?.toLowerCase() as
                | "lax"
                | "none",
            secure:
              opts.secure,
            maxAge: 0,
          }
        )
      );

      return {
        success: true,
      };
    }
  ),

  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const userId =
        ctx.user!.id;

      const update: Record<
        string,
        string | null
      > = {};

      if (
        input.name !== undefined
      )
        update.name =
          input.name;

      if (
        input.email !== undefined
      )
        update.email =
          input.email;

      if (
        input.phone !== undefined
      )
        update.phone =
          input.phone;

      if (
        input.department !==
        undefined
      )
        update.department =
          input.department;

      if (
        Object.keys(update)
          .length === 0
      ) {
        return {
          success: true,
        };
      }

      await db
        .update(users)
        .set(update)
        .where(
          eq(
            users.id,
            userId
          )
        );

      return {
        success: true,
      };
    }),

  sessions: authedQuery.query(
    async ({ ctx }) => {
      const db = getDb();
      const userId =
        ctx.user!.id;

      return db
        .select()
        .from(sessions)
        .where(
          and(
            eq(
              sessions.userId,
              userId
            ),
            gt(
              sessions.expiresAt,
              new Date()
            )
          )
        )
        .orderBy(
          desc(
            sessions.createdAt
          )
        );
    }
  ),
});