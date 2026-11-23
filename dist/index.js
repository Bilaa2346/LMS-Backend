"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const auth_1 = __importDefault(require("./routes/auth"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const quizzes_1 = __importDefault(require("./routes/quizzes"));
const assignments_1 = __importDefault(require("./routes/assignments"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const calendar_1 = __importDefault(require("./routes/calendar"));
const students_1 = __importDefault(require("./routes/students"));
const ukt_1 = __importDefault(require("./routes/ukt"));
const users_1 = __importDefault(require("./routes/users"));
const faculties_1 = __importDefault(require("./routes/faculties"));
const notFound_1 = __importDefault(require("./middleware/notFound"));
const error_1 = __importDefault(require("./middleware/error"));
const app = (0, express_1.default)();
// Trust reverse proxy (Railway, Vercel, Cloudflare, etc.) so HTTPS & secure cookies work correctly
app.set("trust proxy", 1);
// Security headers. Relax CORP so the cross-origin frontend can read responses.
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
// CORS configuration supporting cross-origin requests from Vercel deployments
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (origin === env_1.config.clientOrigin ||
            origin.endsWith(".vercel.app") ||
            origin.includes("localhost")) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
};
app.use((0, cors_1.default)(corsOptions));
// Request logging for production visibility in Railway logs
app.use((req, _res, next) => {
    if (req.method !== "OPTIONS") {
        // eslint-disable-next-line no-console
        console.log(`[${req.method}] ${req.url} - Origin: ${req.headers.origin || "none"}`);
    }
    next();
});
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// URL sanitizing middleware: normalizes duplicate slashes (e.g. /api//ukt -> /api/ukt)
app.use((req, _res, next) => {
    if (req.url && req.url.includes("//")) {
        req.url = req.url.replace(/\/{2,}/g, "/");
    }
    next();
});
// Root & Healthcheck endpoints for Railway / cloud deployment checks
app.get("/", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "LMS Backend API",
        version: "1.0.0",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));
// Route registrations: mount under BOTH `/api/<path>` AND `/<path>`
// Guarantees compatibility regardless of whether client requests with /api prefix or not!
const apiRouters = [
    ["/auth", auth_1.default],
    ["/dashboard", dashboard_1.default],
    ["/quizzes", quizzes_1.default],
    ["/assignments", assignments_1.default],
    ["/notifications", notifications_1.default],
    ["/calendar", calendar_1.default],
    ["/students", students_1.default],
    ["/ukt", ukt_1.default],
    ["/users", users_1.default],
    ["/faculties", faculties_1.default],
];
for (const [routePath, routerHandler] of apiRouters) {
    app.use(`/api${routePath}`, routerHandler);
    app.use(routePath, routerHandler);
}
const db_1 = require("./data/db");
const seed_1 = require("./scripts/seed");
// 404 + error handling
app.use(notFound_1.default);
app.use(error_1.default);
// Auto-seed if database is empty or not initialized
async function ensureDatabaseInitialized() {
    try {
        const users = await (0, db_1.readJson)("users");
        if (!users || users.length === 0) {
            // eslint-disable-next-line no-console
            console.log("Empty database detected. Auto-seeding initial campus data...");
            await (0, seed_1.seedDatabase)();
            // eslint-disable-next-line no-console
            console.log("Database initialized successfully.");
        }
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error("Database initialization check failed:", err);
    }
}
if (process.env.VERCEL !== "1") {
    // Start server immediately so Railway / cloud healthcheck passes instantly
    const server = app.listen(env_1.config.port, "0.0.0.0", () => {
        // eslint-disable-next-line no-console
        console.log(`LMS API running on http://0.0.0.0:${env_1.config.port} (${env_1.config.nodeEnv})`);
    });
    // Run database initialization in background without delaying port binding
    ensureDatabaseInitialized();
    // Graceful shutdown handling for Railway, Docker & Kubernetes
    const handleShutdown = (signal) => {
        // eslint-disable-next-line no-console
        console.log(`Received ${signal}. Gracefully shutting down HTTP server...`);
        server.close(() => {
            // eslint-disable-next-line no-console
            console.log("HTTP server closed successfully.");
            process.exit(0);
        });
        // Force shutdown after 10s if connections refuse to close
        setTimeout(() => {
            // eslint-disable-next-line no-console
            console.error("Forceful shutdown after timeout.");
            process.exit(0);
        }, 10000).unref();
    };
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
}
exports.default = app;
