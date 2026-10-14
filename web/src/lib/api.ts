import type { ItemRecord, KdfParams, TokenPair, VaultBootstrap } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (cause) {
    // Network failure (offline, DNS, CORS, etc.) — never silently swallowed.
    throw new ApiError("network_error", 0, cause);
  }

  const text = await response.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError((body?.error as string) ?? "request_failed", response.status, body);
  }
  return body as T;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const authApi = {
  register: (email: string, password: string) =>
    request<{ userId: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  refresh: (refreshToken: string) =>
    request<TokenPair>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  logout: (refreshToken: string) =>
    request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
};

export const vaultApi = {
  setup: (accessToken: string, input: { salt: string; kdfParams: KdfParams; kdfParamsVersion: number }) =>
    request<VaultBootstrap & { provisioned: true }>("/vault/kdf", {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    }),
  getBootstrap: (accessToken: string) =>
    request<VaultBootstrap>("/vault/kdf", { method: "GET", headers: authHeaders(accessToken) }),
};

export const itemsApi = {
  get: (accessToken: string, itemId: string) =>
    request<ItemRecord>(`/items/${encodeURIComponent(itemId)}`, { headers: authHeaders(accessToken) }),
  upsert: (
    accessToken: string,
    itemId: string,
    input: {
      expectedRevision: number;
      ciphertext: string;
      nonce: string;
      algo: string;
      schemaVersion: number;
      kdfParams?: Record<string, unknown> | null;
    }
  ) =>
    request<ItemRecord>(`/items/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    }),
  delete: (accessToken: string, itemId: string, expectedRevision: number) =>
    request<ItemRecord>(`/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ expectedRevision }),
    }),
  getChanges: (accessToken: string, cursor = 0) =>
    request<{ items: ItemRecord[]; nextCursor: number; hasMore: boolean }>(`/items?cursor=${cursor}`, {
      headers: authHeaders(accessToken),
    }),
};
