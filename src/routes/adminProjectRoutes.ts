import { Router } from "express";
import { getAdminProjects } from "../controllers/projectController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", authMiddleware, getAdminProjects);

export default router;
