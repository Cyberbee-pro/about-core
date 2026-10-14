import { Request, Response, NextFunction } from "express";
import multer, { FileFilterCallback } from "multer";
import { Readable } from "stream";
import { UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";
import { Experience } from "../models/Experience";
import { escapeRegex } from "../utils/stringUtils";

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

export const skillUploadFields = upload.fields([
  { name: "logoUrl", maxCount: 1 },
]);

export const certificateUploadFields = upload.fields([
  { name: "mediaUrl", maxCount: 1 },
]);

export const experienceUploadFields = upload.fields([
  { name: "iconUrl", maxCount: 1 },
  { name: "mediaUrls", maxCount: 10 },
  { name: "certificateUrls", maxCount: 10 },
]);

// ---------------------------------------------------------------------------
// Cloudinary upload helpers
// ---------------------------------------------------------------------------

export interface CloudinaryUploadOptions {
  folder: string;
  resource_type: "image" | "video" | "raw" | "auto";
  public_id?: string;
}

/** Minimal shape of a resource returned by cloudinary.search.execute() */
interface CloudinarySearchResource {
  public_id: string;
  folder: string;
  resource_type: string;
}

/** Shape of the object returned by cloudinary.search...execute() */
interface CloudinarySearchResult {
  resources: CloudinarySearchResource[];
  total_count: number;
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
        ...(options.public_id ? { public_id: options.public_id } : {}),
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

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

/**
 * Derive a URL‑safe slug from req.body.slug or req.body.title.
 * Returns null when neither field is available (profile fallback case).
 */
const deriveSlug = (body: Record<string, unknown>): string | null => {
  if (typeof body.slug === "string" && body.slug.trim()) {
    return body.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  if (typeof body.title === "string" && body.title.trim()) {
    return body.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  return null;
};

// ---------------------------------------------------------------------------
// Sequential naming with request‑level caching
// ---------------------------------------------------------------------------

/** Per‑request cache: folder → array of existing public_id strings (or null on error). */
type FolderCache = Map<string, string[] | null>;

/**
 * Determine the next sequential public_id for a file in the given folder.
 *
 * Algorithm:
 *  1. Check the request‑level cache for existing public_ids in `folder`.
 *  2. If not cached, query Cloudinary Search API once and cache the result.
 *  3. Extract numeric suffixes matching `{base}_{n}`, find max, return `{base}_{max+1}`.
 *  4. On search error → cache null → fall back to `{base}_{timestamp}`.
 *
 * After computing a public_id, it is immediately pushed into the cache so that
 * subsequent files in the SAME request get a unique number without re‑querying.
 */
export const getNextPublicId = async (
  cache: FolderCache,
  folder: string,
  base: string
): Promise<string> => {
  if (!cache.has(folder)) {
    try {
      const result: CloudinarySearchResult = (await cloudinary.search
        .expression(`folder:${folder}`)
        .max_results(500)
        .execute()) as CloudinarySearchResult;

      cache.set(
        folder,
        result.resources.map((r) => r.public_id)
      );
    } catch {
      // Search unavailable — mark folder as errored
      cache.set(folder, null);
    }
  }

  const existing = cache.get(folder);

  if (Array.isArray(existing)) {
    // Extract numeric suffixes: `{folder}/{base}_{n}`
    const prefix = `${folder}/${base}_`;
    const numbers = existing
      .filter((id) => id.startsWith(prefix))
      .map((id) => {
        const suffix = id.slice(prefix.length);
        const num = parseInt(suffix, 10);
        return Number.isNaN(num) ? 0 : num;
      });

    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const publicId = `${base}_${next}`;

    // Push into cache so next file in same request gets n+1
    existing.push(`${folder}/${publicId}`);

    return publicId;
  }

  // Fallback: timestamp‑based name (search errored)
  return `${base}_${Date.now()}`;
};

// ---------------------------------------------------------------------------
// Folder determination
// ---------------------------------------------------------------------------

interface FolderInfo {
  folder: string;
  base: string;
}

const getFolderInfo = (
  reqPath: string,
  slug: string | null,
  mediaType: "images" | "videos" | "models",
  versionTag?: string
): FolderInfo => {
  // Keep profile uploads tied to known profile endpoints. Substring matching
  // also classifies project slugs such as `/profile-site` as profile assets.
  const normalizedPath = reqPath.replace(/\/$/, "");
  const isProfile = normalizedPath === "/profile" || normalizedPath === "/profile/config";

  if (isProfile) {
    return {
      folder: `portfolio/profile/${mediaType}`,
      base: "profile",
    };
  }

  if (!slug) {
    return {
      folder: `portfolio/projects/misc/${mediaType}`,
      base: "misc",
    };
  }

  if (reqPath.includes("/versions") && versionTag) {
    const safeVersionTag = versionTag
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]|[-.]$/g, "");
    if (safeVersionTag) {
      return {
        folder: `portfolio/projects/${slug}/${safeVersionTag}/${mediaType}`,
        base: slug,
      };
    }
  }

  return {
    folder: `portfolio/projects/${slug}/${mediaType}`,
    base: slug,
  };
};

// ---------------------------------------------------------------------------
// Main media processing middleware
// ---------------------------------------------------------------------------

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
    const body = req.body as Record<string, unknown>;
    const isVersionUpload = req.path.includes("/versions");
    const routeSlug = typeof req.params.slug === "string" ? req.params.slug : null;
    const slug = routeSlug
      ? routeSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || null
      : deriveSlug(body);
    const versionTag = typeof body.versionTag === "string" ? body.versionTag : undefined;
    const resolveFolder = (mediaType: "images" | "videos" | "models") =>
      getFolderInfo(req.path, slug, mediaType, isVersionUpload ? versionTag : undefined);

    // Request‑level cache — one Map per request, shared across all uploads
    const cache: FolderCache = new Map();

    // 1. Process Image upload
    if (files.image && files.image.length > 0) {
      const imageFile = files.image[0];
      const { folder, base } = resolveFolder("images");
      const publicId = await getNextPublicId(cache, folder, base);

      const result = await uploadBufferToCloudinary(imageFile.buffer, {
        folder,
        resource_type: "image",
        public_id: publicId,
      });
      req.body.image = result.secure_url;
    }

    // 2. Process Video Demo upload
    if (files.videoDemo && files.videoDemo.length > 0) {
      const videoFile = files.videoDemo[0];
      const { folder, base } = resolveFolder("videos");
      const publicId = await getNextPublicId(cache, folder, base);

      const result = await uploadBufferToCloudinary(videoFile.buffer, {
        folder,
        resource_type: "video",
        public_id: publicId,
      });
      req.body.videoDemo = result.secure_url;
    }

    // 3. Process Raw 3D Model upload (.glb / .gltf)
    if (files.threeDModel && files.threeDModel.length > 0) {
      const modelFile = files.threeDModel[0];
      const { folder, base } = resolveFolder("models");
      const publicId = await getNextPublicId(cache, folder, base);

      const result = await uploadBufferToCloudinary(modelFile.buffer, {
        folder,
        resource_type: "raw",
        public_id: publicId,
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

// ---------------------------------------------------------------------------
// Skills, Certificates & Experiences Upload Helpers & Processors
// ---------------------------------------------------------------------------

export const deriveSkillName = (name: unknown): string => {
  if (typeof name === "string" && name.trim()) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
  return "skill";
};

export const deriveCertPublicId = (
  organization: unknown,
  title: unknown,
  dateOrYear?: unknown
): string => {
  const orgSlug =
    typeof organization === "string" && organization.trim()
      ? organization.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_+|_+$)+/g, "")
      : "org";
  const titleSlug =
    typeof title === "string" && title.trim()
      ? title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_+|_+$)+/g, "")
      : "cert";
  const textToScan = `${typeof title === "string" ? title : ""} ${typeof dateOrYear === "string" ? dateOrYear : ""}`;
  const yearMatch = textToScan.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  return `${orgSlug}_${titleSlug}_${year}`.replace(/_+/g, "_");
};

export const deriveExperienceOrg = (org: unknown): string => {
  if (typeof org === "string" && org.trim()) {
    return org
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
  return "organization";
};

export const processSkillUploads = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.files) {
      return next();
    }

    const files = req.files as MulterFilesMap;
    if (files.logoUrl && files.logoUrl.length > 0) {
      const file = files.logoUrl[0];
      const skillName = deriveSkillName(req.body.name);
      const folder = `portfolio/skills/${skillName}`;
      const result = await uploadBufferToCloudinary(file.buffer, {
        folder,
        resource_type: "image",
        public_id: skillName,
      });
      req.body.logoUrl = result.secure_url;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const processCertificateUploads = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.files) {
      return next();
    }

    const files = req.files as MulterFilesMap;
    if (files.mediaUrl && files.mediaUrl.length > 0) {
      const file = files.mediaUrl[0];
      const publicId = deriveCertPublicId(
        req.body.organization,
        req.body.title,
        req.body.date
      );
      const folder = "portfolio/certificate";
      const result = await uploadBufferToCloudinary(file.buffer, {
        folder,
        resource_type: "image",
        public_id: publicId,
      });
      req.body.mediaUrl = result.secure_url;
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const processExperienceUploads = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.files) {
      return next();
    }

    const files = req.files as MulterFilesMap;
    const rawParamOrg = typeof req.params.organization === "string"
      ? decodeURIComponent(req.params.organization).trim()
      : undefined;
    let rawTag = typeof req.body.tag === "string" ? req.body.tag.trim() : "";
    let rawOrg = typeof req.body.organization === "string"
      ? req.body.organization.trim()
      : (rawParamOrg || "");

    if ((!rawOrg || !rawTag) && (rawParamOrg || req.params.id)) {
      try {
        const query = rawParamOrg
          ? { organization: { $regex: new RegExp(`^${escapeRegex(rawParamOrg)}$`, "i") } }
          : { _id: req.params.id };
        const expDoc = await Experience.findOne(query);
        if (expDoc) {
          if (!rawOrg) rawOrg = expDoc.organization;
          if (!rawTag) rawTag = expDoc.tag;
        }
      } catch {
        // Fall back to defaults
      }
    }

    const tag = rawTag === "extracurricular" ? "extracurricular" : "focus";
    const orgSlug = deriveExperienceOrg(rawOrg);

    const cache: FolderCache = new Map();

    // 1. Process Icon upload
    if (files.iconUrl && files.iconUrl.length > 0) {
      const iconFile = files.iconUrl[0];
      const folder = `portfolio/experiences/${tag}/${orgSlug}/icons`;
      const result = await uploadBufferToCloudinary(iconFile.buffer, {
        folder,
        resource_type: "image",
        public_id: "experience_icon",
      });
      req.body.iconUrl = result.secure_url;
    }

    // 2. Process Media uploads
    if (files.mediaUrls && files.mediaUrls.length > 0) {
      const folder = `portfolio/experiences/${tag}/${orgSlug}/media`;
      const uploadedMediaUrls: string[] = [];
      for (const mediaFile of files.mediaUrls) {
        const publicId = await getNextPublicId(cache, folder, "experience_media");
        const result = await uploadBufferToCloudinary(mediaFile.buffer, {
          folder,
          resource_type: "image",
          public_id: publicId,
        });
        uploadedMediaUrls.push(result.secure_url);
      }
      req.body.uploadedMediaUrls = uploadedMediaUrls;
    }

    // 3. Process Certificate uploads
    if (files.certificateUrls && files.certificateUrls.length > 0) {
      const folder = `portfolio/experiences/${tag}/${orgSlug}/certificates`;
      const uploadedCertificateUrls: string[] = [];
      for (const certFile of files.certificateUrls) {
        const publicId = await getNextPublicId(cache, folder, "experience_certificate");
        const result = await uploadBufferToCloudinary(certFile.buffer, {
          folder,
          resource_type: "image",
          public_id: publicId,
        });
        uploadedCertificateUrls.push(result.secure_url);
      }
      req.body.uploadedCertificateUrls = uploadedCertificateUrls;
    }

    next();
  } catch (error) {
    next(error);
  }
};

