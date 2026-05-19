import * as jose from "jose";
import { env } from "../lib/env";
import type { SessionPayload } from "./types";
import { randomUUID } from "crypto";

const JWT_ALG = "HS256";
const ISSUER = "psb-erp";
const EXPIRY = "24h"; // Shorter token expiry

function getSigningKey(): Uint8Array | Buffer {
  const secret = env.appSecret;
  if (!secret || secret.length === 0) {
    throw new Error("APP_SECRET missing in environment");
  }
  if (secret.length < 32 && env.isProduction) {
    throw new Error("APP_SECRET must be at least 32 characters in production.");
  }
  if (secret.length < 32) {
    console.warn("[session] APP_SECRET is shorter than recommended (32+ chars).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  console.log("[session]", "APP_SECRET exists:", !!process.env.APP_SECRET);
  const key = getSigningKey();
  const builder = new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .setJti(randomUUID())
    .setIssuer(ISSUER);

  if (payload.clientId) {
    builder.setAudience(payload.clientId);
  }

  return builder.sign(key);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) {
    console.warn("[session] No token provided for verification.");
    return null;
  }
  try {
    console.log("[verify]", "APP_SECRET exists:", !!process.env.APP_SECRET);
    const key = getSigningKey();
    const verifyOpts: Record<string, any> = { algorithms: [JWT_ALG], issuer: ISSUER };
    if (env.appId) {
      verifyOpts.audience = env.appId;
    }
    const { payload } = await jose.jwtVerify(token, key, verifyOpts);
    const { unionId, clientId } = payload as Record<string, unknown>;
    if (!unionId || !clientId) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    return { unionId: String(unionId), clientId: String(clientId) } as SessionPayload;
  } catch (error: any) {
    console.warn("[session] JWT verification failed:", error?.message || error);
    return null;
  }
}

if (!env.appSecret) {
  throw new Error("APP_SECRET missing in environment");
}
