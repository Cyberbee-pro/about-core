import { Request, Response, NextFunction } from "express";
import { LogEntry, LogLevel } from "../models/LogEntry";

export const dbLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  res.on("finish", () => {
    void (async () => {
      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode;

      let level: LogLevel = "INFO";
      if (statusCode >= 500) {
        level = "ERROR";
      } else if (statusCode >= 400) {
        level = "WARN";
      }

      const method = req.method;
      const endpoint = req.originalUrl || req.url;
      const forwardedFor = req.headers["x-forwarded-for"];
      const ip =
        (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : undefined) ||
        req.socket.remoteAddress ||
        req.ip ||
        "unknown";

      const message = `${method} ${endpoint} ${statusCode} - ${durationMs}ms`;

      const customMetadata: Record<string, unknown> =
        typeof res.locals.logMetadata === "object" && res.locals.logMetadata !== null
          ? (res.locals.logMetadata as Record<string, unknown>)
          : {};

      const metadata: Record<string, unknown> = {
        durationMs,
        query: req.query,
        userAgent: req.headers["user-agent"],
        ...customMetadata,
      };

      const stack: string | undefined =
        typeof res.locals.errorStack === "string" ? res.locals.errorStack : undefined;

      try {
        await LogEntry.create({
          timestamp: new Date(),
          level,
          method,
          endpoint,
          statusCode,
          ip,
          message,
          metadata,
          stack,
        });
      } catch {
        // Logging error should never bring down the serverless runtime or disrupt API responses
      }
    })();
  });

  next();
};
