import { Schema, model, Document } from "mongoose";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ILogEntry extends Document {
  timestamp: Date;
  level: LogLevel;
  method: string;
  endpoint: string;
  statusCode: number;
  ip: string;
  message: string;
  metadata?: any;
  stack?: string;
}

const LogEntrySchema = new Schema<ILogEntry>({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, enum: ["INFO", "WARN", "ERROR"], required: true },
  method: { type: String, required: true },
  endpoint: { type: String, required: true },
  statusCode: { type: Number, required: true },
  ip: { type: String, default: "unknown" },
  message: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  stack: { type: String },
}, { timestamps: false });

export const LogEntry = model<ILogEntry>("LogEntry", LogEntrySchema);