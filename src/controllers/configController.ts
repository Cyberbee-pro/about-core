import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { SiteConfig, IPfpItem } from "../models/SiteConfig";
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
  const { name, resumeUrl, statusMessage, bioSummary } = body;

  if (typeof name !== "string" || !name.trim()) missing.push("name");
  if (!Array.isArray(parsedJobTitles) || parsedJobTitles.length === 0) missing.push("jobTitles");
  if (typeof resumeUrl !== "string" || !resumeUrl.trim()) missing.push("resumeUrl");
  if (typeof statusMessage !== "string" || !statusMessage.trim()) missing.push("statusMessage");
  if (typeof bioSummary !== "string" || !bioSummary.trim()) missing.push("bioSummary");

  return missing;
};

export const hasUploadedResumeFile = (req: Request): boolean => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return Boolean(
    files &&
      ((Array.isArray(files.resume) && files.resume.length > 0) ||
        (Array.isArray(files.resumeFile) && files.resumeFile.length > 0) ||
        (Array.isArray(files.resumePdf) && files.resumePdf.length > 0) ||
        (Array.isArray(files.pdf) && files.pdf.length > 0))
  );
};

export const cleanupUploadedResume = async (req: Request): Promise<void> => {
  try {
    if (
      hasUploadedResumeFile(req) &&
      typeof req.body.resumePublicId === "string" &&
      req.body.resumePublicId.trim()
    ) {
      await cloudinary.uploader.destroy(req.body.resumePublicId.trim());
    }
  } catch {
    // Best-effort cleanup: safely swallow error so original API response or error is preserved
  }
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

    // Safety fallback for legacy or mocked documents: ensure resumeUrl is populated
    const legacyDoc = config as unknown as Record<string, unknown>;
    if (!config.resumeUrl && typeof legacyDoc.resumeDriveUrl === "string" && legacyDoc.resumeDriveUrl) {
      config.resumeUrl = legacyDoc.resumeDriveUrl;
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
      await cleanupUploadedResume(req);
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
      resumeUrl,
      resumePublicId,
      statusMessage,
      bioSummary,
    } = req.body;

    const parsedJobTitles = parseJobTitles(jobTitles);
    const missingFields = validateSiteConfigPayload(req.body, parsedJobTitles);

    if (missingFields.length > 0) {
      await cleanupUploadedResume(req);
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    if ((pfpUrl && !pfpPublicId) || (!pfpUrl && pfpPublicId)) {
      await cleanupUploadedResume(req);
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

    const config = await SiteConfig.create({
      name: (name as string).trim(),
      ...(typeof pfpUrl === "string" ? { pfpUrl: pfpUrl.trim() } : {}),
      ...(typeof pfpPublicId === "string" ? { pfpPublicId: pfpPublicId.trim() } : {}),
      resumeUrl: (resumeUrl as string).trim(),
      ...(typeof resumePublicId === "string" ? { resumePublicId: resumePublicId.trim() } : {}),
      pfpHistory: initialHistory,
      jobTitles: parsedJobTitles!,
      statusMessage: (statusMessage as string).trim(),
      bioSummary: (bioSummary as string).trim(),
    });

    res.status(201).json({
      success: true,
      message: "Site configuration created successfully",
      data: config,
    });
  } catch (error) {
    await cleanupUploadedResume(req);
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
      resumeUrl,
      resumePublicId,
      statusMessage,
      bioSummary,
    } = req.body;

    const parsedJobTitles = parseJobTitles(jobTitles);
    const missingFields = validateSiteConfigPayload(req.body, parsedJobTitles);

    if (missingFields.length > 0) {
      await cleanupUploadedResume(req);
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    const setFields: Record<string, unknown> = {
      name: (name as string).trim(),
      jobTitles: parsedJobTitles!,
      resumeUrl: (resumeUrl as string).trim(),
      statusMessage: (statusMessage as string).trim(),
      bioSummary: (bioSummary as string).trim(),
    };

    if (typeof resumePublicId === "string" && resumePublicId.trim()) {
      setFields.resumePublicId = resumePublicId.trim();
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
          await cleanupUploadedResume(req);
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
          await cleanupUploadedResume(req);
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
          await cleanupUploadedResume(req);
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
    await cleanupUploadedResume(req);
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
    const hasUploadedResume = hasUploadedResumeFile(req);

    if (!hasUploadedResume || !req.body.resumeUrl) {
      await cleanupUploadedResume(req);
      res.status(400).json({
        success: false,
        message: "No resume PDF file uploaded. Accepted multipart fields: resume, resumeFile, resumePdf, pdf",
      });
      return;
    }

    const setFields: Record<string, unknown> = {
      resumeUrl: req.body.resumeUrl,
    };
    if (req.body.resumePublicId) {
      setFields.resumePublicId = req.body.resumePublicId;
    }

    const updatedConfig = await SiteConfig.findOneAndUpdate(
      {},
      { $set: setFields },
      { new: true }
    );

    if (!updatedConfig) {
      await cleanupUploadedResume(req);
      res.status(404).json({
        success: false,
        message: "Site configuration not found. Create configuration before uploading a resume.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Resume PDF uploaded successfully",
      data: updatedConfig,
      resumeUrl: req.body.resumeUrl,
      resumePublicId: req.body.resumePublicId,
    });
  } catch (error) {
    await cleanupUploadedResume(req);
    next(error);
  }
};

