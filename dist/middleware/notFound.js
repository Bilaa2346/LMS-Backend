"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = notFound;
const envelope_1 = require("../utils/envelope");
function notFound(_req, res) {
    return (0, envelope_1.sendError)(res, "Endpoint tidak ditemukan", 404);
}
