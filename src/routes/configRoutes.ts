import { Router } from "express";
import {
  getSiteConfig,
  createSiteConfig,
  updateSiteConfig,
} from "../controllers/configController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  siteConfigUploadFields,
  processSiteConfigUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

router.get("/", getSiteConfig);
router.post(
  "/",
  authMiddleware,
  siteConfigUploadFields,
  processSiteConfigUploads,
  createSiteConfig
);
router.put(
  "/",
  authMiddleware,
  siteConfigUploadFields,
  processSiteConfigUploads,
  updateSiteConfig
);

export default router;

