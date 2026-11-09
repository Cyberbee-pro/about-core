import path from "path";
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import { migrateSiteConfigResumeUrl } from "./models/SiteConfig";
import { dbLoggerMiddleware } from "./middlewares/dbLoggerMiddleware";
import { notFoundMiddleware, errorMiddleware } from "./middlewares/errorMiddleware";
import { getHealth } from "./controllers/configController";
import projectRoutes from "./routes/projectRoutes";
import skillRoutes from "./routes/skillRoutes";
import personRoutes from "./routes/personRoutes";
import certificateRoutes from "./routes/certificateRoutes";
import achievementRoutes from "./routes/achievementRoutes";
import experienceRoutes from "./routes/experienceRoutes";
import configRoutes from "./routes/configRoutes";
import logRoutes from "./routes/logRoutes";
import adminProjectRoutes from "./routes/adminProjectRoutes";

const app: Application = express();

const warnedInvalidOrigins = new Set<string>();
let warnedEmptyClientOriginProd = false;

export const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CLIENT_ORIGIN;
  if (!envOrigins) {
    return [];
  }
  const entries = envOrigins
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const validOrigins: string[] = [];
  for (const entry of entries) {
    if (entry === "*") {
      validOrigins.push("*");
      continue;
    }
    try {
      const u = new URL(entry);
      if (
        (u.protocol === "http:" || u.protocol === "https:") &&
        (u.pathname === "/" || u.pathname === "") &&
        !u.search &&
        !u.hash &&
        !u.username &&
        !u.password
      ) {
        validOrigins.push(entry);
      } else {
        if (!warnedInvalidOrigins.has(entry)) {
          warnedInvalidOrigins.add(entry);
          console.warn(
            `[CORS Warning] Ignoring invalid CLIENT_ORIGIN entry: "${entry}" (must parse as an http or https origin).`
          );
        }
      }
    } catch {
      if (!warnedInvalidOrigins.has(entry)) {
        warnedInvalidOrigins.add(entry);
        console.warn(
          `[CORS Warning] Ignoring invalid CLIENT_ORIGIN entry: "${entry}" (must parse as an http or https origin).`
        );
      }
    }
  }

  return validOrigins;
};

// Check allowed origins at startup to emit any startup warnings
getAllowedOrigins();
if (process.env.NODE_ENV === "production" && getAllowedOrigins().length === 0) {
  warnedEmptyClientOriginProd = true;
  console.warn(
    "[CORS Warning] CLIENT_ORIGIN is not set in production. All cross-origin requests will be rejected."
  );
}

// Global Middlewares
app.use(
  cors((req, callback) => {
    const origin = req.header("Origin");
    // Allow non-browser requests (Postman, curl, server-to-server)
    if (!origin) {
      return callback(null, { origin: true });
    }

    const cleanOrigin = origin.trim().replace(/\/+$/, "");
    const allowedOrigins = getAllowedOrigins();

    if (allowedOrigins.length === 0) {
      if (process.env.NODE_ENV === "production") {
        if (!warnedEmptyClientOriginProd) {
          warnedEmptyClientOriginProd = true;
          console.warn(
            "[CORS Warning] CLIENT_ORIGIN is not set in production. All cross-origin requests will be rejected."
          );
        }
        console.warn(`[CORS Blocked] Origin "${origin}" rejected (CLIENT_ORIGIN is not set in production).`);
        return callback(new Error("Not allowed by CORS"));
      }

      // Development / Test mode: allow localhost, 127.0.0.1, [::1] on any port
      let isLocal = false;
      try {
        const parsedUrl = new URL(origin);
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
          const h = parsedUrl.hostname;
          if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") {
            isLocal = true;
          }
        }
      } catch {
        isLocal = false;
      }

      if (isLocal) {
        return callback(null, {
          origin: cleanOrigin,
          credentials: true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
        });
      }

      console.warn(`[CORS Blocked] Origin "${origin}" not allowed in development.`);
      return callback(new Error("Not allowed by CORS"));
    }

    if (allowedOrigins.includes("*")) {
      return callback(null, {
        origin: "*",
        credentials: false,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
      });
    }

    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, {
        origin: cleanOrigin,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
      });
    }

    console.warn(`[CORS Blocked] Origin "${origin}" not found in allowed list.`);
    callback(new Error("Not allowed by CORS"));
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets locally from public/ (mirrors Vercel Edge CDN in production)
app.use(express.static(path.join(process.cwd(), "public")));

// Custom LogEntry MongoDB logging middleware intercepts all requests
app.use(dbLoggerMiddleware);

// Liveness check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Service health check (pure JSON API)
app.get("/api/v1/health", getHealth);

// Mount Feature Routes
app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1/people", personRoutes);
app.use("/api/v1/skills", skillRoutes);
app.use("/api/v1/certificates", certificateRoutes);
app.use("/api/v1/achievements", achievementRoutes);
app.use("/api/v1/experiences", experienceRoutes);
app.use("/api/v1/config", configRoutes);
app.use("/api/v1/admin/logs", logRoutes);
app.use("/api/v1/admin/projects", adminProjectRoutes);

// Catch 404 & Centralized Error Handler
app.use(notFoundMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  connectDB()
    .then(async () => {
      await migrateSiteConfigResumeUrl().catch((err) => {
        process.stderr.write(`SiteConfig migration warning: ${String(err)}\n`);
      });
      app.listen(PORT, () => {
        // LogEntry middleware is used for request logging; avoid standard console.log per rule
      });
    })
    .catch((err) => {
      // Critical startup error if MongoDB is unreachable
      process.stderr.write(`MongoDB Connection Failure: ${String(err)}\n`);
      process.exit(1);
    });
}

export default app;
export { app };