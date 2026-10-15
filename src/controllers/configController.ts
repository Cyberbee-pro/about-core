import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { SiteConfig, ISiteConfig } from "../models/SiteConfig";
import cloudinary from "../config/cloudinary";

const parseJobTitles = (input: unknown): string[] | undefined => {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
      if (typeof parsed === "string" && parsed.trim()) {
        return [parsed.trim()];
      }
    } catch {
      return input.split(",").map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean);
  }
  return undefined;
};

const validateSiteConfigPayload = (
  body: Record<string, unknown>,
  parsedJobTitles: string[] | undefined
): string[] => {
  const missing: string[] = [];
  const { name, resumeDriveUrl, statusMessage, bioSummary } = body;

  if (typeof name !== "string" || !name.trim()) missing.push("name");
  if (!Array.isArray(parsedJobTitles) || parsedJobTitles.length === 0) missing.push("jobTitles");
  if (typeof resumeDriveUrl !== "string" || !resumeDriveUrl.trim()) missing.push("resumeDriveUrl");
  if (typeof statusMessage !== "string" || !statusMessage.trim()) missing.push("statusMessage");
  if (typeof bioSummary !== "string" || !bioSummary.trim()) missing.push("bioSummary");

  return missing;
};

export const getSiteConfig = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const config = await SiteConfig.findOne();

    if (!config) {
      res.status(404).json({
        success: false,
        message: "Site configuration not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

export const createSiteConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const existing = await SiteConfig.findOne();
    if (existing) {
      res.status(409).json({
        success: false,
        message: "Site configuration already exists. Use PUT to update.",
      });
      return;
    }

    const {
      name,
      pfpUrl,
      pfpPublicId,
      jobTitles,
      resumeDriveUrl,
      statusMessage,
      bioSummary,
    } = req.body;

    const parsedJobTitles = parseJobTitles(jobTitles);
    const missingFields = validateSiteConfigPayload(req.body, parsedJobTitles);

    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    const config = await SiteConfig.create({
      name: (name as string).trim(),
      ...(typeof pfpUrl === "string" ? { pfpUrl: pfpUrl.trim() } : {}),
      ...(typeof pfpPublicId === "string" ? { pfpPublicId: pfpPublicId.trim() } : {}),
      jobTitles: parsedJobTitles!,
      resumeDriveUrl: (resumeDriveUrl as string).trim(),
      statusMessage: (statusMessage as string).trim(),
      bioSummary: (bioSummary as string).trim(),
    });

    res.status(201).json({
      success: true,
      message: "Site configuration created successfully",
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
    const {
      name,
      pfpUrl,
      pfpPublicId,
      jobTitles,
      resumeDriveUrl,
      statusMessage,
      bioSummary,
    } = req.body;

    const parsedJobTitles = parseJobTitles(jobTitles);
    const missingFields = validateSiteConfigPayload(req.body, parsedJobTitles);

    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    const updateData: Partial<ISiteConfig> = {
      name: (name as string).trim(),
      jobTitles: parsedJobTitles!,
      resumeDriveUrl: (resumeDriveUrl as string).trim(),
      statusMessage: (statusMessage as string).trim(),
      bioSummary: (bioSummary as string).trim(),
    };

    if (typeof pfpUrl === "string") updateData.pfpUrl = pfpUrl.trim();
    if (typeof pfpPublicId === "string") updateData.pfpPublicId = pfpPublicId.trim();

    const existingConfig = await SiteConfig.findOne();

    if (
      existingConfig?.pfpPublicId &&
      updateData.pfpPublicId &&
      existingConfig.pfpPublicId !== updateData.pfpPublicId
    ) {
      try {
        await cloudinary.uploader.destroy(existingConfig.pfpPublicId);
      } catch (err) {
        console.error("Failed to delete previous profile picture from Cloudinary:", err);
      }
    }

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

