import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDocumentStore } from "../src/store/inMemoryStore";
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

describe("MSM-13 backend sync API: change feed, cursor pagination, tombstones", () => {
  let app: Express;
  let store: InMemoryDocumentStore;
  let accessToken: string;
  let userId: string;

  beforeEach(async () => {
    ({ app, store } = buildTestApp({ changeFeedPageSize: 2 }));
    ({ accessToken, userId } = await registerAndLogin(app));
  });

  function auth(req: request.Test) {
    return req.set("Authorization", `Bearer ${accessToken}`);
  }

  it("a feed without a cursor starts at sequence zero and includes every item", async () => {
    await auth(request(app).put("/v1/items/a")).send(envelope());
    await auth(request(app).put("/v1/items/b")).send(envelope());
    const res = await auth(request(app).get("/v1/items"));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.hasMore).toBe(true); // pageSize is 2, but see next page via nextCursor
  });

  it("returns only items changed after the given cursor, advancing nextCursor without gaps/duplicates", async () => {
    await auth(request(app).put("/v1/items/a")).send(envelope());
    await auth(request(app).put("/v1/items/b")).send(envelope());
    await auth(request(app).put("/v1/items/c")).send(envelope());

    const page1 = await auth(request(app).get("/v1/items?cursor=0"));
    expect(page1.body.items.map((i: { itemId: string }) => i.itemId)).toEqual(["a", "b"]);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await auth(request(app).get(`/v1/items?cursor=${page1.body.nextCursor}`));
    expect(page2.body.items.map((i: { itemId: string }) => i.itemId)).toEqual(["c"]);
    expect(page2.body.hasMore).toBe(false);
  });

  it("surfaces a delete as a tombstone in the next change-feed page rather than omitting it", async () => {
    await auth(request(app).put("/v1/items/a")).send(envelope());
    const page0 = await auth(request(app).get("/v1/items?cursor=0"));
    const cursorAfterCreate = page0.body.nextCursor;

    await auth(request(app).delete("/v1/items/a")).send({ expectedRevision: 1 });
    const page1 = await auth(request(app).get(`/v1/items?cursor=${cursorAfterCreate}`));
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0]).toMatchObject({ itemId: "a", deletedAt: expect.any(String), ciphertext: null });
  });

  it("signals that a full resync is required for an expired cursor, rather than a silent partial/empty page", async () => {
    await auth(request(app).put("/v1/items/a")).send(envelope());
    store.setChangeFloorForTesting(userId, 5);
    const res = await auth(request(app).get("/v1/items?cursor=0"));
    expect(res.status).toBe(410);
    expect(res.body.requiresFullResync).toBe(true);
  });

  it("rejects a structurally invalid cursor", async () => {
    const res = await auth(request(app).get("/v1/items?cursor=not-a-number"));
    expect(res.status).toBe(400);
  });

  it("covers every create/update/delete at least once across page boundaries", async () => {
    await auth(request(app).put("/v1/items/a")).send(envelope());
    await auth(request(app).put("/v1/items/b")).send(envelope());
    await auth(request(app).put("/v1/items/b")).send(envelope({ expectedRevision: 1, ciphertext: "v2" }));
    await auth(request(app).delete("/v1/items/a")).send({ expectedRevision: 1 });

    const seen = new Map<string, { revision: number; deletedAt: string | null }>();
    let cursor = 0;
    let hasMore = true;
    let guard = 0;
    while (hasMore && guard < 10) {
      const res = await auth(request(app).get(`/v1/items?cursor=${cursor}`));
      for (const item of res.body.items as Array<{ itemId: string; revision: number; deletedAt: string | null }>) {
        seen.set(item.itemId, { revision: item.revision, deletedAt: item.deletedAt });
      }
      cursor = res.body.nextCursor;
      hasMore = res.body.hasMore;
      guard += 1;
    }

    expect(seen.get("a")).toMatchObject({ revision: 2, deletedAt: expect.any(String) });
    expect(seen.get("b")).toMatchObject({ revision: 2, deletedAt: null });
  });
});
