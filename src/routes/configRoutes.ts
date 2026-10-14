import { Router } from "express";
import { getSiteConfig, updateSiteConfig } from "../controllers/configController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", getSiteConfig);
router.put("/", authMiddleware, updateSiteConfig);

export default router;
