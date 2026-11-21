import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/envelope";
import { config } from "../config/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("[error]", err);

  // Malformed JSON body.
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    return sendError(res, "Body JSON tidak valid", 400);
  }

  return sendError(
    res,
    config.isProd ? "Terjadi kesalahan pada server" : err?.message ?? "Terjadi kesalahan",
    500
  );
}
