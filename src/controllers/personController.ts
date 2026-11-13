import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Person } from "../models/Person";
import { Project } from "../models/Project";
import { escapeRegex, extractParamString, isValidHttpUrl } from "../utils/stringUtils";
import { cleanupUploadedVersionMedia } from "../middlewares/uploadMiddleware";

export const getPeople = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query = Person.find();
    if (typeof (query as unknown as { collation?: unknown }).collation === "function") {
      (query as unknown as { collation: (arg: unknown) => typeof query }).collation({
        locale: "en",
        strength: 2,
      });
    }
    let people = await query.sort({ name: 1 });
    if (Array.isArray(people)) {
      people = [...people].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      );
    }

    res.status(200).json({
      success: true,
      count: people.length,
      data: people,
    });
  } catch (error) {
    next(error);
  }
};

export const getPersonById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawId = extractParamString(req.params.id);
    if (!rawId || !Types.ObjectId.isValid(rawId)) {
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }
    const id = rawId.toLowerCase();

    const person = await Person.findById(id);
    if (!person) {
      res.status(404).json({
        success: false,
        message: "Person not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: person,
    });
  } catch (error) {
    next(error);
  }
};

export const createPerson = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (typeof req.body.name !== "string" || !req.body.name.trim()) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Person name is required",
      });
      return;
    }
    const trimmedName = req.body.name.trim();

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

    let profileLink: string | null = null;
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

    const existingPerson = await Person.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
    });

    if (existingPerson) {
      await cleanupUploadedVersionMedia(req);
      res.status(409).json({
        success: false,
        message: "Person name must be unique (duplicate)",
      });
      return;
    }

    const person = await Person.create({
      name: trimmedName,
      profilePicUrl,
      profileLink,
    });

    res.status(201).json({
      success: true,
      data: person,
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const updatePerson = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawId = extractParamString(req.params.id);
    if (!rawId || !Types.ObjectId.isValid(rawId)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }
    const id = rawId.toLowerCase();

    const updateData: Record<string, unknown> = {};

    if (req.body.name !== undefined) {
      if (req.body.name === null || typeof req.body.name !== "string" || !req.body.name.trim()) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Person name cannot be empty",
        });
        return;
      }
      const trimmedName = req.body.name.trim();

      const existingPerson = await Person.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
        _id: { $ne: id },
      });

      if (existingPerson) {
        await cleanupUploadedVersionMedia(req);
        res.status(409).json({
          success: false,
          message: "Person name must be unique (duplicate)",
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
      if (req.body.profileLink === null || (typeof req.body.profileLink === "string" && req.body.profileLink.trim() === "")) {
        updateData.profileLink = null;
      } else {
        const trimmedLink = String(req.body.profileLink).trim();
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

    const person = await Person.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!person) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({
        success: false,
        message: "Person not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: person,
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const deletePerson = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawId = extractParamString(req.params.id);
    if (!rawId || !Types.ObjectId.isValid(rawId)) {
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }
    const id = rawId.toLowerCase();
    const targetObjectId = new Types.ObjectId(id);

    // Check if referenced by any project or version (as contributor or host)
    const matchingProjects = await Project.find({
      $or: [
        { "contributors.contributor": targetObjectId },
        { "versions.contributors.contributor": targetObjectId },
        { hostedBy: targetObjectId },
        { "versions.hostedBy": targetObjectId },
      ],
    });

    let contributorProjects = 0;
    let contributorVersions = 0;
    let hostProjects = 0;
    let hostVersions = 0;

    for (const proj of matchingProjects) {
      if (
        Array.isArray(proj.contributors) &&
        proj.contributors.some((c) => {
          const cId = c?.contributor ? String(c.contributor).toLowerCase() : "";
          return cId === id;
        })
      ) {
        contributorProjects++;
      }
      if (
        Array.isArray(proj.hostedBy) &&
        proj.hostedBy.some((h) => String(h).toLowerCase() === id)
      ) {
        hostProjects++;
      }
      if (Array.isArray(proj.versions)) {
        for (const ver of proj.versions) {
          if (
            Array.isArray(ver.contributors) &&
            ver.contributors.some((c) => {
              const cId = c?.contributor ? String(c.contributor).toLowerCase() : "";
              return cId === id;
            })
          ) {
            contributorVersions++;
          }
          if (
            Array.isArray(ver.hostedBy) &&
            ver.hostedBy.some((h) => String(h).toLowerCase() === id)
          ) {
            hostVersions++;
          }
        }
      }
    }

    if (
      contributorProjects > 0 ||
      contributorVersions > 0 ||
      hostProjects > 0 ||
      hostVersions > 0
    ) {
      res.status(409).json({
        success: false,
        message: `Cannot delete person: referenced as contributor in ${contributorProjects} project(s) and ${contributorVersions} project version(s), and as host in ${hostProjects} project(s) and ${hostVersions} project version(s)`,
      });
      return;
    }

    const person = await Person.findByIdAndDelete(id);
    if (!person) {
      res.status(404).json({
        success: false,
        message: "Person not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Person deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
