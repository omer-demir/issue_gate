"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, itemsApi, vaultApi } from "@/lib/api";
import {
  KDF_PARAMS_VERSION,
  PBKDF2_ITERATIONS,
  decryptJson,
  deriveMasterKey,
  deriveRecoveryKey,
  encryptJson,
  generateDek,
  generateRecoveryKey,
  generateSaltB64,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto";
import { VAULT_META_ALGO, VAULT_META_ITEM_ID, type VaultMetaPayload } from "@/lib/types";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSession } from "./SessionProvider";

export interface SecretData {
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
}

export interface SecretEntry {
  itemId: string;
  revision: number;
  data: SecretData;
  /** Queued locally but not yet confirmed by the backend (MSM-14 pending indicator). */
  pendingSync: boolean;
}

export interface ConflictState {
  itemId: string;
  yourData: SecretData;
  yourExpectedRevision: number;
  serverRevision: number;
  serverData: SecretData | null;
}

export type VaultStatus = "checking" | "not_provisioned" | "locked" | "unlocked";

interface VaultContextValue {
  status: VaultStatus;
  online: boolean;
  secrets: SecretEntry[];
  loading: boolean;
  error: string | null;
  conflict: ConflictState | null;
  checkBootstrap: () => Promise<void>;
  setupVault: (masterPassword: string) => Promise<{ recoveryKey: string }>;
  unlock: (masterPassword: string) => Promise<void>;
  recoverWithKit: (recoveryKey: string, newMasterPassword: string) => Promise<void>;
  lock: () => void;
  loadSecrets: () => Promise<void>;
  getSecret: (itemId: string) => SecretEntry | undefined;
  createSecret: (data: SecretData) => Promise<void>;
  updateSecret: (itemId: string, data: SecretData) => Promise<void>;
  deleteSecret: (itemId: string) => Promise<void>;
  resolveConflict: (choice: "mine" | "theirs") => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const INCORRECT_PASSWORD_MESSAGE = "Incorrect master password, or Recovery Kit is for a different vault.";

export function VaultProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useSession();
  const online = useOnlineStatus();

  const [status, setStatus] = useState<VaultStatus>("checking");
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{ itemId: string; data: SecretData; isNew: boolean } | null>(null);

  // In-memory only: the unlocked DEK must never be persisted (MSM-5 AC1, MSM-3 AC1).
  const dekRef = useRef<CryptoKey | null>(null);

  const requireToken = useCallback((): string => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  }, [accessToken]);

  const checkBootstrap = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const token = requireToken();
      const bootstrap = await vaultApi.getBootstrap(token);
      setStatus(bootstrap.provisioned ? "locked" : "not_provisioned");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? "You appear to be offline." : "Could not reach the server.");
      setStatus("not_provisioned");
    }
  }, [requireToken]);

  const setupVault = useCallback(
    async (masterPassword: string): Promise<{ recoveryKey: string }> => {
      const token = requireToken();
      const masterSalt = generateSaltB64();
      const kdfParams = { algo: "PBKDF2-SHA256" as const, iterations: PBKDF2_ITERATIONS };
      await vaultApi.setup(token, { salt: masterSalt, kdfParams, kdfParamsVersion: KDF_PARAMS_VERSION });

      const dek = await generateDek();
      const masterKey = await deriveMasterKey(masterPassword, masterSalt, kdfParams);
      const wrappedDekByMaster = await wrapDek(dek, masterKey);

      const recoveryKey = generateRecoveryKey();
      const recoverySalt = generateSaltB64();
      const recoveryWrapKey = await deriveRecoveryKey(recoveryKey, recoverySalt);
      const wrappedDekByRecovery = await wrapDek(dek, recoveryWrapKey);

      const payload: VaultMetaPayload = {
        masterSalt,
        kdfParams,
        wrappedDekByMaster,
        recoverySalt,
        wrappedDekByRecovery,
      };
      await itemsApi.upsert(token, VAULT_META_ITEM_ID, {
        expectedRevision: 0,
        ciphertext: btoa(JSON.stringify(payload)),
        nonce: "n/a",
        algo: VAULT_META_ALGO,
        schemaVersion: 1,
      });

      dekRef.current = dek;
      setStatus("unlocked");
      setSecrets([]);
      return { recoveryKey };
    },
    [requireToken]
  );

  const fetchVaultMeta = useCallback(async (token: string): Promise<VaultMetaPayload> => {
    const item = await itemsApi.get(token, VAULT_META_ITEM_ID);
    if (!item.ciphertext) throw new Error("Vault metadata is missing");
    return JSON.parse(atob(item.ciphertext)) as VaultMetaPayload;
  }, []);

  const unlock = useCallback(
    async (masterPassword: string) => {
      const token = requireToken();
      setError(null);
      try {
        const meta = await fetchVaultMeta(token);
        const masterKey = await deriveMasterKey(masterPassword, meta.masterSalt, meta.kdfParams);
        const dek = await unwrapDek(meta.wrappedDekByMaster, masterKey);
        dekRef.current = dek;
        setStatus("unlocked");
      } catch {
        // AES-GCM tag check failure (wrong password) and any other unlock
        // failure surface the same generic message (MSM-5 AC2: no hint).
        throw new Error(INCORRECT_PASSWORD_MESSAGE);
      }
    },
    [requireToken, fetchVaultMeta]
  );

  const recoverWithKit = useCallback(
    async (recoveryKey: string, newMasterPassword: string) => {
      const token = requireToken();
      const meta = await fetchVaultMeta(token);
      let dek: CryptoKey;
      try {
        const recoveryWrapKey = await deriveRecoveryKey(recoveryKey, meta.recoverySalt);
        dek = await unwrapDek(meta.wrappedDekByRecovery, recoveryWrapKey);
      } catch {
        throw new Error("Recovery Kit key did not match this vault.");
      }

      const newMasterKey = await deriveMasterKey(newMasterPassword, meta.masterSalt, meta.kdfParams);
      const wrappedDekByMaster = await wrapDek(dek, newMasterKey);
      const nextPayload: VaultMetaPayload = { ...meta, wrappedDekByMaster };

      const current = await itemsApi.get(token, VAULT_META_ITEM_ID);
      await itemsApi.upsert(token, VAULT_META_ITEM_ID, {
        expectedRevision: current.revision,
        ciphertext: btoa(JSON.stringify(nextPayload)),
        nonce: "n/a",
        algo: VAULT_META_ALGO,
        schemaVersion: 1,
      });

      dekRef.current = dek;
      setStatus("unlocked");
    },
    [requireToken, fetchVaultMeta]
  );

  const lock = useCallback(() => {
    dekRef.current = null;
    setSecrets([]);
    setStatus("locked");
  }, []);

  const loadSecrets = useCallback(async () => {
    const token = requireToken();
    const dek = dekRef.current;
    if (!dek) throw new Error("Vault is locked");
    setLoading(true);
    setError(null);
    try {
      const page = await itemsApi.getChanges(token, 0);
      const decrypted: SecretEntry[] = [];
      for (const item of page.items) {
        if (item.itemId === VAULT_META_ITEM_ID || item.deletedAt || !item.ciphertext || !item.nonce) continue;
        try {
          const data = await decryptJson<SecretData>({ ciphertext: item.ciphertext, nonce: item.nonce }, dek);
          decrypted.push({ itemId: item.itemId, revision: item.revision, data, pendingSync: false });
        } catch {
          // Skip items this DEK cannot decrypt rather than surfacing garbage.
        }
      }
      setSecrets(decrypted);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError("You are offline. Showing the last synced secrets.");
      } else {
        setError("Could not load your secrets. Please retry.");
      }
    } finally {
      setLoading(false);
    }
  }, [requireToken]);

  const getSecret = useCallback((itemId: string) => secrets.find((s) => s.itemId === itemId), [secrets]);

  const upsertLocal = useCallback((entry: SecretEntry) => {
    setSecrets((prev) => {
      const idx = prev.findIndex((s) => s.itemId === entry.itemId);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
  }, []);

  const writeSecret = useCallback(
    async (itemId: string, data: SecretData, expectedRevision: number, isNew: boolean) => {
      const token = requireToken();
      const dek = dekRef.current;
      if (!dek) throw new Error("Vault is locked");

      if (!online) {
        // MSM-14: queue optimistically and surface a pending-sync badge instead of blocking the UI.
        upsertLocal({ itemId, revision: expectedRevision, data, pendingSync: true });
        return;
      }

      const envelope = await encryptJson(data, dek);
      try {
        const item = await itemsApi.upsert(token, itemId, {
          expectedRevision,
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
          algo: envelope.algo,
          schemaVersion: envelope.schemaVersion,
        });
        upsertLocal({ itemId, revision: item.revision, data, pendingSync: false });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const serverItem = (err.body as { serverItem?: { ciphertext: string | null; nonce: string | null; revision: number } }).serverItem;
          let serverData: SecretData | null = null;
          if (serverItem?.ciphertext && serverItem?.nonce) {
            try {
              serverData = await decryptJson<SecretData>({ ciphertext: serverItem.ciphertext, nonce: serverItem.nonce }, dek);
            } catch {
              serverData = null;
            }
          }
          setPendingEdit({ itemId, data, isNew });
          setConflict({
            itemId,
            yourData: data,
            yourExpectedRevision: expectedRevision,
            serverRevision: serverItem?.revision ?? expectedRevision,
            serverData,
          });
          return;
        }
        throw err;
      }
    },
    [requireToken, online, upsertLocal]
  );

  const createSecret = useCallback(
    async (data: SecretData) => {
      const itemId = globalThis.crypto.randomUUID();
      await writeSecret(itemId, data, 0, true);
    },
    [writeSecret]
  );

  const updateSecret = useCallback(
    async (itemId: string, data: SecretData) => {
      const current = getSecret(itemId);
      await writeSecret(itemId, data, current?.revision ?? 0, false);
    },
    [getSecret, writeSecret]
  );

  const deleteSecret = useCallback(
    async (itemId: string) => {
      const token = requireToken();
      const current = getSecret(itemId);
      try {
        await itemsApi.delete(token, itemId, current?.revision ?? 0);
        setSecrets((prev) => prev.filter((s) => s.itemId !== itemId));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setConflict({
            itemId,
            yourData: current?.data ?? { title: "" },
            yourExpectedRevision: current?.revision ?? 0,
            serverRevision: current?.revision ?? 0,
            serverData: null,
          });
          return;
        }
        throw err;
      }
    },
    [requireToken, getSecret]
  );

  const resolveConflict = useCallback(
    async (choice: "mine" | "theirs") => {
      if (!conflict) return;
      if (choice === "theirs") {
        setConflict(null);
        setPendingEdit(null);
        await loadSecrets();
        return;
      }
      // "mine": force the local edit over the server's revision.
      const edit = pendingEdit;
      setConflict(null);
      setPendingEdit(null);
      if (edit) {
        await writeSecret(edit.itemId, edit.data, conflict.serverRevision, edit.isNew);
      }
    },
    [conflict, pendingEdit, loadSecrets, writeSecret]
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      online,
      secrets,
      loading,
      error,
      conflict,
      checkBootstrap,
      setupVault,
      unlock,
      recoverWithKit,
      lock,
      loadSecrets,
      getSecret,
      createSecret,
      updateSecret,
      deleteSecret,
      resolveConflict,
    }),
    [
      status,
      online,
      secrets,
      loading,
      error,
      conflict,
      checkBootstrap,
      setupVault,
      unlock,
      recoverWithKit,
      lock,
      loadSecrets,
      getSecret,
      createSecret,
      updateSecret,
      deleteSecret,
      resolveConflict,
    ]
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider");
  return ctx;
}
