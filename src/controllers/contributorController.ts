import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Contributor } from "../models/Contributor";
import { Project } from "../models/Project";
import { escapeRegex, extractParamString, isValidHttpUrl } from "../utils/stringUtils";
import { cleanupUploadedVersionMedia } from "../middlewares/uploadMiddleware";

export const getContributors = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query = Contributor.find();
    if (typeof (query as unknown as { collation?: unknown }).collation === "function") {
      (query as unknown as { collation: (arg: unknown) => typeof query }).collation({
        locale: "en",
        strength: 2,
      });
    }
    let contributors = await query.sort({ name: 1 });
    if (Array.isArray(contributors)) {
      contributors = [...contributors].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      );
    }

    res.status(200).json({
      success: true,
      count: contributors.length,
      data: contributors,
    });
  } catch (error) {
    next(error);
  }
};

export const getContributorById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }

    const contributor = await Contributor.findById(id);
    if (!contributor) {
      res.status(404).json({
        success: false,
        message: "Contributor not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: contributor,
    });
  } catch (error) {
    next(error);
  }
};

export const createContributor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trimmedName = (req.body.name || "").trim();
    if (!trimmedName) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Contributor name is required",
      });
      return;
    }

    const profilePicUrl =
      typeof req.body.profilePicUrl === "string" ? req.body.profilePicUrl.trim() : "";
    if (!profilePicUrl) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Profile picture URL or file upload is required",
      });
      return;
    }
    if (!isValidHttpUrl(profilePicUrl)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "profilePicUrl must be a valid http or https URL",
      });
      return;
    }

    let profileLink: string | undefined = undefined;
    if (req.body.profileLink !== undefined && req.body.profileLink !== null) {
      const trimmedLink = String(req.body.profileLink).trim();
      if (trimmedLink) {
        if (!isValidHttpUrl(trimmedLink)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "profileLink must be a valid http or https URL",
          });
          return;
        }
        profileLink = trimmedLink;
      }
    }

    const existingContributor = await Contributor.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
    });

    if (existingContributor) {
      await cleanupUploadedVersionMedia(req);
      res.status(409).json({
        success: false,
        message: "Contributor name must be unique (duplicate)",
      });
      return;
    }

    const contributor = await Contributor.create({
      name: trimmedName,
      profilePicUrl,
      profileLink,
    });

    res.status(201).json({
      success: true,
      data: contributor,
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const updateContributor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);
    if (!id || !Types.ObjectId.isValid(id)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (req.body.name !== undefined) {
      const trimmedName = String(req.body.name).trim();
      if (!trimmedName) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Contributor name cannot be empty",
        });
        return;
      }

      const existingContributor = await Contributor.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingContributor) {
        await cleanupUploadedVersionMedia(req);
        res.status(409).json({
          success: false,
          message: "Contributor name must be unique (duplicate)",
        });
        return;
      }

      updateData.name = trimmedName;
    }

    if (req.body.profilePicUrl !== undefined) {
      const pic = typeof req.body.profilePicUrl === "string" ? req.body.profilePicUrl.trim() : "";
      if (!pic) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "profilePicUrl cannot be empty",
        });
        return;
      }
      if (!isValidHttpUrl(pic)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "profilePicUrl must be a valid http or https URL",
        });
        return;
      }
      updateData.profilePicUrl = pic;
    }

    if (req.body.profileLink !== undefined) {
      const trimmedLink = String(req.body.profileLink).trim();
      if (trimmedLink === "") {
        updateData.profileLink = undefined;
      } else {
        if (!isValidHttpUrl(trimmedLink)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "profileLink must be a valid http or https URL",
          });
          return;
        }
        updateData.profileLink = trimmedLink;
      }
    }

    const contributor = await Contributor.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!contributor) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({
        success: false,
        message: "Contributor not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: contributor,
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const deleteContributor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }

    // Check if referenced by any project or version
    const matchingProjects = await Project.find({
      $or: [
        { "contributors.contributor": id },
        { "versions.contributors.contributor": id },
      ],
    });

    let projectCount = 0;
    let versionCount = 0;

    for (const proj of matchingProjects) {
      if (
        Array.isArray(proj.contributors) &&
        proj.contributors.some((c) => String(c.contributor) === String(id))
      ) {
        projectCount++;
      }
      if (Array.isArray(proj.versions)) {
        for (const ver of proj.versions) {
          if (
            Array.isArray(ver.contributors) &&
            ver.contributors.some((c) => String(c.contributor) === String(id))
          ) {
            versionCount++;
          }
        }
      }
    }

    if (projectCount > 0 || versionCount > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete contributor: referenced by ${projectCount} project(s) and ${versionCount} version(s)`,
      });
      return;
    }

    const contributor = await Contributor.findByIdAndDelete(id);
    if (!contributor) {
      res.status(404).json({
        success: false,
        message: "Contributor not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Contributor deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
