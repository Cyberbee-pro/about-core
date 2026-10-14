import { Router } from "express";
import {
  getCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
} from "../controllers/certificateController";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  certificateUploadFields,
  processCertificateUploads,
} from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/", getCertificates);
router.get("/:id", getCertificateById);

// Protected routes (Admin)
router.post(
  "/",
  authMiddleware,
  certificateUploadFields,
  processCertificateUploads,
  createCertificate
);

router.put(
  "/:id",
  authMiddleware,
  certificateUploadFields,
  processCertificateUploads,
  updateCertificate
);

router.delete("/:id", authMiddleware, deleteCertificate);

export default router;
