import { Request, Response, NextFunction } from "express";
import { FilterQuery, Types } from "mongoose";
import {
  Project,
  IProject,
  IContributor,
  ISocialLink,
  IProjectVersion,
  ProjectStatus,
} from "../models/Project";

export interface ProjectQueryParams {
  category?: string;
  featured?: string;
  tag?: string;
}

function parseJsonField<T>(field: unknown, defaultValue: T): T {
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T;
    } catch {
      return defaultValue;
    }
  }
  if (field !== undefined && field !== null) {
    return field as T;
  }
  return defaultValue;
}

function extractParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] ?? "";
  }
  return param ?? "";
}

export const getProjects = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { category, featured, tag } = req.query as ProjectQueryParams;

    const filter: FilterQuery<IProject> = {
      status: { $ne: "invisible" },
    };

    if (category) {
      filter.category = category.toLowerCase().trim();
    }

    if (featured !== undefined) {
      filter.featured = featured === "true";
    }

    if (tag) {
      filter.tags = tag.toLowerCase().trim();
    }

    const projects = await Project.find(filter)
      .sort({ featured: -1, startDate: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: projects.length,
      data: projects,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const categories: string[] = await Project.distinct("category", {
      status: { $ne: "invisible" },
    });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();

    if (!slug) {
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    const project = await Project.findOne({ slug }).lean();

    if (!project) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    if (project.status === "invisible" && !req.adminAuthenticated) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({
        success: false,
        message: "Project title is required",
      });
      return;
    }

    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug.toLowerCase().trim()
        : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

    const category = typeof body.category === "string" ? body.category.toLowerCase().trim() : "";
    const description = typeof body.description === "string" ? body.description : "";
    const image = typeof body.image === "string" ? body.image : "";

    if (!image) {
      res.status(400).json({
        success: false,
        message: "Project image URL or image file upload is required",
      });
      return;
    }

    if (!category) {
      res.status(400).json({
        success: false,
        message: "Project category is required",
      });
      return;
    }

    if (!description) {
      res.status(400).json({
        success: false,
        message: "Project description is required",
      });
      return;
    }

    const startDate = body.startDate ? new Date(body.startDate as string) : new Date();
    const endDate = body.endDate ? new Date(body.endDate as string) : undefined;
    const featured = body.featured === true || body.featured === "true";
    const status = (body.status as ProjectStatus) || "planning";
    const videoDemo = typeof body.videoDemo === "string" ? body.videoDemo : undefined;
    const deployedLink = typeof body.deployedLink === "string" ? body.deployedLink : undefined;
    const githubLink = typeof body.githubLink === "string" ? body.githubLink : undefined;

    let tags: string[] = [];
    if (typeof body.tags === "string") {
      try {
        tags = JSON.parse(body.tags) as string[];
      } catch {
        tags = body.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      }
    } else if (Array.isArray(body.tags)) {
      tags = (body.tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }

    const contributors = parseJsonField<IContributor[]>(body.contributors, []);
    const socialLinks = parseJsonField<ISocialLink[]>(body.socialLinks, []);
    const versions = parseJsonField<IProjectVersion[]>(body.versions, []);
    const threeDModel = parseJsonField<{
      fileUrl: string;
      initialRotation?: [number, number, number];
      enableExplodedView: boolean;
    } | undefined>(body.threeDModel, undefined);

    const project = await Project.create({
      title,
      slug,
      category,
      description,
      featured,
      tags,
      startDate,
      endDate,
      contributors,
      status,
      image,
      videoDemo,
      socialLinks,
      threeDModel,
      deployedLink,
      githubLink,
      versions,
    });

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid project ID format",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updatePayload: Partial<IProject> = {};

    if (typeof body.title === "string") updatePayload.title = body.title.trim();
    if (typeof body.slug === "string") updatePayload.slug = body.slug.toLowerCase().trim();
    if (typeof body.category === "string") updatePayload.category = body.category.toLowerCase().trim();
    if (typeof body.description === "string") updatePayload.description = body.description;
    if (body.featured !== undefined) {
      updatePayload.featured = body.featured === true || body.featured === "true";
    }
    if (typeof body.status === "string") {
      updatePayload.status = body.status as ProjectStatus;
    }
    if (typeof body.image === "string") updatePayload.image = body.image;
    if (typeof body.videoDemo === "string") updatePayload.videoDemo = body.videoDemo;
    if (typeof body.deployedLink === "string") updatePayload.deployedLink = body.deployedLink;
    if (typeof body.githubLink === "string") updatePayload.githubLink = body.githubLink;
    if (body.startDate) updatePayload.startDate = new Date(body.startDate as string);
    if (body.endDate !== undefined) {
      updatePayload.endDate = body.endDate ? new Date(body.endDate as string) : undefined;
    }

    if (body.tags !== undefined) {
      if (typeof body.tags === "string") {
        try {
          updatePayload.tags = JSON.parse(body.tags) as string[];
        } catch {
          updatePayload.tags = body.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        }
      } else if (Array.isArray(body.tags)) {
        updatePayload.tags = (body.tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
      }
    }

    if (body.contributors !== undefined) {
      updatePayload.contributors = parseJsonField<IContributor[]>(body.contributors, []);
    }
    if (body.socialLinks !== undefined) {
      updatePayload.socialLinks = parseJsonField<ISocialLink[]>(body.socialLinks, []);
    }
    if (body.threeDModel !== undefined) {
      updatePayload.threeDModel = parseJsonField<{
        fileUrl: string;
        initialRotation?: [number, number, number];
        enableExplodedView: boolean;
      }>(body.threeDModel, { fileUrl: "", enableExplodedView: false });
    }
    if (body.versions !== undefined) {
      updatePayload.versions = parseJsonField<IProjectVersion[]>(body.versions, []);
    }

    const updatedProject = await Project.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        message: `Project not found with id: ${id}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid project ID format",
      });
      return;
    }

    const deletedProject = await Project.findByIdAndDelete(id);

    if (!deletedProject) {
      res.status(404).json({
        success: false,
        message: `Project not found with id: ${id}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const addProjectVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();

    if (!slug) {
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    const body = req.body as Partial<IProjectVersion> & {
      threeDModel?: { fileUrl?: string } | string;
    };
    const threeDModel = parseJsonField<{ fileUrl?: string } | undefined>(
      body.threeDModel,
      undefined
    );
    const {
      versionTag,
      releaseDate,
      changelog,
      image,
      videoDemo,
      demoUrl,
      threeDFileUrl,
      isLatest,
    } = body;

    if (!versionTag) {
      res.status(400).json({
        success: false,
        message: "Version tag is required (e.g., 'v1.0.0')",
      });
      return;
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    const shouldSetLatest = Boolean(isLatest ?? false);

    if (shouldSetLatest) {
      project.versions.forEach((v) => {
        v.isLatest = false;
      });
    }

    const newVersion: IProjectVersion = {
      versionTag,
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      changelog: Array.isArray(changelog) ? changelog : [],
      image,
      videoDemo,
      demoUrl,
      threeDFileUrl:
        threeDFileUrl ??
        threeDModel?.fileUrl,
      isLatest: shouldSetLatest,
    };

    project.versions.push(newVersion);
    await project.save();

    res.status(201).json({
      success: true,
      message: "Version added successfully",
      data: project,
    });
  } catch (error) {
    next(error);
  }
};
