import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      adminAuthenticated?: boolean;
    }
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
}
