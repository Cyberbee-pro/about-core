import { Request, Response, NextFunction } from "express";
import { Certificate } from "../models/Certificate";
import { escapeRegex, isValidHttpUrl } from "../utils/stringUtils";

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
      title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") },
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

    const mediaUrl = typeof req.body.mediaUrl === "string" ? req.body.mediaUrl.trim() : "";
    if (mediaUrl !== "") {
      if (!isValidHttpUrl(mediaUrl)) {
        res.status(400).json({
          success: false,
          message: "mediaUrl must be a valid http or https URL",
        });
        return;
      }
    }

    let link: string | undefined = undefined;
    if (req.body.link !== undefined && req.body.link !== null) {
      const trimmedLink = String(req.body.link).trim();
      if (trimmedLink !== "") {
        if (!isValidHttpUrl(trimmedLink)) {
          res.status(400).json({
            success: false,
            message: "link must be a valid http or https URL",
          });
          return;
        }
        link = trimmedLink;
      }
    }

    const certificate = await Certificate.create({
      title: trimmedTitle,
      description: req.body.description || "",
      link,
      mediaUrl,
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
    const unsetData: Record<string, unknown> = {};
    if (req.body.title !== undefined) {
      const trimmedTitle = req.body.title.trim();
      const existingCert = await Certificate.findOne({
        title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") },
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
      if (req.body.link === null || (typeof req.body.link === "string" && req.body.link.trim() === "")) {
        unsetData.link = 1;
      } else {
        const link = String(req.body.link).trim();
        if (!isValidHttpUrl(link)) {
          res.status(400).json({
            success: false,
            message: "link must be a valid http or https URL",
          });
          return;
        }
        updateData.link = link;
      }
    }
    if (req.body.mediaUrl !== undefined) {
      const mediaUrl = typeof req.body.mediaUrl === "string" ? req.body.mediaUrl.trim() : "";
      if (mediaUrl !== "") {
        if (!isValidHttpUrl(mediaUrl)) {
          res.status(400).json({
            success: false,
            message: "mediaUrl must be a valid http or https URL",
          });
          return;
        }
        updateData.mediaUrl = mediaUrl;
      } else {
        updateData.mediaUrl = "";
      }
    }
    if (req.body.organization !== undefined) {
      updateData.organization = req.body.organization.trim();
    }
    if (req.body.weight !== undefined) {
      updateData.weight = Number(req.body.weight) || 0;
    }

    const updateQuery: Record<string, unknown> = {};
    if (Object.keys(updateData).length > 0) {
      updateQuery.$set = updateData;
    }
    if (Object.keys(unsetData).length > 0) {
      updateQuery.$unset = unsetData;
    }

    const certificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      updateQuery,
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
