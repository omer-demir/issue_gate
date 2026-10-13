import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate";
import type { AuthService } from "../services/authService";
import { ConflictError, ValidationError } from "../services/vaultService";
import type { VaultService } from "../services/vaultService";
import { asyncHandler } from "../utils/asyncHandler";

/** MSM-11: vault KDF bootstrap — salt/params issuance only, no vault data. */
export function createVaultRouter(authService: AuthService, vaultService: VaultService): Router {
  const router = Router();
  router.use(authenticate(authService));

  router.post(
    "/kdf",
    asyncHandler(async (req: AuthenticatedRequest, res, next) => {
      try {
        const ownerId = req.ownerId as string;
        const { salt, kdfParams, kdfParamsVersion } = req.body ?? {};
        const record = await vaultService.setup(ownerId, { salt, kdfParams, kdfParamsVersion });
        res.status(201).json({
          saltRef: record.saltRef,
          salt: record.salt,
          kdfParams: record.kdfParams,
          kdfParamsVersion: record.kdfParamsVersion,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: "validation_error", message: err.message });
          return;
        }
        if (err instanceof ConflictError) {
          res.status(409).json({ error: "vault_already_provisioned" });
          return;
        }
        next(err);
      }
    })
  );

  router.get(
    "/kdf",
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const ownerId = req.ownerId as string;
      const response = await vaultService.getBootstrap(ownerId);
      res.status(200).json(response);
    })
  );

  return router;
}
