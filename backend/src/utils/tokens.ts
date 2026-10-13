import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../config";

export interface AccessTokenPayload {
  sub: string; // userId — the only source of truth for ownerId downstream
}

/**
 * Short-lived access token (MSM-10 AC2). Signed JWT so verification needs no
 * store lookup; `expiresIn` is enforced by the library, so expired tokens are
 * rejected outright.
 */
export function issueAccessToken(config: AppConfig, userId: string): { token: string; expiresIn: number } {
  const token = jwt.sign({ sub: userId } satisfies AccessTokenPayload, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSeconds,
  });
  return { token, expiresIn: config.accessTokenTtlSeconds };
}

export function verifyAccessToken(config: AppConfig, token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "object" && decoded !== null && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Opaque refresh token (MSM-10 AC2). Kept server-side as a revocable record
 * (not a stateless JWT) so logout/rotation can actually invalidate it —
 * rotation policy: each successful refresh revokes the prior token and
 * issues a new one (rotate-on-use), limiting replay of a stolen refresh
 * token to a single use.
 */
export function generateRefreshTokenId(): string {
  return randomUUID();
}
