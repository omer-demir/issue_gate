/**
 * Centralized runtime configuration. Reads from environment variables with
 * safe defaults for local development/testing only — production deployment
 * (MSM-17, infrastructure scope) is responsible for injecting real secrets
 * via a secrets manager, never committing them to source control.
 */
export interface AppConfig {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  changeFeedPageSize: number;
  /** Number of most-recent change-feed entries retained per owner before a
   * cursor referencing an older position is considered expired, forcing a
   * full resync (MSM-13 AC3). A real deployment would tune/compact this via
   * a background job (infrastructure concern); the in-memory store models
   * the same observable behavior for tests. */
  changeFeedRetention: number;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-insecure-secret-change-me";
  if (process.env.NODE_ENV === "production" && jwtSecret === "dev-insecure-secret-change-me") {
    throw new Error("JWT_SECRET must be set via a secrets mechanism in production");
  }
  return {
    jwtSecret,
    accessTokenTtlSeconds: readInt("ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
    refreshTokenTtlSeconds: readInt("REFRESH_TOKEN_TTL_SECONDS", 30 * 24 * 60 * 60),
    changeFeedPageSize: readInt("CHANGE_FEED_PAGE_SIZE", 50),
    changeFeedRetention: readInt("CHANGE_FEED_RETENTION", 1000),
  };
}
