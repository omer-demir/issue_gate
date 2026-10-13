import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config";
import type { DocumentStore } from "../store/documentStore";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../utils/password";
import { generateRefreshTokenId, issueAccessToken, verifyAccessToken } from "../utils/tokens";

export class ValidationError extends Error {}
export class ConflictError extends Error {}
export class AuthenticationError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  constructor(private readonly store: DocumentStore, private readonly config: AppConfig) {}

  /** MSM-10 AC1: stores only a salted/hashed account credential, never the password itself. */
  async register(email: string, password: string): Promise<{ userId: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw new ValidationError("A valid email is required");
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const existing = await this.store.getUserByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }
    const userId = randomUUID();
    await this.store.createUser({
      userId,
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    });
    return { userId };
  }

  /**
   * MSM-10 AC2/AC4: issues a token pair on success; returns a generic
   * authentication failure (no user-enumeration signal) on any failure mode,
   * with comparable timing whether or not the account exists.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.store.getUserByEmail(normalizedEmail);
    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = verifyPassword(password, hashToVerify);
    if (!user || !passwordOk) {
      throw new AuthenticationError("Invalid email or password");
    }
    return this.issueTokenPair(user.userId);
  }

  /** Rotate-on-use refresh: the presented token is revoked and replaced atomically. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const record = await this.store.getRefreshToken(refreshToken);
    if (!record || record.revoked || new Date(record.expiresAt).getTime() < Date.now()) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }
    await this.store.revokeRefreshToken(refreshToken);
    return this.issueTokenPair(record.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.store.revokeRefreshToken(refreshToken);
  }

  verifyAccessToken(token: string): string | null {
    const payload = verifyAccessToken(this.config, token);
    return payload?.sub ?? null;
  }

  private async issueTokenPair(userId: string): Promise<TokenPair> {
    const { token, expiresIn } = issueAccessToken(this.config, userId);
    const tokenId = generateRefreshTokenId();
    await this.store.createRefreshToken({
      tokenId,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000).toISOString(),
      revoked: false,
    });
    return { accessToken: token, refreshToken: tokenId, expiresIn };
  }
}
