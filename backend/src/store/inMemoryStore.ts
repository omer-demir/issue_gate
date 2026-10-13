import type { AccountKdfRecord, ItemRecord, RefreshTokenRecord, UserRecord } from "../types";
import type { DocumentStore } from "./documentStore";

/**
 * MVP/dev/test implementation of {@link DocumentStore}. Single-process,
 * in-memory, not durable. A production deployment swaps this for a real
 * NoSQL document store (ADR-0006) behind the same interface; no service
 * code changes. JavaScript's single-threaded event loop makes the
 * synchronous mutations below effectively atomic per key, modeling a NoSQL
 * store's conditional-write guarantee.
 */
export class InMemoryDocumentStore implements DocumentStore {
  private usersByEmail = new Map<string, UserRecord>();
  private usersById = new Map<string, UserRecord>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private accountKdf = new Map<string, AccountKdfRecord>();
  private items = new Map<string, Map<string, ItemRecord>>();
  private changeSeqCounter = new Map<string, number>();
  private changeFloor = new Map<string, number>();

  async createUser(user: UserRecord): Promise<void> {
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.usersById.set(user.userId, user);
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    return this.usersById.get(userId) ?? null;
  }

  async createRefreshToken(token: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(token.tokenId, token);
  }

  async getRefreshToken(tokenId: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenId) ?? null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const existing = this.refreshTokens.get(tokenId);
    if (existing) {
      this.refreshTokens.set(tokenId, { ...existing, revoked: true });
    }
  }

  async getAccountKdf(ownerId: string): Promise<AccountKdfRecord | null> {
    return this.accountKdf.get(ownerId) ?? null;
  }

  async createAccountKdf(record: AccountKdfRecord): Promise<void> {
    this.accountKdf.set(record.ownerId, record);
  }

  async getItem(ownerId: string, itemId: string): Promise<ItemRecord | null> {
    return this.items.get(ownerId)?.get(itemId) ?? null;
  }

  async putItem(
    ownerId: string,
    itemId: string,
    mutate: (current: ItemRecord | null) => ItemRecord | null
  ): Promise<ItemRecord | null> {
    let ownerItems = this.items.get(ownerId);
    if (!ownerItems) {
      ownerItems = new Map();
      this.items.set(ownerId, ownerItems);
    }
    const current = ownerItems.get(itemId) ?? null;
    const next = mutate(current);
    if (next === null) {
      return current;
    }
    ownerItems.set(itemId, next);
    return next;
  }

  async queryChangesSince(ownerId: string, cursor: number, limit: number): Promise<ItemRecord[]> {
    const ownerItems = this.items.get(ownerId);
    if (!ownerItems) return [];
    return [...ownerItems.values()]
      .filter((item) => item.changeSeq > cursor)
      .sort((a, b) => a.changeSeq - b.changeSeq)
      .slice(0, limit);
  }

  async getChangeFloor(ownerId: string): Promise<number> {
    return this.changeFloor.get(ownerId) ?? 0;
  }

  /** Allocates the next monotonic change-sequence number for `ownerId`. */
  nextChangeSeq(ownerId: string): number {
    const next = (this.changeSeqCounter.get(ownerId) ?? 0) + 1;
    this.changeSeqCounter.set(ownerId, next);
    return next;
  }

  /**
   * Test/compaction helper: simulates a retention policy by raising the
   * change floor to `floor`, modeling what a background compaction job would
   * do in a real deployment. Not part of the {@link DocumentStore} contract
   * since production compaction is an infrastructure concern.
   */
  setChangeFloorForTesting(ownerId: string, floor: number): void {
    this.changeFloor.set(ownerId, floor);
  }
}
