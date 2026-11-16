import { Request } from "express";

export interface UploadedMediaAsset {
  publicId: string;
  resourceType: "image" | "video" | "raw" | "auto";
}

declare global {
  namespace Express {
    interface Request {
      adminAuthenticated?: boolean;
      uploadedMediaAssets?: UploadedMediaAsset[];
      galleryUploadedFiles?: Array<{ url: string }>;
    }
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
}
