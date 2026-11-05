import { Router } from "express";
import {
  getPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePerson,
} from "../controllers/personController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  personUploadFields,
  processPersonUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getPeople);
router.get("/:id", getPersonById);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  personUploadFields,
  processPersonUploads,
  createPerson
);

router.put(
  "/:id",
  authMiddleware,
  personUploadFields,
  processPersonUploads,
  updatePerson
);

router.delete("/:id", authMiddleware, deletePerson);

export default router;
