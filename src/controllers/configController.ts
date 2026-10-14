import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { SiteConfig, ISiteConfig } from "@/models/SiteConfig";

export const getSiteConfig = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let config = await SiteConfig.findOne();

    if (!config) {
      config = await SiteConfig.create({
        resumeDriveUrl: "https://drive.google.com",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer specializing in distributed systems and 3D web applications.",
      });
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSiteConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { resumeDriveUrl, statusMessage, bioSummary } = req.body as Partial<ISiteConfig>;

    const updateData: Partial<ISiteConfig> = {};
    if (typeof resumeDriveUrl === "string") updateData.resumeDriveUrl = resumeDriveUrl;
    if (typeof statusMessage === "string") updateData.statusMessage = statusMessage;
    if (typeof bioSummary === "string") updateData.bioSummary = bioSummary;

    const updatedConfig = await SiteConfig.findOneAndUpdate({}, updateData, {
      new: true,
      upsert: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Site configuration updated successfully",
      data: updatedConfig,
    });
  } catch (error) {
    next(error);
  }
};

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: "healthy",
    service: "about-core",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    dbStatus: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || "development",
  });
};

