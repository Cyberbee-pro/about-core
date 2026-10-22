import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { SiteConfig, IPfpItem } from "../models/SiteConfig";

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
  const { name, resumeDriveUrl, resumeUrl, statusMessage, bioSummary } = body;

  if (typeof name !== "string" || !name.trim()) missing.push("name");
  if (!Array.isArray(parsedJobTitles) || parsedJobTitles.length === 0) missing.push("jobTitles");

  const hasResume =
    (typeof resumeDriveUrl === "string" && Boolean(resumeDriveUrl.trim())) ||
    (typeof resumeUrl === "string" && Boolean(resumeUrl.trim()));

  if (!hasResume) missing.push("resumeDriveUrl");
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

    if ((pfpUrl && !pfpPublicId) || (!pfpUrl && pfpPublicId)) {
      res.status(400).json({
        success: false,
        message: "Both pfpUrl and pfpPublicId must be provided together",
      });
      return;
    }

    const initialHistory: IPfpItem[] = [];
    if (
      typeof pfpUrl === "string" &&
      pfpUrl.trim() &&
      typeof pfpPublicId === "string" &&
      pfpPublicId.trim()
    ) {
      initialHistory.push({
        url: pfpUrl.trim(),
        publicId: pfpPublicId.trim(),
        uploadedAt: new Date(),
      });
    }

    const effectiveResumeDriveUrl =
      typeof resumeDriveUrl === "string" && resumeDriveUrl.trim()
        ? (resumeDriveUrl as string).trim()
        : typeof req.body.resumeUrl === "string" && req.body.resumeUrl.trim()
        ? (req.body.resumeUrl as string).trim()
        : "";

    const config = await SiteConfig.create({
      name: (name as string).trim(),
      ...(typeof pfpUrl === "string" ? { pfpUrl: pfpUrl.trim() } : {}),
      ...(typeof pfpPublicId === "string" ? { pfpPublicId: pfpPublicId.trim() } : {}),
      ...(typeof req.body.resumeUrl === "string" && req.body.resumeUrl.trim()
        ? { resumeUrl: (req.body.resumeUrl as string).trim() }
        : {}),
      ...(typeof req.body.resumePublicId === "string" && req.body.resumePublicId.trim()
        ? { resumePublicId: (req.body.resumePublicId as string).trim() }
        : {}),
      pfpHistory: initialHistory,
      jobTitles: parsedJobTitles!,
      resumeDriveUrl: effectiveResumeDriveUrl,
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

    const effectiveResumeDriveUrl =
      typeof resumeDriveUrl === "string" && resumeDriveUrl.trim()
        ? (resumeDriveUrl as string).trim()
        : typeof req.body.resumeUrl === "string" && req.body.resumeUrl.trim()
        ? (req.body.resumeUrl as string).trim()
        : "";

    const setFields: Record<string, unknown> = {
      name: (name as string).trim(),
      jobTitles: parsedJobTitles!,
      resumeDriveUrl: effectiveResumeDriveUrl,
      statusMessage: (statusMessage as string).trim(),
      bioSummary: (bioSummary as string).trim(),
    };

    if (typeof req.body.resumeUrl === "string" && req.body.resumeUrl.trim()) {
      setFields.resumeUrl = (req.body.resumeUrl as string).trim();
    }
    if (typeof req.body.resumePublicId === "string" && req.body.resumePublicId.trim()) {
      setFields.resumePublicId = (req.body.resumePublicId as string).trim();
    }

    const hasUploadedFile = Boolean(
      req.files &&
        ((Array.isArray((req.files as Record<string, unknown[]>).pfp) &&
          (req.files as Record<string, unknown[]>).pfp.length > 0) ||
          (Array.isArray((req.files as Record<string, unknown[]>).pfpUrl) &&
            (req.files as Record<string, unknown[]>).pfpUrl.length > 0) ||
          (Array.isArray((req.files as Record<string, unknown[]>).image) &&
            (req.files as Record<string, unknown[]>).image.length > 0))
    );

    const incomingPublicId = typeof pfpPublicId === "string" ? pfpPublicId.trim() : undefined;
    const incomingUrl = typeof pfpUrl === "string" ? pfpUrl.trim() : undefined;

    const existingConfig = await SiteConfig.findOne();
    const existingHistory: IPfpItem[] = existingConfig?.pfpHistory
      ? [...existingConfig.pfpHistory]
      : [];

    if (
      existingConfig?.pfpUrl &&
      existingConfig?.pfpPublicId &&
      !existingHistory.some((item) => item.publicId === existingConfig.pfpPublicId)
    ) {
      existingHistory.push({
        url: existingConfig.pfpUrl,
        publicId: existingConfig.pfpPublicId,
        uploadedAt: existingConfig.updatedAt || new Date(),
      });
    }

    let newHistoryItem: IPfpItem | undefined;

    if (hasUploadedFile) {
      if (incomingUrl && incomingPublicId) {
        newHistoryItem = {
          url: incomingUrl,
          publicId: incomingPublicId,
          uploadedAt: new Date(),
        };
        setFields.pfpUrl = incomingUrl;
        setFields.pfpPublicId = incomingPublicId;
      }
    } else if (incomingPublicId || incomingUrl) {
      if (incomingPublicId && incomingUrl) {
        // Strict matching: both fields must match the exact same item in history
        const matchedItem = existingHistory.find(
          (item) => item.publicId === incomingPublicId && item.url === incomingUrl
        );
        if (!matchedItem) {
          res.status(400).json({
            success: false,
            message: "Selected profile picture does not match history or is mismatched",
          });
          return;
        }
        setFields.pfpUrl = matchedItem.url;
        setFields.pfpPublicId = matchedItem.publicId;
      } else if (incomingPublicId && !incomingUrl) {
        const matchedItem = existingHistory.find(
          (item) => item.publicId === incomingPublicId
        );
        if (!matchedItem) {
          res.status(400).json({
            success: false,
            message: "Profile picture publicId not found in history",
          });
          return;
        }
        setFields.pfpUrl = matchedItem.url;
        setFields.pfpPublicId = matchedItem.publicId;
      } else if (!incomingPublicId && incomingUrl) {
        const matchedItem = existingHistory.find((item) => item.url === incomingUrl);
        if (!matchedItem) {
          res.status(400).json({
            success: false,
            message: "Raw profile picture URL without valid publicId is not allowed",
          });
          return;
        }
        setFields.pfpUrl = matchedItem.url;
        setFields.pfpPublicId = matchedItem.publicId;
      }
    }

    const updateOps: Record<string, unknown> = {
      $set: setFields,
    };

    if (newHistoryItem) {
      updateOps.$push = {
        pfpHistory: {
          $each: [newHistoryItem],
          $position: 0,
        },
      };
    }

    const updatedConfig = await SiteConfig.findOneAndUpdate({}, updateOps, {
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

export const uploadResume = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.body.resumeUrl) {
      res.status(400).json({
        success: false,
        message: "No resume PDF file uploaded. Accepted multipart fields: resume, resumeFile, resumePdf, pdf",
      });
      return;
    }

    const setFields: Record<string, unknown> = {
      resumeUrl: req.body.resumeUrl,
      resumeDriveUrl: req.body.resumeUrl,
    };
    if (req.body.resumePublicId) {
      setFields.resumePublicId = req.body.resumePublicId;
    }

    const updatedConfig = await SiteConfig.findOneAndUpdate(
      {},
      { $set: setFields },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Resume PDF uploaded successfully",
      data: updatedConfig,
      resumeUrl: req.body.resumeUrl,
      resumePublicId: req.body.resumePublicId,
    });
  } catch (error) {
    next(error);
  }
};

