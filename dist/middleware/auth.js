"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jwt_1 = require("../utils/jwt");
const envelope_1 = require("../utils/envelope");
/** Requires a valid Bearer header token or lms_token cookie. 401 otherwise. */
function requireAuth(req, res, next) {
    let token;
    // 1. Prioritize Authorization header (guaranteed cross-origin support e.g. Vercel -> Railway)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7).trim();
    }
    // 2. Fallback to HTTP-only cookie for same-origin / local development
    if (!token) {
        token = req.cookies?.lms_token;
    }
    if (!token) {
        return (0, envelope_1.sendError)(res, "Sesi berakhir, silakan login kembali", 401);
    }
    try {
        req.user = (0, jwt_1.verifyToken)(token);
        return next();
    }
    catch {
        return (0, envelope_1.sendError)(res, "Sesi berakhir, silakan login kembali", 401);
    }
}
/** Requires the authenticated user to have one of the given roles. 403 otherwise. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return (0, envelope_1.sendError)(res, "Sesi berakhir, silakan login kembali", 401);
        }
        if (!roles.includes(req.user.role)) {
            return (0, envelope_1.sendError)(res, "Anda tidak memiliki akses ke sumber daya ini", 403);
        }
        return next();
    };
}
