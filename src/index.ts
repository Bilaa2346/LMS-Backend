import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import quizzesRoutes from "./routes/quizzes";
import assignmentsRoutes from "./routes/assignments";
import notificationsRoutes from "./routes/notifications";
import calendarRoutes from "./routes/calendar";
import studentsRoutes from "./routes/students";
import uktRoutes from "./routes/ukt";
import usersRoutes from "./routes/users";
import facultiesRoutes from "./routes/faculties";
import notFound from "./middleware/notFound";
import errorHandler from "./middleware/error";

const app = express();

// Trust reverse proxy (Railway, Vercel, Cloudflare, etc.) so HTTPS & secure cookies work correctly
app.set("trust proxy", 1);

// Security headers. Relax CORP so the cross-origin frontend can read responses.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS configuration supporting cross-origin requests from Vercel deployments
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      origin === config.clientOrigin ||
      origin.endsWith(".vercel.app") ||
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
};

app.use(cors(corsOptions));

// Request logging for production visibility in Railway logs
app.use((req, _res, next) => {
  if (req.method !== "OPTIONS") {
    // eslint-disable-next-line no-console
    console.log(`[${req.method}] ${req.url} - Origin: ${req.headers.origin || "none"}`);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

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
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/quizzes", quizzesRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/ukt", uktRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/faculties", facultiesRoutes);

import { readJson } from "./data/db";
import { seedDatabase } from "./scripts/seed";

// 404 + error handling
app.use(notFound);
app.use(errorHandler);

// Auto-seed if database is empty or not initialized
async function ensureDatabaseInitialized() {
  try {
    const users = await readJson("users");
    if (!users || users.length === 0) {
      // eslint-disable-next-line no-console
      console.log("Empty database detected. Auto-seeding initial campus data...");
      await seedDatabase();
      // eslint-disable-next-line no-console
      console.log("Database initialized successfully.");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Database initialization check failed:", err);
  }
}

if (process.env.VERCEL !== "1") {
  ensureDatabaseInitialized().finally(() => {
    const server = app.listen(config.port, "0.0.0.0", () => {
      // eslint-disable-next-line no-console
      console.log(
        `LMS API running on http://0.0.0.0:${config.port} (${config.nodeEnv})`
      );
    });

    // Graceful shutdown handling for Railway, Docker & Kubernetes
    const handleShutdown = (signal: string) => {
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
  });
}

export default app;
