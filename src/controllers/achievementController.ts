import { Request, Response, NextFunction } from "express";
import { Achievement } from "@/models/Achievement";

export const getAchievements = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const achievements = await Achievement.find().sort({ weight: 1, title: 1 });
    res.status(200).json({
      success: true,
      count: achievements.length,
      data: achievements,
    });
  } catch (error) {
    next(error);
  }
};

export const getAchievementById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    next(error);
  }
};

export const createAchievement = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trimmedTitle = (req.body.title || "").trim();
    if (!trimmedTitle) {
      res.status(400).json({
        success: false,
        message: "Achievement title is required",
      });
      return;
    }

    const existingAchievement = await Achievement.findOne({
      title: { $regex: new RegExp(`^${trimmedTitle}$`, "i") },
    });

    if (existingAchievement) {
      res.status(409).json({
        success: false,
        message: "Achievement title must be unique (duplicate)",
      });
      return;
    }

    const achievement = await Achievement.create({
      title: trimmedTitle,
      detail: req.body.detail,
      date: req.body.date,
      weight: req.body.weight ?? 0,
    });

    res.status(201).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAchievement = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.title !== undefined) {
      const trimmedTitle = req.body.title.trim();
      const existingAchievement = await Achievement.findOne({
        title: { $regex: new RegExp(`^${trimmedTitle}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingAchievement) {
        res.status(409).json({
          success: false,
          message: "Achievement title must be unique (duplicate)",
        });
        return;
      }
      updateData.title = trimmedTitle;
    }

    if (req.body.detail !== undefined) updateData.detail = req.body.detail;
    if (req.body.date !== undefined) updateData.date = req.body.date;
    if (req.body.weight !== undefined) updateData.weight = req.body.weight;

    const achievement = await Achievement.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAchievement = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const achievement = await Achievement.findByIdAndDelete(req.params.id);

    if (!achievement) {
      res.status(404).json({
        success: false,
        message: "Achievement not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: achievement,
    });
  } catch (error) {
    next(error);
  }
};
