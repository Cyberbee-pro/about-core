import { Router } from "express";
import { getAdminLogs } from "../controllers/logController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", authMiddleware, getAdminLogs);

export default router;
