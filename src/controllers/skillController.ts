import { Request, Response, NextFunction } from "express";
import { Skill } from "@/models/Skill";
import { escapeRegex } from "@/utils/stringUtils";

export const getSkills = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const skills = await Skill.find().sort({ weight: 1, name: 1 });
    res.status(200).json({
      success: true,
      count: skills.length,
      data: skills,
    });
  } catch (error) {
    next(error);
  }
};

export const getSkillById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      res.status(404).json({
        success: false,
        message: "Skill not found",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    next(error);
  }
};

export const createSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trimmedName = (req.body.name || "").trim();
    if (!trimmedName) {
      res.status(400).json({
        success: false,
        message: "Skill name is required",
      });
      return;
    }

    const existingSkill = await Skill.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
    });

    if (existingSkill) {
      res.status(409).json({
        success: false,
        message: "Skill name must be unique (duplicate)",
      });
      return;
    }

    const featured =
      req.body.featured === true || req.body.featured === "true";
    const weight =
      req.body.weight !== undefined ? Number(req.body.weight) || 0 : 0;

    const skill = await Skill.create({
      name: trimmedName,
      logoUrl: req.body.logoUrl || "",
      featured,
      weight,
    });

    res.status(201).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      const trimmedName = req.body.name.trim();
      const existingSkill = await Skill.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingSkill) {
        res.status(409).json({
          success: false,
          message: "Skill name must be unique (duplicate)",
        });
        return;
      }
      updateData.name = trimmedName;
    }

    if (req.body.logoUrl !== undefined) {
      updateData.logoUrl = req.body.logoUrl;
    }
    if (req.body.featured !== undefined) {
      updateData.featured =
        req.body.featured === true || req.body.featured === "true";
    }
    if (req.body.weight !== undefined) {
      updateData.weight = Number(req.body.weight) || 0;
    }

    const skill = await Skill.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!skill) {
      res.status(404).json({
        success: false,
        message: "Skill not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);

    if (!skill) {
      res.status(404).json({
        success: false,
        message: "Skill not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    next(error);
  }
};