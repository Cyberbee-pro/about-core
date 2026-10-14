import { Router } from "express";
import {
  getSkills,
  getSkillById,
  createSkill,
  updateSkill,
  deleteSkill,
} from "../controllers/skillController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  skillUploadFields,
  processSkillUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getSkills);
router.get("/:id", getSkillById);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  skillUploadFields,
  processSkillUploads,
  createSkill
);

router.put(
  "/:id",
  authMiddleware,
  skillUploadFields,
  processSkillUploads,
  updateSkill
);

router.delete("/:id", authMiddleware, deleteSkill);

export default router;