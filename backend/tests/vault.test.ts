import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, registerAndLogin } from "./helpers";

describe("MSM-11 backend vault bootstrap endpoint (KDF params issuance)", () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = buildTestApp());
  });

  it("returns 'not yet provisioned' before vault setup", async () => {
    const { accessToken } = await registerAndLogin(app);
    const res = await request(app).get("/v1/vault/kdf").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ provisioned: false });
  });

  it("stores a client-generated salt/KDF params and returns them scoped to that account", async () => {
    const { accessToken } = await registerAndLogin(app);
    const setupRes = await request(app)
      .post("/v1/vault/kdf")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ salt: "base64-salt-value", kdfParams: { algorithm: "argon2id", memoryKiB: 65536, iterations: 3 } });
    expect(setupRes.status).toBe(201);
    expect(setupRes.body).toMatchObject({
      salt: "base64-salt-value",
      kdfParams: { algorithm: "argon2id", memoryKiB: 65536, iterations: 3 },
      kdfParamsVersion: 1,
    });
    expect(setupRes.body).toHaveProperty("saltRef");

    const bootstrapRes = await request(app).get("/v1/vault/kdf").set("Authorization", `Bearer ${accessToken}`);
    expect(bootstrapRes.status).toBe(200);
    expect(bootstrapRes.body).toMatchObject({ provisioned: true, salt: "base64-salt-value" });
  });

  it("never requires/accepts a master password or derived key in the setup payload", async () => {
    const { accessToken } = await registerAndLogin(app);
    const res = await request(app)
      .post("/v1/vault/kdf")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ salt: "s", kdfParams: {}, masterPassword: "should-be-ignored" });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain("should-be-ignored");
  });

  it("rejects re-provisioning an already-provisioned vault", async () => {
    const { accessToken } = await registerAndLogin(app);
    await request(app)
      .post("/v1/vault/kdf")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ salt: "s1", kdfParams: {} });
    const second = await request(app)
      .post("/v1/vault/kdf")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ salt: "s2", kdfParams: {} });
    expect(second.status).toBe(409);
  });

  it("rejects an unauthenticated bootstrap request", async () => {
    const res = await request(app).get("/v1/vault/kdf");
    expect(res.status).toBe(401);
  });

  it("scopes bootstrap data per account (no cross-account leakage)", async () => {
    const alice = await registerAndLogin(app, "alice2@example.com");
    const bob = await registerAndLogin(app, "bob2@example.com");
    await request(app)
      .post("/v1/vault/kdf")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ salt: "alice-salt", kdfParams: {} });

    const bobBootstrap = await request(app).get("/v1/vault/kdf").set("Authorization", `Bearer ${bob.accessToken}`);
    expect(bobBootstrap.body).toEqual({ provisioned: false });
  });
});
