"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function env(name, fallback) {
    const value = process.env[name];
    return value && value.length > 0 ? value : fallback;
}
exports.config = {
    port: Number(process.env.PORT ?? 5000),
    clientOrigin: env("CLIENT_ORIGIN", "http://localhost:3000"),
    jwtSecret: env("JWT_SECRET", "dev-secret-change-me"),
    jwtExpiresIn: env("JWT_EXPIRES_IN", "8h"),
    nodeEnv: env("NODE_ENV", "development"),
    isProd: env("NODE_ENV", "development") === "production",
};
