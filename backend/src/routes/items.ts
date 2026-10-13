import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate";
import type { AuthService } from "../services/authService";
import {
  GoneError,
  NotFoundError,
  ValidationError,
  VersionConflictError,
  type ItemsService,
} from "../services/itemsService";
import { asyncHandler } from "../utils/asyncHandler";

/** MSM-12/MSM-13: item upsert/read with revision concurrency; change feed with cursor pagination and tombstones. */
export function createItemsRouter(authService: AuthService, itemsService: ItemsService): Router {
  const router = Router();
  router.use(authenticate(authService));

  // Change feed must be registered before "/:itemId" to avoid route collision.
  router.get(
    "/",
    asyncHandler(async (req: AuthenticatedRequest, res, next) => {
      try {
        const ownerId = req.ownerId as string;
        const cursorParam = req.query.cursor;
        const cursor = cursorParam === undefined ? 0 : Number(cursorParam);
        const page = await itemsService.getChanges(ownerId, cursor);
        res.status(200).json(page);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: "invalid_cursor", message: err.message });
          return;
        }
        if (err instanceof GoneError) {
          res.status(410).json({ error: "cursor_expired", requiresFullResync: true });
          return;
        }
        next(err);
      }
    })
  );

  router.get(
    "/:itemId",
    asyncHandler(async (req: AuthenticatedRequest, res, next) => {
      try {
        const ownerId = req.ownerId as string;
        const item = await itemsService.getItem(ownerId, req.params.itemId);
        res.status(200).json(item);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        if (err instanceof GoneError) {
          res.status(410).json({ error: "gone" });
          return;
        }
        next(err);
      }
    })
  );

  router.put(
    "/:itemId",
    asyncHandler(async (req: AuthenticatedRequest, res, next) => {
      try {
        const ownerId = req.ownerId as string;
        const body = req.body ?? {};
        if (Object.prototype.hasOwnProperty.call(body, "ownerId")) {
          res.status(400).json({ error: "owner_id_not_allowed" });
          return;
        }
        const { item, created } = await itemsService.upsert(ownerId, req.params.itemId, {
          expectedRevision: body.expectedRevision,
          ciphertext: body.ciphertext,
          nonce: body.nonce,
          algo: body.algo,
          kdfParams: body.kdfParams ?? null,
          schemaVersion: body.schemaVersion,
        });
        res.status(created ? 201 : 200).json(item);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: "validation_error", message: err.message });
          return;
        }
        if (err instanceof VersionConflictError) {
          res.status(409).json({ error: "version_conflict", yourItem: err.yourItem, serverItem: err.serverItem });
          return;
        }
        next(err);
      }
    })
  );

  router.delete(
    "/:itemId",
    asyncHandler(async (req: AuthenticatedRequest, res, next) => {
      try {
        const ownerId = req.ownerId as string;
        const expectedRevision = Number((req.body ?? {}).expectedRevision);
        const item = await itemsService.delete(ownerId, req.params.itemId, expectedRevision);
        res.status(200).json(item);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        if (err instanceof GoneError) {
          res.status(410).json({ error: "gone" });
          return;
        }
        if (err instanceof VersionConflictError) {
          res.status(409).json({ error: "version_conflict", yourItem: err.yourItem, serverItem: err.serverItem });
          return;
        }
        next(err);
      }
    })
  );

  return router;
}
