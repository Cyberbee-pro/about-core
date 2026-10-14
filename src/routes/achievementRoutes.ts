import { Router } from "express";
import {
  getAchievements,
  getAchievementById,
  createAchievement,
  updateAchievement,
  deleteAchievement,
} from "@/controllers/achievementController";
import { authMiddleware } from "@/middlewares/authMiddleware";

const router = Router();

// Public routes
router.get("/", getAchievements);
router.get("/:id", getAchievementById);

// Protected routes (Admin)
router.post("/", authMiddleware, createAchievement);
router.put("/:id", authMiddleware, updateAchievement);
router.delete("/:id", authMiddleware, deleteAchievement);

export default router;
