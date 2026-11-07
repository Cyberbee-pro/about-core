import { Router } from "express";
import {
  getProjects,
  getCategories,
  getProjectBySlug,
  createProject,
  updateProject,
  deleteProject,
  addProjectVersion,
  updateProjectVersion,
  deleteProjectVersion,
  addProjectGallery,
  reorderProjectGallery,
  updateProjectGalleryImage,
  deleteProjectGalleryImage,
  addVersionGallery,
  reorderVersionGallery,
  updateVersionGalleryImage,
  deleteVersionGalleryImage,
} from "../controllers/projectController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  projectCreateUploadFields,
  projectUpdateUploadFields,
  galleryAddUploadFields,
  galleryItemUpdateUploadFields,
  processMediaUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getProjects);
router.get("/categories", getCategories);
router.get("/:slug", getProjectBySlug);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  projectCreateUploadFields,
  processMediaUploads,
  createProject
);

// Version Gallery Routes (registered before /:slug/versions/:versionId to prevent any shadowing)
// /gallery/order must be registered before /gallery/:imageId
router.post(
  "/:slug/versions/:versionId/gallery",
  authMiddleware,
  galleryAddUploadFields,
  processMediaUploads,
  addVersionGallery
);

router.put(
  "/:slug/versions/:versionId/gallery/order",
  authMiddleware,
  reorderVersionGallery
);

router.put(
  "/:slug/versions/:versionId/gallery/:imageId",
  authMiddleware,
  galleryItemUpdateUploadFields,
  processMediaUploads,
  updateVersionGalleryImage
);

router.delete(
  "/:slug/versions/:versionId/gallery/:imageId",
  authMiddleware,
  deleteVersionGalleryImage
);

// Version Routes
router.post(
  "/:slug/versions",
  authMiddleware,
  projectCreateUploadFields,
  processMediaUploads,
  addProjectVersion
);

router.put(
  "/:slug/versions/:versionId",
  authMiddleware,
  projectUpdateUploadFields,
  processMediaUploads,
  updateProjectVersion
);

router.delete(
  "/:slug/versions/:versionId",
  authMiddleware,
  deleteProjectVersion
);

// Project Gallery Routes (registered before /:id and /gallery/order before /gallery/:imageId)
router.post(
  "/:slug/gallery",
  authMiddleware,
  galleryAddUploadFields,
  processMediaUploads,
  addProjectGallery
);

router.put(
  "/:slug/gallery/order",
  authMiddleware,
  reorderProjectGallery
);

router.put(
  "/:slug/gallery/:imageId",
  authMiddleware,
  galleryItemUpdateUploadFields,
  processMediaUploads,
  updateProjectGalleryImage
);

router.delete(
  "/:slug/gallery/:imageId",
  authMiddleware,
  deleteProjectGalleryImage
);

// Project Mutation Routes
router.put(
  "/:id",
  authMiddleware,
  projectUpdateUploadFields,
  processMediaUploads,
  updateProject
);

router.delete("/:id", authMiddleware, deleteProject);

export { default as adminProjectRoutes } from "./adminProjectRoutes";
export {
  getAdminProjects,
  updateProjectVersion,
  deleteProjectVersion,
  addProjectGallery,
  reorderProjectGallery,
  updateProjectGalleryImage,
  deleteProjectGalleryImage,
  addVersionGallery,
  reorderVersionGallery,
  updateVersionGalleryImage,
  deleteVersionGalleryImage,
} from "../controllers/projectController";

export default router;
