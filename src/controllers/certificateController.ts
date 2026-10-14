import { Request, Response, NextFunction } from "express";
import { Certificate } from "@/models/Certificate";

export const getCertificates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const certificates = await Certificate.find().sort({ weight: 1, title: 1 });
    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  } catch (error) {
    next(error);
  }
};

export const getCertificateById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const certificate = await Certificate.findById(req.params.id);
    if (!certificate) {
      res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    next(error);
  }
};

export const createCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const trimmedTitle = (req.body.title || "").trim();
    if (!trimmedTitle) {
      res.status(400).json({
        success: false,
        message: "Certificate title is required",
      });
      return;
    }

    const existingCert = await Certificate.findOne({
      title: { $regex: new RegExp(`^${trimmedTitle}$`, "i") },
    });

    if (existingCert) {
      res.status(409).json({
        success: false,
        message: "Certificate title must be unique (duplicate)",
      });
      return;
    }

    const weight =
      req.body.weight !== undefined ? Number(req.body.weight) || 0 : 0;

    const certificate = await Certificate.create({
      title: trimmedTitle,
      description: req.body.description || "",
      link: req.body.link,
      mediaUrl: req.body.mediaUrl || "",
      organization: (req.body.organization || "").trim(),
      weight,
    });

    res.status(201).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.title !== undefined) {
      const trimmedTitle = req.body.title.trim();
      const existingCert = await Certificate.findOne({
        title: { $regex: new RegExp(`^${trimmedTitle}$`, "i") },
        _id: { $ne: req.params.id },
      });

      if (existingCert) {
        res.status(409).json({
          success: false,
          message: "Certificate title must be unique (duplicate)",
        });
        return;
      }
      updateData.title = trimmedTitle;
    }

    if (req.body.description !== undefined) {
      updateData.description = req.body.description;
    }
    if (req.body.link !== undefined) {
      updateData.link = req.body.link;
    }
    if (req.body.mediaUrl !== undefined) {
      updateData.mediaUrl = req.body.mediaUrl;
    }
    if (req.body.organization !== undefined) {
      updateData.organization = req.body.organization.trim();
    }
    if (req.body.weight !== undefined) {
      updateData.weight = Number(req.body.weight) || 0;
    }

    const certificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!certificate) {
      res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const certificate = await Certificate.findByIdAndDelete(req.params.id);

    if (!certificate) {
      res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    next(error);
  }
};
