import type { AccountKdfRecord, ItemRecord, RefreshTokenRecord, UserRecord } from "../types";

/**
 * Storage port (hexagonal-style) decoupling services from the storage
 * engine, per ADR-0006: the chosen engine is a NoSQL document store, but the
 * exact vendor (DynamoDB/Firestore/MongoDB) is an infrastructure-selectable
 * implementation detail. This interface is written in document-collection
 * terms (get/put by key, conditional put for optimistic concurrency, range
 * query by an indexed field) so any of those vendors can implement it
 * without changing service logic. `InMemoryDocumentStore` is the MVP/dev/test
 * implementation.
 */
export interface DocumentStore {
  // users collection, keyed by email (lowercased) for lookup + by userId
  createUser(user: UserRecord): Promise<void>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(userId: string): Promise<UserRecord | null>;

  // refreshTokens collection, keyed by tokenId
  createRefreshToken(token: RefreshTokenRecord): Promise<void>;
  getRefreshToken(tokenId: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(tokenId: string): Promise<void>;

  // accountKdf collection, keyed by ownerId
  getAccountKdf(ownerId: string): Promise<AccountKdfRecord | null>;
  createAccountKdf(record: AccountKdfRecord): Promise<void>;

  // items collection, keyed by (ownerId, itemId)
  getItem(ownerId: string, itemId: string): Promise<ItemRecord | null>;
  /**
   * Conditional put: applies `mutate` to the current record (or `null` if
   * none exists). If `mutate` returns `null`, no write is persisted (the
   * caller aborted, e.g. an optimistic-concurrency conflict) and the
   * previously-stored record (or `null`) is returned unchanged. Otherwise
   * the returned record is persisted atomically with respect to other
   * callers for the same (ownerId, itemId) and returned. Mirrors a NoSQL
   * store's native conditional-write mechanism (e.g. DynamoDB conditional
   * PutItem / Mongo findOneAndUpdate) used to implement optimistic
   * concurrency without a relational transaction.
   */
  putItem(
    ownerId: string,
    itemId: string,
    mutate: (current: ItemRecord | null) => ItemRecord | null
  ): Promise<ItemRecord | null>;

  /** Change-feed query: items for `ownerId` with changeSeq > cursor, ascending, capped at `limit`. */
  queryChangesSince(ownerId: string, cursor: number, limit: number): Promise<ItemRecord[]>;
  /** Lowest changeSeq still retained for `ownerId`; cursors below this are expired. */
  getChangeFloor(ownerId: string): Promise<number>;
}
