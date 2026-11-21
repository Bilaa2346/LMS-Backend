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
import notFound from "./middleware/notFound";
import errorHandler from "./middleware/error";

const app = express();

// Security headers. Relax CORP so the cross-origin frontend can read responses.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS: allow frontend origins (including Vercel deployments), with credentials (cookies).
app.use(
  cors({
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
  })
);

app.use(express.json());
app.use(cookieParser());

// Routes
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/quizzes", quizzesRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/students", studentsRoutes);

// 404 + error handling
app.use(notFound);
app.use(errorHandler);

if (process.env.VERCEL !== "1") {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `LMS API running on http://localhost:${config.port} (${config.nodeEnv})`
    );
  });
}

export default app;
