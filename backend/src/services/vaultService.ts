import { randomUUID } from "node:crypto";
import type { DocumentStore } from "../store/documentStore";
import type { AccountKdfRecord } from "../types";

export class ValidationError extends Error {}
export class ConflictError extends Error {}

export interface VaultSetupInput {
  salt: string;
  kdfParams: Record<string, unknown>;
  kdfParamsVersion?: number;
}

export type VaultBootstrapResponse =
  | { provisioned: false }
  | {
      provisioned: true;
      saltRef: string;
      salt: string;
      kdfParams: Record<string, unknown>;
      kdfParamsVersion: number;
    };

/**
 * MSM-11: issues/receives only the per-vault KDF salt and parameters, never
 * the master password or any derived key (the backend has no code path that
 * could even receive those — this service's inputs are limited to salt/KDF
 * metadata).
 */
export class VaultService {
  constructor(private readonly store: DocumentStore) {}

  async setup(ownerId: string, input: VaultSetupInput): Promise<AccountKdfRecord> {
    if (typeof input.salt !== "string" || input.salt.length === 0) {
      throw new ValidationError("salt is required");
    }
    if (typeof input.kdfParams !== "object" || input.kdfParams === null) {
      throw new ValidationError("kdfParams is required");
    }
    const existing = await this.store.getAccountKdf(ownerId);
    if (existing) {
      throw new ConflictError("Vault is already provisioned for this account");
    }
    const record: AccountKdfRecord = {
      ownerId,
      saltRef: randomUUID(),
      salt: input.salt,
      kdfParams: input.kdfParams,
      kdfParamsVersion: input.kdfParamsVersion ?? 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.createAccountKdf(record);
    return record;
  }

  async getBootstrap(ownerId: string): Promise<VaultBootstrapResponse> {
    const record = await this.store.getAccountKdf(ownerId);
    if (!record) {
      return { provisioned: false };
    }
    return {
      provisioned: true,
      saltRef: record.saltRef,
      salt: record.salt,
      kdfParams: record.kdfParams,
      kdfParamsVersion: record.kdfParamsVersion,
    };
  }
}
