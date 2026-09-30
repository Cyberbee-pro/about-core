import { Request, Response, NextFunction } from "express";

export interface CustomError extends Error {
  statusCode?: number;
  errors?: Record<string, unknown>;
  code?: number;
}

export const notFoundMiddleware = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let errors: Record<string, unknown> | undefined;

  if (err instanceof Error) {
    const customErr = err as CustomError;
    message = customErr.message || message;
    res.locals.errorStack = customErr.stack;

    if (typeof customErr.statusCode === "number") {
      statusCode = customErr.statusCode;
    }

    // Handle Mongoose duplicate key error (code 11000)
    if (customErr.code === 11000) {
      statusCode = 409;
      message = "Duplicate key violation";
    }

    // Handle Mongoose validation errors
    if (customErr.name === "ValidationError" && customErr.errors) {
      statusCode = 400;
      message = "Validation Error";
      errors = customErr.errors;
    }

    // Handle Mongoose CastError (e.g., invalid ObjectId)
    if (customErr.name === "CastError") {
      statusCode = 400;
      message = "Invalid identifier format";
    }
  } else if (err && typeof err === "object") {
    const errObj = err as Record<string, unknown>;
    if (typeof errObj.message === "string") {
      message = errObj.message;
    }
    if (typeof errObj.stack === "string") {
      res.locals.errorStack = errObj.stack;
    }
  } else if (typeof err === "string") {
    message = err;
  }

  res.locals.logMetadata = {
    error: message,
    ...(errors ? { validationErrors: errors } : {}),
  };

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
};
