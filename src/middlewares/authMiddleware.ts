import { Request, Response, NextFunction } from "express";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    res.status(500).json({
      success: false,
      message: "Server configuration error: ADMIN_SECRET is not configured",
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers["x-admin-token"];

  let token: string | undefined;

  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (typeof customHeader === "string") {
    token = customHeader.trim();
  }

  if (!token || token !== adminSecret) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or missing admin credentials",
    });
    return;
  }

  req.adminAuthenticated = true;
  next();
};
