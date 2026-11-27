import { EventEmitter } from "events";
import { Request, Response } from "express";
import { LogEntry } from "@/models/LogEntry";
import { dbLoggerMiddleware } from "@/middlewares/dbLoggerMiddleware";

jest.mock("@/models/LogEntry");

interface StoredLog {
  _id: string;
  timestamp: Date;
  level: string;
  method: string;
  endpoint: string;
  statusCode: number;
  ip: string;
  userAgent?: string;
  dayKey?: string;
  visits: number;
  message: string;
  metadata?: Record<string, unknown>;
}

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 25));

function invokeMiddleware(options: {
  method: string;
  url: string;
  statusCode: number;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const req = {
    method: options.method,
    originalUrl: options.url,
    url: options.url,
    headers: {
      ...(options.userAgent ? { "user-agent": options.userAgent } : {}),
      ...(options.ip ? { "x-forwarded-for": options.ip } : {}),
    },
    socket: { remoteAddress: options.ip || "127.0.0.1" },
    ip: options.ip || "127.0.0.1",
    query: {},
  } as unknown as Request;

  const res = new EventEmitter() as unknown as Response & EventEmitter;
  res.statusCode = options.statusCode;
  res.locals = {};

  dbLoggerMiddleware(req, res, () => {
    res.emit("finish");
  });

  return flushAsync();
}

describe("dbLoggerMiddleware daily GET deduplication", () => {
  let store: StoredLog[];

  beforeEach(() => {
    jest.clearAllMocks();
    store = [];

    (LogEntry.findOneAndUpdate as jest.Mock).mockImplementation(
      async (
        filter: Record<string, unknown>,
        update: {
          $inc?: { visits?: number };
          $set?: Record<string, unknown>;
          $setOnInsert?: Record<string, unknown>;
        }
      ) => {
        let doc = store.find(
          (entry) =>
            entry.method === filter.method &&
            entry.endpoint === filter.endpoint &&
            entry.ip === filter.ip &&
            entry.userAgent === filter.userAgent &&
            entry.dayKey === filter.dayKey
        );

        if (!doc) {
          doc = {
            _id: `log-${store.length + 1}`,
            method: String(filter.method),
            endpoint: String(filter.endpoint),
            ip: String(filter.ip),
            userAgent: String(filter.userAgent),
            dayKey: String(filter.dayKey),
            level: String(update.$setOnInsert?.level ?? "INFO"),
            statusCode: Number(update.$setOnInsert?.statusCode ?? 200),
            metadata: update.$setOnInsert?.metadata as Record<string, unknown>,
            timestamp: (update.$set?.timestamp as Date) ?? new Date(),
            message: String(update.$set?.message ?? ""),
            visits: 0,
          };
          store.push(doc);
        }

        doc.visits += update.$inc?.visits ?? 0;
        if (update.$set?.timestamp) {
          doc.timestamp = update.$set.timestamp as Date;
        }
        if (update.$set?.message) {
          doc.message = String(update.$set.message);
        }
        return { ...doc };
      }
    );

    (LogEntry.updateOne as jest.Mock).mockImplementation(
      async (
        filter: { _id: string; visits?: number },
        update: { $set?: Record<string, unknown> }
      ) => {
        const doc = store.find(
          (entry) =>
            entry._id === filter._id &&
            (filter.visits === undefined || entry.visits === filter.visits)
        );
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
        }
        return { modifiedCount: doc ? 1 : 0 };
      }
    );

    (LogEntry.create as jest.Mock).mockImplementation(
      async (payload: Omit<StoredLog, "_id">) => {
        const doc: StoredLog = {
          _id: `log-${store.length + 1}`,
          ...payload,
        };
        store.push(doc);
        return doc;
      }
    );
  });

  it("collapses repeated GET requests from the same IP + User-Agent on the same day and increments visits", async () => {
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/projects",
      statusCode: 200,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/projects",
      statusCode: 200,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/projects",
      statusCode: 200,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });

    expect(store).toHaveLength(1);
    expect(store[0].visits).toBe(3);
    expect(store[0].message).toBe("GET /api/v1/projects 200 (visits: 3)");
    expect(store[0].level).toBe("INFO");
    expect(LogEntry.create).not.toHaveBeenCalled();
  });

  it("creates separate entries for different User-Agents on the same IP and day", async () => {
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/projects",
      statusCode: 200,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/projects",
      statusCode: 200,
      ip: "203.0.113.10",
      userAgent: "curl/8.5.0",
    });

    expect(store).toHaveLength(2);
    expect(store[0].userAgent).toBe("Mozilla/5.0 Chrome");
    expect(store[0].visits).toBe(1);
    expect(store[1].userAgent).toBe("curl/8.5.0");
    expect(store[1].visits).toBe(1);
  });

  it("creates separate individual entries for POST and 4xx/5xx requests", async () => {
    await invokeMiddleware({
      method: "POST",
      url: "/api/v1/achievements",
      statusCode: 201,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "POST",
      url: "/api/v1/achievements",
      statusCode: 201,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/achievements/missing",
      statusCode: 404,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });
    await invokeMiddleware({
      method: "GET",
      url: "/api/v1/achievements",
      statusCode: 500,
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome",
    });

    expect(LogEntry.create).toHaveBeenCalledTimes(4);
    expect(LogEntry.findOneAndUpdate).not.toHaveBeenCalled();
    expect(store).toHaveLength(4);
    expect(store.every((entry) => entry.visits === 1)).toBe(true);
    expect(store[2].level).toBe("WARN");
    expect(store[3].level).toBe("ERROR");
  });
});
