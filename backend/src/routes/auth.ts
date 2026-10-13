import { Router } from "express";
import type { AuthService } from "../services/authService";
import { AuthenticationError, ConflictError, ValidationError } from "../services/authService";
import { asyncHandler } from "../utils/asyncHandler";

/** MSM-10: registration, login, refresh, logout. */
export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res, next) => {
      try {
        const { email, password } = req.body ?? {};
        const result = await authService.register(email, password);
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: "validation_error", message: err.message });
          return;
        }
        if (err instanceof ConflictError) {
          res.status(409).json({ error: "email_already_registered" });
          return;
        }
        next(err);
      }
    })
  );

  router.post(
    "/login",
    asyncHandler(async (req, res, next) => {
      try {
        const { email, password } = req.body ?? {};
        if (typeof email !== "string" || typeof password !== "string") {
          res.status(401).json({ error: "invalid_credentials" });
          return;
        }
        const tokens = await authService.login(email, password);
        res.status(200).json(tokens);
      } catch (err) {
        if (err instanceof AuthenticationError) {
          res.status(401).json({ error: "invalid_credentials" });
          return;
        }
        next(err);
      }
    })
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res, next) => {
      try {
        const { refreshToken } = req.body ?? {};
        if (typeof refreshToken !== "string") {
          res.status(401).json({ error: "invalid_refresh_token" });
          return;
        }
        const tokens = await authService.refresh(refreshToken);
        res.status(200).json(tokens);
      } catch (err) {
        if (err instanceof AuthenticationError) {
          res.status(401).json({ error: "invalid_refresh_token" });
          return;
        }
        next(err);
      }
    })
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body ?? {};
      if (typeof refreshToken === "string") {
        await authService.logout(refreshToken);
      }
      res.status(204).send();
    })
  );

  return router;
}
