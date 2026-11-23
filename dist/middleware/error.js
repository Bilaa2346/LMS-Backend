"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = errorHandler;
const envelope_1 = require("../utils/envelope");
const env_1 = require("../config/env");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorHandler(err, _req, res, _next) {
    console.error("[error]", err);
    // Malformed JSON body.
    if (err instanceof SyntaxError && "status" in err && err.status === 400) {
        return (0, envelope_1.sendError)(res, "Body JSON tidak valid", 400);
    }
    return (0, envelope_1.sendError)(res, env_1.config.isProd ? "Terjadi kesalahan pada server" : err?.message ?? "Terjadi kesalahan", 500);
}
