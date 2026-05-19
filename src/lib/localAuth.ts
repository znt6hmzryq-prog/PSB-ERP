// LocalStorage-based dev-only auth (disabled in production builds).
// Demo credentials must never be enabled in production. They are guarded
// by `import.meta.env.DEV` so production bundles will not expose them.

const AUTH_KEY = "psb-erp-auth";
const AUTH_EXPIRY_KEY = "psb-erp-auth-expiry";

export interface LocalUser {
  id: number;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "manager" | "accountant" | "agent" | "viewer";
  avatar?: string;
  department: string;
}

// Enabled only in development builds. Vite replaces `import.meta.env.DEV`
// at build time so this flag is false in production and demo users will
// be removed by minification/tree-shaking.
const ENABLE_DEMO_AUTH = import.meta.env.DEV === true;

export const isLocalDemoAuthEnabled = ENABLE_DEMO_AUTH;

const DEMO_USERS: Record<string, { user: LocalUser; password: string }> =
  ENABLE_DEMO_AUTH
    ? {
        "admin@psb-erp.com": {
          user: { id: 1, name: "Super Admin", email: "admin@psb-erp.com", role: "super_admin", department: "Management" },
          password: "admin123",
        },
        "manager@psb-erp.com": {
          user: { id: 2, name: "Marcus Johnson", email: "manager@psb-erp.com", role: "manager", department: "Operations" },
          password: "manager123",
        },
        "agent@psb-erp.com": {
          user: { id: 3, name: "David Kim", email: "agent@psb-erp.com", role: "agent", department: "Sales" },
          password: "agent123",
        },
      }
    : {};

export function loginLocal(email: string, password: string): LocalUser | null {
  if (!ENABLE_DEMO_AUTH) return null;
  const entry = DEMO_USERS[email.toLowerCase()];
  if (!entry || entry.password !== password) return null;
  const expiry = Date.now() + 1000 * 60 * 60 * 24; // 24 hours
  localStorage.setItem(AUTH_KEY, JSON.stringify(entry.user));
  localStorage.setItem(AUTH_EXPIRY_KEY, expiry.toString());
  return entry.user;
}

export function getLocalUser(): LocalUser | null {
  try {
    if (!ENABLE_DEMO_AUTH) {
      // Ensure any leftover dev/demo credentials are cleared in production.
      logoutLocal();
      return null;
    }
    const expiry = localStorage.getItem(AUTH_EXPIRY_KEY);
    if (expiry && Date.now() > Number(expiry)) {
      logoutLocal();
      return null;
    }
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalUser;
  } catch {
    return null;
  }
}

export function logoutLocal() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_EXPIRY_KEY);
}

export function isAuthenticated(): boolean {
  return getLocalUser() !== null;
}
