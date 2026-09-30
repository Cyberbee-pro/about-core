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
  mediaType: "images" | "videos" | "models"
): FolderInfo => {
  const isProfile = reqPath.includes("/profile") || !slug;

  if (isProfile) {
    return {
      folder: `portfolio/profile/${mediaType}`,
      base: "profile",
    };
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
    const slug = deriveSlug(body);

    // Request‑level cache — one Map per request, shared across all uploads
    const cache: FolderCache = new Map();

    // 1. Process Image upload
    if (files.image && files.image.length > 0) {
      const imageFile = files.image[0];
      const { folder, base } = getFolderInfo(req.path, slug, "images");
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
      const { folder, base } = getFolderInfo(req.path, slug, "videos");
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
      const { folder, base } = getFolderInfo(req.path, slug, "models");
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
