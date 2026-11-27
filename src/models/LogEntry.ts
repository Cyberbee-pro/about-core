import { Schema, model, Document } from "mongoose";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ILogEntry extends Document {
  timestamp: Date;
  level: LogLevel;
  method: string;
  endpoint: string;
  statusCode: number;
  ip: string;
  userAgent?: string;
  dayKey?: string;
  visits: number;
  message: string;
  metadata?: Record<string, unknown>;
  stack?: string;
}

const LogEntrySchema = new Schema<ILogEntry>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    level: { type: String, enum: ["INFO", "WARN", "ERROR"], required: true },
    method: { type: String, required: true },
    endpoint: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ip: { type: String, default: "unknown" },
    userAgent: { type: String },
    dayKey: { type: String },
    visits: { type: Number, default: 1 },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    stack: { type: String },
  },
  { timestamps: false }
);

LogEntrySchema.index({ method: 1, endpoint: 1, ip: 1, userAgent: 1, dayKey: 1 });

export const LogEntry = model<ILogEntry>("LogEntry", LogEntrySchema);