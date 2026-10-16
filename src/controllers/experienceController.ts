import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Experience, IExperiencePosition } from "../models/Experience";
import { escapeRegex } from "../utils/stringUtils";

function parsePositions(val: unknown): IExperiencePosition[] {
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as IExperiencePosition[];
    } catch {
      return [];
    }
  }
  if (Array.isArray(val)) {
    return val as IExperiencePosition[];
  }
  return [];
}

function parseSkills(val: unknown): Types.ObjectId[] {
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val) as string[];
      return parsed.map((s) => new Types.ObjectId(s));
    } catch {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new Types.ObjectId(s));
    }
  }
  if (Array.isArray(val)) {
    return (val as unknown[]).map((s) => new Types.ObjectId(String(s)));
  }
  return [];
}

export const getExperiences = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const experiences = await Experience.find().sort({ weight: 1, organization: 1 });
    res.status(200).json({
      success: true,
      count: experiences.length,
      data: experiences,
    });
  } catch (error) {
    next(error);
  }
};

export const getExperienceById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const experience = await Experience.findById(req.params.id);
    if (!experience) {
      res.status(404).json({
        success: false,
        message: "Experience not found",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: experience,
    });
  } catch (error) {
    next(error);
  }
};

export const createExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trimmedOrg = (req.body.organization || "").trim();
    if (!trimmedOrg) {
      res.status(400).json({
        success: false,
        message: "Experience organization is required",
      });
      return;
    }

    const existingExperience = await Experience.findOne({
      organization: { $regex: new RegExp(`^${escapeRegex(trimmedOrg)}$`, "i") },
    });

    if (existingExperience) {
      res.status(409).json({
        success: false,
        message: "Experience organization must be unique (duplicate)",
      });
      return;
    }

    const positions = parsePositions(req.body.positions);
    const uploadedMediaUrls = req.body.uploadedMediaUrls as string[] | undefined;
    const uploadedCertUrls = req.body.uploadedCertificateUrls as string[] | undefined;

    if (uploadedMediaUrls && uploadedMediaUrls.length > 0) {
      if (positions.length === 0) {
        positions.push({
          position: "Member",
          description: "",
          startDate: new Date(),
          isCurrent: true,
          mediaUrls: uploadedMediaUrls,
          certificateUrls: [],
        });
      } else {
        positions[0].mediaUrls = [
          ...(positions[0].mediaUrls || []),
          ...uploadedMediaUrls,
        ];
      }
    }

    if (uploadedCertUrls && uploadedCertUrls.length > 0) {
      if (positions.length === 0) {
        positions.push({
          position: "Member",
          description: "",
          startDate: new Date(),
          isCurrent: true,
          mediaUrls: [],
          certificateUrls: uploadedCertUrls,
        });
      } else {
        positions[0].certificateUrls = [
          ...(positions[0].certificateUrls || []),
          ...uploadedCertUrls,
        ];
      }

    }

    const skills = parseSkills(req.body.skills);
    const weight =
      req.body.weight !== undefined ? Number(req.body.weight) || 0 : 0;

    const experience = await Experience.create({
      organization: trimmedOrg,
      tag: req.body.tag || "focus",
      type: req.body.type || "full_time",
      iconUrl: req.body.iconUrl || "",
      skills,
      weight,
      positions,
    });

    res.status(201).json({
      success: true,
      data: experience,
    });
  } catch (error) {
    next(error);
  }
};

export const updateExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.organization !== undefined) {
      const trimmedOrg = req.body.organization.trim();
      const existingExperience = await Experience.findOne({
        organization: { $regex: new RegExp(`^${escapeRegex(trimmedOrg)}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingExperience) {
        res.status(409).json({
          success: false,
          message: "Experience organization must be unique (duplicate)",
        });
        return;
      }
      updateData.organization = trimmedOrg;
    }

    if (req.body.tag !== undefined) updateData.tag = req.body.tag;
    if (req.body.type !== undefined) updateData.type = req.body.type;
    if (req.body.iconUrl !== undefined) updateData.iconUrl = req.body.iconUrl;
    if (req.body.skills !== undefined) updateData.skills = parseSkills(req.body.skills);
    if (req.body.weight !== undefined) updateData.weight = Number(req.body.weight) || 0;

    if (req.body.positions !== undefined) {
      const positions = parsePositions(req.body.positions);
      const uploadedMediaUrls = req.body.uploadedMediaUrls as string[] | undefined;
      const uploadedCertUrls = req.body.uploadedCertificateUrls as string[] | undefined;

      if (uploadedMediaUrls && uploadedMediaUrls.length > 0) {
        if (positions.length > 0) {
          positions[0].mediaUrls = [
            ...(positions[0].mediaUrls || []),
            ...uploadedMediaUrls,
          ];
        }
      }

      if (uploadedCertUrls && uploadedCertUrls.length > 0) {
        if (positions.length > 0) {
          positions[0].certificateUrls = [
            ...(positions[0].certificateUrls || []),
            ...uploadedCertUrls,
          ];
        }
      }
      updateData.positions = positions;
    }

    const experience = await Experience.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!experience) {
      res.status(404).json({
        success: false,
        message: "Experience not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: experience,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const experience = await Experience.findByIdAndDelete(req.params.id);

    if (!experience) {
      res.status(404).json({
        success: false,
        message: "Experience not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: experience,
    });
  } catch (error) {
    next(error);
  }
};

export const addExperiencePosition = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawParamOrg = req.params.organization || req.params.id;
    const organization =
      typeof rawParamOrg === "string"
        ? decodeURIComponent(rawParamOrg).trim()
        : "";

    const existingExperience = await Experience.findOne({
      organization: { $regex: new RegExp(`^${escapeRegex(organization)}$`, "i") },
    });

    if (!existingExperience) {
      res.status(404).json({
        success: false,
        message: `Experience not found for organization: ${organization}`,
      });
      return;
    }

    // Parse position: supports req.body.position (JSON string or object) or direct req.body fields
    let positionRaw: any = req.body.position;
    if (typeof positionRaw === "string") {
      try {
        positionRaw = JSON.parse(positionRaw);
      } catch {
        positionRaw = {};
      }
    } else if (!positionRaw || typeof positionRaw !== "object") {
      positionRaw = req.body;
    }

    const uploadedMediaUrls = req.body.uploadedMediaUrls as string[] | undefined;
    const uploadedCertUrls = req.body.uploadedCertificateUrls as string[] | undefined;

    let mediaUrls: string[] = [];
    if (Array.isArray(positionRaw.mediaUrls)) {
      mediaUrls = [...positionRaw.mediaUrls];
    } else if (typeof positionRaw.mediaUrls === "string") {
      try {
        const parsed = JSON.parse(positionRaw.mediaUrls);
        if (Array.isArray(parsed)) mediaUrls = parsed;
        else mediaUrls = [positionRaw.mediaUrls];
      } catch {
        mediaUrls = [positionRaw.mediaUrls];
      }
    }
    if (uploadedMediaUrls && uploadedMediaUrls.length > 0) {
      mediaUrls.push(...uploadedMediaUrls);
    }

    let certificateUrls: string[] = [];
    if (Array.isArray(positionRaw.certificateUrls)) {
      certificateUrls = [...positionRaw.certificateUrls];
    } else if (typeof positionRaw.certificateUrls === "string") {
      try {
        const parsed = JSON.parse(positionRaw.certificateUrls);
        if (Array.isArray(parsed)) certificateUrls = parsed;
        else certificateUrls = [positionRaw.certificateUrls];
      } catch {
        certificateUrls = [positionRaw.certificateUrls];
      }
    }
    if (uploadedCertUrls && uploadedCertUrls.length > 0) {
      certificateUrls.push(...uploadedCertUrls);
    }

    const isCurrent =
      positionRaw.isCurrent === true ||
      positionRaw.isCurrent === "true";

    const newPosition: IExperiencePosition = {
      position: positionRaw.position || positionRaw.title || positionRaw.positionTag || "Role",
      description: positionRaw.description || "",
      startDate: positionRaw.startDate ? new Date(positionRaw.startDate) : new Date(),
      endDate: positionRaw.endDate ? new Date(positionRaw.endDate) : undefined,
      isCurrent,
      mediaUrls,
      certificateUrls,
    };


    if (isCurrent) {
      await Experience.updateMany(
        { _id: existingExperience._id },
        { $set: { "positions.$[].isCurrent": false } }
      );
    }

    const updatedExperience = await Experience.findByIdAndUpdate(
      existingExperience._id,
      { $push: { positions: newPosition } },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Position added successfully",
      data: updatedExperience,
    });
  } catch (error) {
    next(error);
  }
};

