import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not forward a rejected promise from an async handler to
 * `next()` automatically; wrapping ensures unexpected (non-domain) errors
 * reach the centralized error handler instead of crashing the request with
 * an unhandled rejection.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
