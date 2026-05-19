import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import cookie from "cookie";
import { Session } from "@contracts/constants";
import { authenticateRequest } from "./kimi/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const cookieHeader = opts.req.headers.get("cookie") || "";
  const parsedCookies = cookie.parse(cookieHeader);
  const token = parsedCookies[Session.cookieName];
  console.log(
    "[context]",
    "Cookie:",
    Session.cookieName,
    "Token:",
    !!token
  );

  let user: User | undefined;

  if (token) {
    try {
      const authUser = await authenticateRequest(opts.req.headers);
      if (authUser) {
        user = authUser;
      }
    } catch (error) {
      console.warn("[context] Session authentication failed", error);
    }
  }

  // Dev fallback: bypass session verification in development
  if (!user && process.env.NODE_ENV !== "production") {
    const devAuthRaw = opts.req.headers.get("x-dev-auth");
    if (devAuthRaw) {
      try {
        const devUser = JSON.parse(devAuthRaw);
        user = {
          id: devUser.id ?? 1,
          unionId: devUser.unionId ?? `dev-${devUser.email}`,
          passwordHash: null,
          tenantId: devUser.tenantId ?? 1,
          name: devUser.name ?? "Dev User",
          email: devUser.email ?? "dev@localhost",
          avatar: devUser.avatar ?? null,
          role: devUser.role ?? "admin",
          status: "active",
          department: devUser.department ?? null,
          phone: null,
          lastSignInAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as User;
        console.log("[context] Dev fallback user:", user.email);
      } catch (e) {
        console.warn("[context] Dev fallback parse failed:", e);
      }
    }
  }

  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user,
  };
}