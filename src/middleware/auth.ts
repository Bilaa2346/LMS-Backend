import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../utils/jwt";
import { sendError } from "../utils/envelope";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Requires a valid Bearer header token or lms_token cookie. 401 otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Prioritize Authorization header (guaranteed cross-origin support e.g. Vercel -> Railway)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  // 2. Fallback to HTTP-only cookie for same-origin / local development
  if (!token) {
    token = req.cookies?.lms_token as string | undefined;
  }

  if (!token) {
    return sendError(res, "Sesi berakhir, silakan login kembali", 401);
  }
  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return sendError(res, "Sesi berakhir, silakan login kembali", 401);
  }
}

/** Requires the authenticated user to have one of the given roles. 403 otherwise. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, "Sesi berakhir, silakan login kembali", 401);
    }
    if (!roles.includes(req.user.role)) {
      return sendError(res, "Anda tidak memiliki akses ke sumber daya ini", 403);
    }
    return next();
  };
}
