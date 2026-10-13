import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, registerAndLogin } from "./helpers";

function envelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    expectedRevision: 0,
    ciphertext: "ciphertext-blob-base64",
    nonce: "nonce-base64",
    algo: "AES-256-GCM",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("MSM-12 backend sync API: item upsert/read with revision concurrency", () => {
  let app: Express;
  let accessToken: string;

  beforeEach(async () => {
    ({ app } = buildTestApp());
    ({ accessToken } = await registerAndLogin(app));
  });

  function auth(req: request.Test) {
    return req.set("Authorization", `Bearer ${accessToken}`);
  }

  it("creates a new item with expectedRevision 0 and an incremented revision", async () => {
    const res = await auth(request(app).put("/v1/items/item-1")).send(envelope());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ itemId: "item-1", revision: 1, ciphertext: "ciphertext-blob-base64" });
    expect(res.body).not.toHaveProperty("plaintext");
  });

  it("updates an existing item when expectedRevision matches, incrementing revision monotonically", async () => {
    await auth(request(app).put("/v1/items/item-2")).send(envelope());
    const res = await auth(request(app).put("/v1/items/item-2")).send(
      envelope({ expectedRevision: 1, ciphertext: "updated-ciphertext" })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ revision: 2, ciphertext: "updated-ciphertext" });
  });

  it("returns 409 version_conflict with both envelopes when revision does not match, without applying the write", async () => {
    await auth(request(app).put("/v1/items/item-3")).send(envelope());
    const res = await auth(request(app).put("/v1/items/item-3")).send(
      envelope({ expectedRevision: 99, ciphertext: "should-not-be-applied" })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("version_conflict");
    expect(res.body.serverItem).toMatchObject({ revision: 1 });

    const stillOriginal = await auth(request(app).get("/v1/items/item-3"));
    expect(stillOriginal.body).toMatchObject({ revision: 1, ciphertext: "ciphertext-blob-base64" });
  });

  it("returns 410 Gone for a direct lookup of a tombstoned item", async () => {
    await auth(request(app).put("/v1/items/item-4")).send(envelope());
    const del = await auth(request(app).delete("/v1/items/item-4")).send({ expectedRevision: 1 });
    expect(del.status).toBe(200);
    const res = await auth(request(app).get("/v1/items/item-4"));
    expect(res.status).toBe(410);
  });

  it("returns 404 for an item that never existed", async () => {
    const res = await auth(request(app).get("/v1/items/does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("ignores/rejects a client-supplied ownerId field on upsert", async () => {
    const res = await auth(request(app).put("/v1/items/item-5")).send(
      envelope({ ownerId: "someone-elses-account" })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("owner_id_not_allowed");
  });

  it("rejects an upsert missing required envelope fields", async () => {
    const res = await auth(request(app).put("/v1/items/item-6")).send({ expectedRevision: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects access from an unauthenticated caller", async () => {
    const res = await request(app).get("/v1/items/item-1");
    expect(res.status).toBe(401);
  });

  it("scopes items per account (owner A cannot read owner B's item)", async () => {
    await auth(request(app).put("/v1/items/shared-id")).send(envelope());
    const { accessToken: otherToken } = await registerAndLogin(app, "mallory@example.com");
    const res = await request(app).get("/v1/items/shared-id").set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("delete requires matching revision (optimistic concurrency) and conflicts otherwise", async () => {
    await auth(request(app).put("/v1/items/item-7")).send(envelope());
    const res = await auth(request(app).delete("/v1/items/item-7")).send({ expectedRevision: 99 });
    expect(res.status).toBe(409);
  });

  it("stores only an opaque ciphertext blob plus non-secret metadata", async () => {
    const res = await auth(request(app).put("/v1/items/item-8")).send(envelope());
    const keys = Object.keys(res.body).sort();
    expect(keys).toEqual(
      ["algo", "changeSeq", "ciphertext", "createdAt", "deletedAt", "itemId", "kdfParams", "nonce", "ownerId", "revision", "schemaVersion", "updatedAt"].sort()
    );
  });
});
