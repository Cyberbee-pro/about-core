import { Router } from "express";
import {
  getExperiences,
  getExperienceById,
  createExperience,
  updateExperience,
  deleteExperience,
  addExperiencePosition,
} from "../controllers/experienceController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  experienceUploadFields,
  processExperienceUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getExperiences);
router.get("/:id", getExperienceById);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  experienceUploadFields,
  processExperienceUploads,
  createExperience
);

router.post(
  "/:organization/positions",
  authMiddleware,
  experienceUploadFields,
  processExperienceUploads,
  addExperiencePosition
);

router.put(
  "/:id",
  authMiddleware,
  experienceUploadFields,
  processExperienceUploads,
  updateExperience
);

router.delete("/:id", authMiddleware, deleteExperience);

export default router;
