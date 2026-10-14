/** Wire-contract types mirroring backend/src/types.ts and routes (ADR-0003/0006). */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface KdfParams {
  algo: string;
  iterations: number;
  [key: string]: unknown;
}

export type VaultBootstrap =
  | { provisioned: false }
  | { provisioned: true; saltRef: string; salt: string; kdfParams: KdfParams; kdfParamsVersion: number };

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

export interface VersionConflict {
  error: "version_conflict";
  yourItem: unknown;
  serverItem: ItemRecord | null;
}

/** The well-known item that carries the wrapped-DEK blobs across devices (see README "Cross-device vault key sync"). */
export const VAULT_META_ITEM_ID = "__vault_meta__";
export const VAULT_META_ALGO = "vault-meta-v1";

export interface VaultMetaPayload {
  masterSalt: string;
  kdfParams: KdfParams;
  wrappedDekByMaster: { wrapped: string; nonce: string };
  recoverySalt: string;
  wrappedDekByRecovery: { wrapped: string; nonce: string };
}
