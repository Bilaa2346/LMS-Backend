"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
const crypto_1 = require("crypto");
/** Generates a prefixed id like "usr-lq3a8f1b2c". */
function createId(prefix) {
    const time = Date.now().toString(36);
    const rand = (0, crypto_1.randomBytes)(4).toString("hex");
    return `${prefix}-${time}${rand}`;
}
