import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { InMemoryDocumentStore } from "../src/store/inMemoryStore";

export function buildTestApp(overrides: Partial<AppConfig> = {}): { app: Express; store: InMemoryDocumentStore } {
  const config: AppConfig = {
    jwtSecret: "test-secret",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2_592_000,
    changeFeedPageSize: 2, // small page size to exercise pagination in tests
    changeFeedRetention: 1000,
    ...overrides,
  };
  const store = new InMemoryDocumentStore();
  const app = createApp(config, store);
  return { app, store };
}

export async function registerAndLogin(
  app: Express,
  email = "alice@example.com",
  password = "correct horse battery staple"
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const registerRes = await request(app).post("/v1/auth/register").send({ email, password });
  expect(registerRes.status).toBe(201);
  const loginRes = await request(app).post("/v1/auth/login").send({ email, password });
  expect(loginRes.status).toBe(200);
  return {
    accessToken: loginRes.body.accessToken,
    refreshToken: loginRes.body.refreshToken,
    userId: registerRes.body.userId,
  };
}
