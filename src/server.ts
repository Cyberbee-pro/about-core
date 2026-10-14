import path from "path";
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import { dbLoggerMiddleware } from "./middlewares/dbLoggerMiddleware";
import { notFoundMiddleware, errorMiddleware } from "./middlewares/errorMiddleware";
import { getHealth } from "./controllers/configController";
import projectRoutes from "./routes/projectRoutes";
import skillRoutes from "./routes/skillRoutes";
import certificateRoutes from "./routes/certificateRoutes";
import achievementRoutes from "./routes/achievementRoutes";
import experienceRoutes from "./routes/experienceRoutes";
import configRoutes from "./routes/configRoutes";
import logRoutes from "./routes/logRoutes";

const app: Application = express();

// Global Middlewares
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : "*",
    credentials: true,
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
app.use("/api/v1/skills", skillRoutes);
app.use("/api/v1/certificates", certificateRoutes);
app.use("/api/v1/achievements", achievementRoutes);
app.use("/api/v1/experiences", experienceRoutes);
app.use("/api/v1/config", configRoutes);
app.use("/api/v1/admin/logs", logRoutes);

// Catch 404 & Centralized Error Handler
app.use(notFoundMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  connectDB()
    .then(() => {
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