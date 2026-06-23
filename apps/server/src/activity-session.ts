import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./domain.js";

interface ActivitySessionPayload {
  exp: number;
  user: SessionUser;
}

export const activitySessionMaxAgeMs = 1000 * 60 * 60 * 24 * 7;

export function createActivitySessionToken(
  user: SessionUser,
  secret: string,
  now = Date.now(),
  maxAgeMs = activitySessionMaxAgeMs
): string {
  const payload = encodeBase64Url(
    JSON.stringify({
      exp: now + maxAgeMs,
      user
    } satisfies ActivitySessionPayload)
  );
  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function verifyActivitySessionToken(token: string | null | undefined, secret: string, now = Date.now()): SessionUser | null {
  if (!token) {
    return null;
  }

  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra !== undefined || !isValidSignature(payload, signature, secret)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<ActivitySessionPayload>;

    if (typeof parsed.exp !== "number" || parsed.exp < now || !isSessionUser(parsed.user)) {
      return null;
    }

    return parsed.user;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isValidSignature(payload: string, signature: string, secret: string): boolean {
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Partial<SessionUser>;

  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.displayName === "string" &&
    (typeof user.avatarUrl === "string" || user.avatarUrl === null) &&
    (typeof user.tagName === "string" || user.tagName === null) &&
    Boolean(user.notificationPreferences) &&
    typeof user.notificationPreferences === "object" &&
    Array.isArray(user.roles) &&
    user.roles.every((role) => typeof role === "string") &&
    typeof user.isAdmin === "boolean"
  );
}
