import { Router } from "express";
import {
  getContributors,
  getContributorById,
  createContributor,
  updateContributor,
  deleteContributor,
} from "../controllers/contributorController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  contributorUploadFields,
  processContributorUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getContributors);
router.get("/:id", getContributorById);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  contributorUploadFields,
  processContributorUploads,
  createContributor
);

router.put(
  "/:id",
  authMiddleware,
  contributorUploadFields,
  processContributorUploads,
  updateContributor
);

router.delete("/:id", authMiddleware, deleteContributor);

export default router;
