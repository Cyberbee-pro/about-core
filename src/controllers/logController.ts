import { Request, Response, NextFunction } from "express";
import { FilterQuery } from "mongoose";
import { LogEntry, ILogEntry, LogLevel } from "../models/LogEntry";

export interface LogQueryFilter {
  date?: string;
  month?: string;
  year?: string;
  level?: LogLevel;
  page?: string;
  limit?: string;
}

export const getAdminLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { date, month, year, level, page = "1", limit = "50" } = req.query as LogQueryFilter;

    const filter: FilterQuery<ILogEntry> = {};

    if (level && ["INFO", "WARN", "ERROR"].includes(level)) {
      filter.level = level;
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      filter.timestamp = { $gte: start, $lte: end };
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [yearPart, monthPart] = month.split("-").map(Number);
      const start = new Date(Date.UTC(yearPart, monthPart - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(yearPart, monthPart, 0, 23, 59, 59, 999));
      filter.timestamp = { $gte: start, $lte: end };
    } else if (year && /^\d{4}$/.test(year)) {
      const yearNum = Number(year);
      const start = new Date(Date.UTC(yearNum, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(yearNum, 11, 31, 23, 59, 59, 999));
      filter.timestamp = { $gte: start, $lte: end };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [total, logs] = await Promise.all([
      LogEntry.countDocuments(filter),
      LogEntry.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};
