import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  // Default to 'Lax' for improved CSRF protection. Allow opt-in to 'None'
  // via env var `SESSION_SAMESITE_NONE=true` when cross-site cookies are required.
  const allowSameSiteNone =
    (process.env.SESSION_SAMESITE_NONE || "").toLowerCase() === "true" ||
    (process.env.ALLOW_CROSS_SITE_COOKIES || "").toLowerCase() === "true";

  const sameSiteValue = localhost ? "Lax" : allowSameSiteNone ? "None" : "Lax";
  const secureValue = !localhost && process.env.FORCE_COOKIE_SECURE !== "false";

  return {
    httpOnly: true,
    path: "/",
    sameSite: sameSiteValue,
    secure: secureValue,
  };
}
