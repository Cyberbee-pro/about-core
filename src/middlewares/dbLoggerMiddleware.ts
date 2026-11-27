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

      const now = new Date();
      const dayKey = now.toISOString().slice(0, 10);
      const method = req.method;
      const endpoint = req.originalUrl || req.url;
      const forwardedFor = req.headers["x-forwarded-for"];
      const ip =
        (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : undefined) ||
        req.socket.remoteAddress ||
        req.ip ||
        "unknown";
      const rawUserAgent = req.headers["user-agent"];
      const userAgent =
        typeof rawUserAgent === "string" && rawUserAgent.trim() !== ""
          ? rawUserAgent.trim()
          : Array.isArray(rawUserAgent) && rawUserAgent[0]?.trim()
            ? rawUserAgent[0].trim()
            : "unknown";

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
        if (method === "GET" && statusCode < 400) {
          const updated = await LogEntry.findOneAndUpdate(
            {
              method: "GET",
              endpoint,
              ip,
              userAgent,
              dayKey,
            },
            {
              $inc: { visits: 1 },
              $set: {
                timestamp: now,
                message: `${method} ${endpoint} ${statusCode} (visits: 1)`,
              },
              $setOnInsert: {
                level: "INFO" as LogLevel,
                statusCode,
                metadata,
              },
            },
            { upsert: true, new: true }
          );

          if (updated && updated._id && typeof updated.visits === "number") {
            await LogEntry.updateOne(
              { _id: updated._id, visits: updated.visits },
              {
                $set: {
                  message: `${method} ${endpoint} ${statusCode} (visits: ${updated.visits})`,
                },
              }
            );
          }
        } else {
          await LogEntry.create({
            timestamp: now,
            level,
            method,
            endpoint,
            statusCode,
            ip,
            userAgent,
            dayKey,
            visits: 1,
            message,
            metadata,
            stack,
          });
        }
      } catch {
        // Logging error should never bring down the serverless runtime or disrupt API responses
      }
    })();
  });

  next();
};
