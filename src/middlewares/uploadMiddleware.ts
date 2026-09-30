import { Request, Response, NextFunction } from "express";
import multer, { FileFilterCallback } from "multer";
import { Readable } from "stream";
import { UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const allowedImageMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ];
  const allowedVideoMimes = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
  ];
  const is3DModelExtension = /\.(glb|gltf)$/i.test(file.originalname);
  const isImage = file.mimetype.startsWith("image/") || allowedImageMimes.includes(file.mimetype);
  const isVideo = file.mimetype.startsWith("video/") || allowedVideoMimes.includes(file.mimetype);
  const is3DModel =
    is3DModelExtension ||
    file.mimetype === "model/gltf-binary" ||
    file.mimetype === "model/gltf+json" ||
    file.mimetype === "application/octet-stream";

  if (isImage || isVideo || is3DModel) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname})`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for large 3D models or videos
  },
});

export const projectUploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "videoDemo", maxCount: 1 },
  { name: "threeDModel", maxCount: 1 },
]);

export interface CloudinaryUploadOptions {
  folder: string;
  resource_type: "image" | "video" | "raw" | "auto";
}

export const uploadBufferToCloudinary = (
  buffer: Buffer,
  options: CloudinaryUploadOptions
): Promise<UploadApiResponse> => {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resource_type,
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary upload failed with empty result"));
        }
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
};

type MulterFilesMap = Record<string, Express.Multer.File[]>;

export const processMediaUploads = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.files) {
      return next();
    }

    const files = req.files as MulterFilesMap;

    // 1. Process Image upload
    if (files.image && files.image.length > 0) {
      const imageFile = files.image[0];
      const result = await uploadBufferToCloudinary(imageFile.buffer, {
        folder: "portfolio/images",
        resource_type: "image",
      });
      req.body.image = result.secure_url;
    }

    // 2. Process Video Demo upload
    if (files.videoDemo && files.videoDemo.length > 0) {
      const videoFile = files.videoDemo[0];
      const result = await uploadBufferToCloudinary(videoFile.buffer, {
        folder: "portfolio/videos",
        resource_type: "video",
      });
      req.body.videoDemo = result.secure_url;
    }

    // 3. Process Raw 3D Model upload (.glb / .gltf)
    if (files.threeDModel && files.threeDModel.length > 0) {
      const modelFile = files.threeDModel[0];
      const result = await uploadBufferToCloudinary(modelFile.buffer, {
        folder: "portfolio/models",
        resource_type: "raw",
      });

      let existingThreeDModel: Record<string, unknown> = {};
      if (typeof req.body.threeDModel === "string") {
        try {
          existingThreeDModel = JSON.parse(req.body.threeDModel) as Record<string, unknown>;
        } catch {
          existingThreeDModel = {};
        }
      } else if (
        typeof req.body.threeDModel === "object" &&
        req.body.threeDModel !== null
      ) {
        existingThreeDModel = req.body.threeDModel as Record<string, unknown>;
      }

      req.body.threeDModel = {
        ...existingThreeDModel,
        fileUrl: result.secure_url,
        initialRotation:
          (existingThreeDModel.initialRotation as [number, number, number]) || [0, 0, 0],
        enableExplodedView: Boolean(existingThreeDModel.enableExplodedView ?? false),
      };
    }

    next();
  } catch (error) {
    next(error);
  }
};
