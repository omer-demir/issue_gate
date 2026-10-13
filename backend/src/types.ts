/**
 * Domain types shared across services/routes. These mirror the wire/storage
 * shapes defined in ADR-0003 (API/auth/conflict contract) and ADR-0006
 * (NoSQL document-store rendering of that contract). No field here ever
 * holds plaintext secret content — only opaque ciphertext and non-secret
 * metadata, per the zero-knowledge trust boundary (ADR-0001).
 */

export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface RefreshTokenRecord {
  tokenId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

export interface AccountKdfRecord {
  ownerId: string;
  saltRef: string;
  salt: string;
  kdfParams: Record<string, unknown>;
  kdfParamsVersion: number;
  updatedAt: string;
}

/** One secret item, stored as an opaque ciphertext envelope (ADR-0003 §item schema). */
export interface ItemRecord {
  itemId: string;
  ownerId: string;
  ciphertext: string | null;
  nonce: string | null;
  algo: string | null;
  kdfParams: Record<string, unknown> | null;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  changeSeq: number;
}

export interface ChangeFeedPage {
  items: ItemRecord[];
  nextCursor: number;
  hasMore: boolean;
}
