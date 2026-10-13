import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "./config";
import { authenticate } from "./middleware/authenticate";
import { createAuthRouter } from "./routes/auth";
import { createItemsRouter } from "./routes/items";
import { createVaultRouter } from "./routes/vault";
import { AuthService } from "./services/authService";
import { ItemsService } from "./services/itemsService";
import { VaultService } from "./services/vaultService";
import type { DocumentStore } from "./store/documentStore";
import type { InMemoryDocumentStore } from "./store/inMemoryStore";

/**
 * Builds the Express app. `store` must be an {@link InMemoryDocumentStore}
 * today (ItemsService depends on its `nextChangeSeq` helper); swapping to a
 * real NoSQL vendor means providing an equivalent concrete store and
 * updating this wiring only — route/service logic is unaffected.
 */
export function createApp(config: AppConfig, store: InMemoryDocumentStore & DocumentStore): Express {
  const app = express();
  app.use(express.json());

  const authService = new AuthService(store, config);
  const vaultService = new VaultService(store);
  const itemsService = new ItemsService(store, config.changeFeedPageSize);

  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/v1/auth", createAuthRouter(authService));
  app.use("/v1/vault", createVaultRouter(authService, vaultService));
  app.use("/v1/items", createItemsRouter(authService, itemsService));

  // Authenticated whoami helper, useful for mobile client bootstrap/debugging.
  app.get("/v1/me", authenticate(authService), (req, res) => {
    res.status(200).json({ userId: (req as Request & { ownerId?: string }).ownerId });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found" });
  });

  // Ciphertext-safe error handler (MSM-19 scope, backend half): never log
  // request/response bodies (which may carry ciphertext/token material),
  // only the error message and route — full observability
  // (dashboards/alerting) is infrastructure scope (MSM-19 continued).
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "unknown_error";
    // eslint-disable-next-line no-console
    console.error(`[unhandled_error] ${req.method} ${req.path}: ${message}`);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
