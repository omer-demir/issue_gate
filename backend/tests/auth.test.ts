import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, registerAndLogin } from "./helpers";

const AUTH_SCHEME = "Bearer";

describe("MSM-10 backend account registration, login, session", () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = buildTestApp());
  });

  it("registers a new account without ever echoing the password", async () => {
    const res = await request(app)
      .post("/v1/auth/register")
      .send({ email: "bob@example.com", password: "a very strong passphrase" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("userId");
    expect(JSON.stringify(res.body)).not.toContain("a very strong passphrase");
  });

  it("rejects registration with a weak/short password", async () => {
    const res = await request(app).post("/v1/auth/register").send({ email: "weak@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate registration for the same email", async () => {
    await request(app).post("/v1/auth/register").send({ email: "dup@example.com", password: "a very strong passphrase" });
    const res = await request(app)
      .post("/v1/auth/register")
      .send({ email: "dup@example.com", password: "another strong passphrase" });
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials and issues an access + refresh token", async () => {
    await request(app).post("/v1/auth/register").send({ email: "carol@example.com", password: "a very strong passphrase" });
    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "carol@example.com", password: "a very strong passphrase" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body).toHaveProperty("expiresIn");
  });

  it("returns a generic failure for a wrong password (no enumeration signal)", async () => {
    await request(app).post("/v1/auth/register").send({ email: "dave@example.com", password: "a very strong passphrase" });
    const wrongPassword = await request(app)
      .post("/v1/auth/login")
      .send({ email: "dave@example.com", password: "totally wrong passphrase" });
    const noSuchAccount = await request(app)
      .post("/v1/auth/login")
      .send({ email: "nosuchaccount@example.com", password: "totally wrong passphrase" });
    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual(noSuchAccount.body);
  });

  it("rejects an expired/garbage access token on an authenticated route", async () => {
    const res = await request(app).get("/v1/me").set("Authorization", `${AUTH_SCHEME} not-a-real-token`);
    expect(res.status).toBe(401);
  });

  it("derives ownerId from the authenticated principal, never from the client", async () => {
    const { accessToken, userId } = await registerAndLogin(app);
    const res = await request(app).get("/v1/me").set("Authorization", `${AUTH_SCHEME} ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it("rotates the refresh token and rejects reuse of the old one", async () => {
    const { refreshToken } = await registerAndLogin(app);
    const refreshed = await request(app).post("/v1/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    const reuseOldToken = await request(app).post("/v1/auth/refresh").send({ refreshToken });
    expect(reuseOldToken.status).toBe(401);
  });

  it("rejects an access token once its TTL has elapsed (MSM-10 AC2)", async () => {
    // A negative TTL makes the signed JWT's `exp` land in the past relative
    // to its own `iat`, so it is well-formed but expired the instant it is
    // issued — distinct from the garbage-token case already covered above.
    const { app: expiredApp } = buildTestApp({ accessTokenTtlSeconds: -1 });
    const { accessToken } = await registerAndLogin(expiredApp);
    const res = await request(expiredApp).get("/v1/me").set("Authorization", `${AUTH_SCHEME} ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects a refresh once its TTL has elapsed (MSM-10 AC2)", async () => {
    const { app: refreshApp, store } = buildTestApp();
    const { userId } = await registerAndLogin(refreshApp);
    const expiredTokenId = "expired-refresh-token-id";
    await store.createRefreshToken({
      tokenId: expiredTokenId,
      userId,
      createdAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      revoked: false,
    });
    const res = await request(refreshApp).post("/v1/auth/refresh").send({ refreshToken: expiredTokenId });
    expect(res.status).toBe(401);
  });
});
