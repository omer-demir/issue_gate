import type { NextFunction, Request, Response } from "express";
import type { AuthService } from "../services/authService";

export interface AuthenticatedRequest extends Request {
  ownerId?: string;
}

/**
 * MSM-10 AC3: derives `ownerId` strictly from the verified access token's
 * subject claim — never from any client-supplied field — and rejects
 * missing/invalid/expired tokens with a generic 401.
 */
export function authenticate(authService: AuthService) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    const ownerId = authService.verifyAccessToken(token);
    if (!ownerId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.ownerId = ownerId;
    next();
  };
}
