import type { InMemoryDocumentStore } from "../store/inMemoryStore";
import type { ChangeFeedPage, ItemRecord } from "../types";

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class GoneError extends Error {}
export class VersionConflictError extends Error {
  constructor(public readonly yourItem: unknown, public readonly serverItem: ItemRecord | null) {
    super("version_conflict");
  }
}

export interface ItemUpsertInput {
  expectedRevision: number;
  ciphertext: string;
  nonce: string;
  algo: string;
  kdfParams?: Record<string, unknown> | null;
  schemaVersion: number;
}

/**
 * MSM-12/MSM-13: opaque ciphertext-blob storage with optimistic-concurrency
 * upsert, tombstoned delete, and a cursor-paginated change feed. No method
 * here ever inspects `ciphertext`/`nonce` content — they are stored and
 * returned verbatim (ADR-0001 zero-knowledge boundary).
 */
export class ItemsService {
  constructor(private readonly store: InMemoryDocumentStore, private readonly pageSize: number) {}

  async getItem(ownerId: string, itemId: string): Promise<ItemRecord> {
    const current = await this.store.getItem(ownerId, itemId);
    if (!current) throw new NotFoundError("Item not found");
    if (current.deletedAt) throw new GoneError("Item has been deleted");
    return current;
  }

  /**
   * Upsert with optimistic concurrency (MSM-12 AC1/AC2). `expectedRevision`
   * must be 0 for a brand-new item, or equal to the stored revision
   * (including a tombstoned item's revision, allowing resurrection) for an
   * update; any mismatch raises {@link VersionConflictError} without
   * applying the write.
   */
  async upsert(ownerId: string, itemId: string, input: ItemUpsertInput): Promise<{ item: ItemRecord; created: boolean }> {
    this.validate(input);

    let created = false;
    let conflict: VersionConflictError | null = null;

    const result = await this.store.putItem(ownerId, itemId, (current) => {
      const currentRevision = current?.revision ?? 0;
      if (input.expectedRevision !== currentRevision) {
        conflict = new VersionConflictError({ itemId, ...input }, current);
        return null; // abort: no write persisted
      }
      created = current === null;
      const now = new Date().toISOString();
      const changeSeq = this.store.nextChangeSeq(ownerId);
      const next: ItemRecord = {
        itemId,
        ownerId,
        ciphertext: input.ciphertext,
        nonce: input.nonce,
        algo: input.algo,
        kdfParams: input.kdfParams ?? null,
        schemaVersion: input.schemaVersion,
        revision: currentRevision + 1,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        changeSeq,
      };
      return next;
    });

    if (conflict) throw conflict;
    // result is guaranteed non-null here: the only path that returns null
    // from `mutate` also sets `conflict`, which is thrown above.
    return { item: result as ItemRecord, created };
  }

  /** Tombstoned delete with the same optimistic-concurrency contract as upsert. */
  async delete(ownerId: string, itemId: string, expectedRevision: number): Promise<ItemRecord> {
    const existing = await this.store.getItem(ownerId, itemId);
    if (!existing) throw new NotFoundError("Item not found");
    if (existing.deletedAt) throw new GoneError("Item has already been deleted");

    let conflict: VersionConflictError | null = null;
    const result = await this.store.putItem(ownerId, itemId, (current) => {
      if (!current || current.revision !== expectedRevision) {
        conflict = new VersionConflictError({ itemId, expectedRevision }, current);
        return null;
      }
      const now = new Date().toISOString();
      const changeSeq = this.store.nextChangeSeq(ownerId);
      const next: ItemRecord = {
        ...current,
        ciphertext: null,
        nonce: null,
        algo: null,
        kdfParams: null,
        revision: current.revision + 1,
        updatedAt: now,
        deletedAt: now,
        changeSeq,
      };
      return next;
    });

    if (conflict) throw conflict;
    return result as ItemRecord;
  }

  /**
   * MSM-13: returns only changes after `cursor` (inclusive of tombstones).
   * Rejects a cursor older than the owner's retained change floor by
   * signaling that a full resync is required, rather than silently
   * returning a partial/empty page.
   */
  async getChanges(ownerId: string, cursor: number): Promise<ChangeFeedPage> {
    if (!Number.isInteger(cursor) || cursor < 0) {
      throw new ValidationError("cursor must be a non-negative integer");
    }
    const floor = await this.store.getChangeFloor(ownerId);
    if (cursor < floor) {
      throw new GoneError("cursor_expired");
    }
    const page = await this.store.queryChangesSince(ownerId, cursor, this.pageSize);
    const nextCursor = page.length > 0 ? page[page.length - 1].changeSeq : cursor;
    const hasMore = page.length === this.pageSize;
    return { items: page, nextCursor, hasMore };
  }

  private validate(input: ItemUpsertInput): void {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new ValidationError("expectedRevision must be a non-negative integer");
    }
    if (typeof input.ciphertext !== "string" || input.ciphertext.length === 0) {
      throw new ValidationError("ciphertext is required");
    }
    if (typeof input.nonce !== "string" || input.nonce.length === 0) {
      throw new ValidationError("nonce is required");
    }
    if (typeof input.algo !== "string" || input.algo.length === 0) {
      throw new ValidationError("algo is required");
    }
    if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
      throw new ValidationError("schemaVersion must be a positive integer");
    }
  }
}
