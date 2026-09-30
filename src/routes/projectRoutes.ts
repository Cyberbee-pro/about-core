import { Router } from "express";
import {
  getProjects,
  getCategories,
  getProjectBySlug,
  createProject,
  updateProject,
  deleteProject,
  addProjectVersion,
} from "../controllers/projectController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { projectUploadFields, processMediaUploads } from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getProjects);
router.get("/categories", getCategories);
router.get("/:slug", getProjectBySlug);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  projectUploadFields,
  processMediaUploads,
  createProject
);

router.put(
  "/:id",
  authMiddleware,
  projectUploadFields,
  processMediaUploads,
  updateProject
);

router.delete("/:id", authMiddleware, deleteProject);

router.post("/:id/versions", authMiddleware, addProjectVersion);

export default router;
