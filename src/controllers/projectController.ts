import { Request, Response, NextFunction } from "express";
import { FilterQuery, Types } from "mongoose";
import { escapeRegex, isValidHttpUrl, isHttpUrl, normalizeHttpUrl } from "../utils/stringUtils";
import { cleanupUploadedVersionMedia } from "../middlewares/uploadMiddleware";
import {
  Project,
  IProject,
  IProjectContributor,
  ISocialLink,
  IProjectVersion,
  IGalleryImage,
  ProjectStatus,
} from "../models/Project";
import { Person } from "../models/Person";

export const GALLERY_TAG_REGEX = /^[a-z0-9][a-z0-9_+#.-]{0,23}$/;

export interface FormattedContributor {
  _id: string;
  name: string;
  profilePicUrl: string;
  profileLink: string | null;
  role: string | null;
}

export interface FormattedPerson {
  _id: string;
  name: string;
  profilePicUrl: string;
  profileLink: string | null;
}

export function formatContributors(rawContributors: unknown): FormattedContributor[] {
  if (!Array.isArray(rawContributors)) {
    return [];
  }
  const result: FormattedContributor[] = [];

  for (const item of rawContributors) {
    if (!item || typeof item !== "object") continue;
    const cObj = (item as Record<string, unknown>).contributor;
    if (!cObj || typeof cObj !== "object") continue;

    const populated = cObj as Record<string, unknown>;
    if (typeof populated.name !== "string" || typeof populated.profilePicUrl !== "string") {
      continue;
    }

    const contributorId = populated._id ? String(populated._id) : "";
    const name = populated.name;
    const profilePicUrl = populated.profilePicUrl;
    const profileLink =
      typeof populated.profileLink === "string" && populated.profileLink.trim()
        ? populated.profileLink.trim()
        : null;

    const rawRole = (item as Record<string, unknown>).role;
    const role =
      typeof rawRole === "string" && rawRole.trim()
        ? rawRole.trim()
        : null;

    result.push({
      _id: contributorId,
      name,
      profilePicUrl,
      profileLink,
      role,
    });
  }

  return result;
}

export function formatHostedBy(rawHostedBy: unknown): FormattedPerson[] {
  if (!Array.isArray(rawHostedBy)) {
    return [];
  }
  const result: FormattedPerson[] = [];

  for (const item of rawHostedBy) {
    if (!item || typeof item !== "object") continue;
    const populated = item as Record<string, unknown>;
    if (typeof populated.name !== "string" || typeof populated.profilePicUrl !== "string") {
      continue;
    }

    const personId = populated._id ? String(populated._id) : "";
    const name = populated.name;
    const profilePicUrl = populated.profilePicUrl;
    const profileLink =
      typeof populated.profileLink === "string" && populated.profileLink.trim()
        ? populated.profileLink.trim()
        : null;

    result.push({
      _id: personId,
      name,
      profilePicUrl,
      profileLink,
    });
  }

  return result;
}

export function formatProjectResponse<T>(project: T): T {
  if (!project || typeof project !== "object") {
    return project;
  }
  const obj = typeof (project as { toObject?: unknown }).toObject === "function"
    ? ((project as unknown) as { toObject: () => Record<string, unknown> }).toObject()
    : { ...(project as Record<string, unknown>) };

  if (!Array.isArray(obj.gallery)) {
    obj.gallery = [];
  }
  obj.contributors = formatContributors(obj.contributors);
  obj.host = obj.host === "people" ? "people" : "self";
  obj.hostedBy = formatHostedBy(obj.hostedBy);
  obj.forkedFrom = typeof obj.forkedFrom === "string" && obj.forkedFrom.trim() ? obj.forkedFrom.trim() : null;
  if (obj.deployedLink !== undefined) {
    obj.deployedLink = typeof obj.deployedLink === "string" && obj.deployedLink.trim() ? obj.deployedLink.trim() : null;
  }
  if (obj.githubLink !== undefined) {
    obj.githubLink = typeof obj.githubLink === "string" && obj.githubLink.trim() ? obj.githubLink.trim() : null;
  }
  if (obj.videoDemo !== undefined) {
    obj.videoDemo = typeof obj.videoDemo === "string" && obj.videoDemo.trim() ? obj.videoDemo.trim() : null;
  }

  const projectHost = obj.host;
  const projectHostedBy = obj.hostedBy;

  let formattedVersions: unknown[] | undefined = undefined;
  if (Array.isArray(obj.versions)) {
    formattedVersions = obj.versions.map((v) => {
      if (v && typeof v === "object") {
        const vObj = typeof (v as { toObject?: unknown }).toObject === "function"
          ? ((v as unknown) as { toObject: () => Record<string, unknown> }).toObject()
          : { ...(v as Record<string, unknown>) };
        if (!Array.isArray(vObj.gallery)) {
          vObj.gallery = [];
        }
        vObj.status = vObj.status !== undefined && vObj.status !== null ? vObj.status : null;
        vObj.startDate = vObj.startDate !== undefined && vObj.startDate !== null ? vObj.startDate : null;
        vObj.endDate = vObj.endDate !== undefined && vObj.endDate !== null ? vObj.endDate : null;
        vObj.deployedLink = vObj.deployedLink !== undefined && vObj.deployedLink !== null ? vObj.deployedLink : null;
        vObj.githubLink = vObj.githubLink !== undefined && vObj.githubLink !== null ? vObj.githubLink : null;
        vObj.contributors = formatContributors(vObj.contributors);
        vObj.socialLinks = Array.isArray(vObj.socialLinks) ? vObj.socialLinks : [];

        const hasHostOverride = vObj.host === "self" || vObj.host === "people";
        vObj.host = hasHostOverride ? vObj.host : null;
        vObj.hostedBy = hasHostOverride ? formatHostedBy(vObj.hostedBy) : [];

        if (hasHostOverride) {
          vObj.effectiveHost = vObj.host;
          vObj.effectiveHostedBy = vObj.host === "self" ? [] : vObj.hostedBy;
        } else {
          vObj.effectiveHost = projectHost;
          vObj.effectiveHostedBy = projectHostedBy;
        }

        return vObj;
      }
      return v;
    });
  }

  if (formattedVersions !== undefined) {
    return { ...obj, versions: formattedVersions } as T;
  }
  return obj as T;
}

export async function populateProjectDoc(project: unknown): Promise<void> {
  if (project && typeof (project as { populate?: unknown }).populate === "function") {
    try {
      await (project as { populate: (paths: string[]) => Promise<unknown> }).populate([
        "contributors.contributor",
        "versions.contributors.contributor",
        "hostedBy",
        "versions.hostedBy",
      ]);
    } catch {
      // In tests where populate is mocked or throws, continue gracefully
    }
  }
}

export function parseRawGalleryTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item));
        }
      } catch {
        // Fall back to comma-separated
      }
    }
    return trimmed.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [String(raw)];
}

export interface ParseGalleryTagsResult {
  tags?: string[];
  error?: string;
}

export function normalizeAndValidateGalleryTags(raw: unknown): ParseGalleryTagsResult {
  const rawList = parseRawGalleryTags(raw);
  const normalizedSet = new Set<string>();

  for (const rawTag of rawList) {
    const trimmed = String(rawTag).trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const hyphenated = lower.replace(/\s+/g, "-");
    normalizedSet.add(hyphenated);
  }

  const tags = Array.from(normalizedSet);

  if (tags.length > 8) {
    return { error: "At most 8 tags allowed per image" };
  }

  for (const tag of tags) {
    if (!GALLERY_TAG_REGEX.test(tag)) {
      return {
        error: `Invalid tag '${tag}'. Tags must match ^[a-z0-9][a-z0-9_+#.-]{0,23}$`,
      };
    }
  }

  return { tags };
}

export interface ValidateGalleryCaptionResult {
  caption?: string;
  error?: string;
}

export function validateGalleryCaption(raw: unknown): ValidateGalleryCaptionResult {
  if (raw === undefined || raw === null) {
    return { caption: "" };
  }
  if (typeof raw !== "string") {
    return { error: "Caption must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 200) {
    return { error: "Caption cannot exceed 200 characters" };
  }
  return { caption: trimmed };
}

export { isValidHttpUrl, isHttpUrl, normalizeHttpUrl };

export interface ParseContributorsResult {
  contributors?: IProjectContributor[];
  error?: string;
}

export async function parseAndValidateContributors(
  raw: unknown
): Promise<ParseContributorsResult> {
  if (raw === undefined) {
    return { contributors: undefined };
  }

  let list: unknown[] = [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { contributors: [] };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { error: "Contributors must be an array" };
      }
      list = parsed;
    } catch {
      return { error: "Invalid JSON format for contributors" };
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    return { error: "Contributors must be an array" };
  }

  if (list.length === 0) {
    return { contributors: [] };
  }

  const result: IProjectContributor[] = [];
  const seenIds = new Set<string>();
  const idsToVerify: Types.ObjectId[] = [];

  for (const item of list) {
    if (!item) {
      return { error: "Invalid contributor entry: null or undefined" };
    }

    let contributorIdStr: string;
    let role: string | undefined = undefined;

    if (typeof item === "string") {
      contributorIdStr = item.trim();
    } else if (typeof item === "object") {
      const itemObj = item as Record<string, unknown>;

      // Check if client sent old embedded format ({ name, profilePicUrl })
      if (!itemObj.contributor && (itemObj.name !== undefined || itemObj.profilePicUrl !== undefined)) {
        return {
          error:
            "Invalid contributor format: contributors must reference Contributor IDs via { contributor: '<id>', role?: '<role>' } or bare ID strings. Embedded contributor objects with name/profilePicUrl are no longer supported.",
        };
      }

      if (!itemObj.contributor) {
        return { error: "Contributor object must contain a 'contributor' ID field" };
      }

      contributorIdStr = String(itemObj.contributor).trim();

      if (itemObj.role !== undefined && itemObj.role !== null) {
        if (typeof itemObj.role !== "string") {
          return { error: "Contributor role must be a string" };
        }
        const trimmedRole = itemObj.role.trim();
        if (trimmedRole.length > 40) {
          return { error: "Contributor role cannot exceed 40 characters" };
        }
        role = trimmedRole.length > 0 ? trimmedRole : undefined;
      }
    } else {
      return { error: "Invalid contributor format: expected string ID or object" };
    }

    if (!Types.ObjectId.isValid(contributorIdStr)) {
      return { error: `Invalid contributor ID format: '${contributorIdStr}'` };
    }

    if (seenIds.has(contributorIdStr)) {
      return { error: `Duplicate contributor detected in list: '${contributorIdStr}'` };
    }
    seenIds.add(contributorIdStr);

    const objId = new Types.ObjectId(contributorIdStr);
    idsToVerify.push(objId);
    result.push({
      contributor: objId,
      role,
    });
  }

  // Verify all IDs exist in Person collection
  const existing = await Person.find({ _id: { $in: idsToVerify } });
  if (existing.length !== idsToVerify.length) {
    const existingIdStrs = new Set(existing.map((c) => String(c._id)));
    const unknownIds = idsToVerify
      .map(String)
      .filter((id) => !existingIdStrs.has(id));
    return {
      error: `Unknown contributor ID(s): ${unknownIds.join(", ")}`,
    };
  }

  return { contributors: result };
}

export interface ParseHostedByResult {
  hostedBy?: Types.ObjectId[];
  error?: string;
}

export async function parseAndValidateHostedBy(
  raw: unknown
): Promise<ParseHostedByResult> {
  if (raw === undefined) {
    return { hostedBy: undefined };
  }

  let list: unknown[] = [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { hostedBy: [] };
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          list = parsed;
        } else {
          list = [trimmed];
        }
      } catch {
        list = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else {
      list = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    list = [raw];
  }

  if (list.length === 0) {
    return { hostedBy: [] };
  }

  const result: Types.ObjectId[] = [];
  const seenIds = new Set<string>();
  const idsToVerify: Types.ObjectId[] = [];

  for (const item of list) {
    if (!item) {
      return { error: "Invalid hostedBy entry: null or undefined" };
    }

    let idStr: string;
    if (typeof item === "string") {
      idStr = item.trim();
    } else if (typeof item === "object" && item !== null) {
      if ((item as { _id?: unknown })._id) {
        idStr = String((item as { _id?: unknown })._id).trim();
      } else {
        idStr = String(item).trim();
      }
    } else {
      idStr = String(item).trim();
    }

    if (!Types.ObjectId.isValid(idStr)) {
      return { error: `Invalid identifier format for hostedBy ID: '${idStr}'` };
    }

    if (seenIds.has(idStr)) {
      return { error: `Duplicate person detected in hostedBy list: '${idStr}'` };
    }
    seenIds.add(idStr);

    const objId = new Types.ObjectId(idStr);
    idsToVerify.push(objId);
    result.push(objId);
  }

  // Verify all IDs exist in Person collection in one query
  const existing = await Person.find({ _id: { $in: idsToVerify } });
  if (existing.length !== idsToVerify.length) {
    const existingIdStrs = new Set(existing.map((p) => String(p._id)));
    const unknownIds = idsToVerify
      .map(String)
      .filter((id) => !existingIdStrs.has(id));
    return {
      error: `Unknown Person ID(s) in hostedBy: ${unknownIds.join(", ")}`,
    };
  }

  return { hostedBy: result };
}

export interface ParseSocialLinksResult {
  socialLinks?: ISocialLink[];
  error?: string;
}

export function parseAndValidateSocialLinks(raw: unknown): ParseSocialLinksResult {
  if (raw === undefined) {
    return { socialLinks: undefined };
  }

  let list: unknown[] = [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { socialLinks: [] };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { error: "Social links must be an array" };
      }
      list = parsed;
    } catch {
      return { error: "Invalid JSON format for socialLinks" };
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    return { error: "Social links must be an array" };
  }

  if (list.length === 0) {
    return { socialLinks: [] };
  }

  const result: ISocialLink[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      return { error: "Invalid socialLink entry: must be an object with platform and url" };
    }
    const itemObj = item as Record<string, unknown>;
    const platform = typeof itemObj.platform === "string" ? itemObj.platform.trim() : "";
    const url = typeof itemObj.url === "string" ? itemObj.url.trim() : "";

    if (!platform) {
      return { error: "socialLinks platform is required" };
    }
    if (!url || !isValidHttpUrl(url)) {
      return { error: `Invalid socialLink URL: '${url}'. Must be a valid http or https URL.` };
    }
    result.push({ platform, url });
  }

  return { socialLinks: result };
}

export interface ProjectQueryParams {
  category?: string | string[];
  featured?: string | string[];
  tag?: string | string[];
  status?: string | string[];
}

function parseJsonField<T>(field: unknown, defaultValue: T): T {
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T;
    } catch {
      return defaultValue;
    }
  }
  if (field !== undefined && field !== null) {
    return field as T;
  }
  return defaultValue;
}

export interface ParseChangelogResult {
  isProvided: boolean;
  changelog?: string[];
  error?: string;
}

export function parseChangelog(raw: unknown): ParseChangelogResult {
  if (raw === undefined) {
    return { isProvided: false, changelog: [] };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { isProvided: true, changelog: [] };
    }

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!Array.isArray(parsed)) {
          return {
            isProvided: true,
            error: "Changelog must be an array of strings",
          };
        }
        for (const item of parsed) {
          if (typeof item !== "string") {
            return {
              isProvided: true,
              error: "Changelog entries must be strings",
            };
          }
        }
        const cleaned = parsed
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        return { isProvided: true, changelog: cleaned };
      } catch {
        return {
          isProvided: true,
          error: "Invalid JSON format for changelog",
        };
      }
    }

    // Single field from multipart or plain text: changelog=only-one
    return { isProvided: true, changelog: [trimmed] };
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") {
        return {
          isProvided: true,
          error: "Changelog entries must be strings",
        };
      }
    }
    const cleaned = (raw as string[])
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { isProvided: true, changelog: cleaned };
  }

  return {
    isProvided: true,
    error: "Changelog must be an array of strings or a JSON string",
  };
}

function extractParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] ?? "";
  }
  return param ?? "";
}

function parseQueryParam(
  param: unknown,
  paramName: string
): { value?: string; error?: string } {
  if (param === undefined) {
    return {};
  }

  if (typeof param === "string") {
    return { value: param };
  }

  if (Array.isArray(param)) {
    if (param.length === 0 || typeof param[0] !== "string" || param[0].trim() === "") {
      return { error: `Invalid query parameter shape for '${paramName}'` };
    }
    return { value: param[0] };
  }

  return { error: `Invalid query parameter shape for '${paramName}'` };
}

export const getProjects = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedCategory = parseQueryParam(req.query.category, "category");
    if (parsedCategory.error) {
      res.status(400).json({
        success: false,
        message: parsedCategory.error,
      });
      return;
    }

    const parsedFeatured = parseQueryParam(req.query.featured, "featured");
    if (parsedFeatured.error) {
      res.status(400).json({
        success: false,
        message: parsedFeatured.error,
      });
      return;
    }

    const parsedTag = parseQueryParam(req.query.tag, "tag");
    if (parsedTag.error) {
      res.status(400).json({
        success: false,
        message: parsedTag.error,
      });
      return;
    }

    const parsedStatus = parseQueryParam(req.query.status, "status");
    if (parsedStatus.error) {
      res.status(400).json({
        success: false,
        message: parsedStatus.error,
      });
      return;
    }

    const parsedHost = parseQueryParam(req.query.host, "host");
    if (parsedHost.error) {
      res.status(400).json({
        success: false,
        message: parsedHost.error,
      });
      return;
    }

    const parsedForked = parseQueryParam(req.query.forked, "forked");
    if (parsedForked.error) {
      res.status(400).json({
        success: false,
        message: parsedForked.error,
      });
      return;
    }

    const category = parsedCategory.value;
    const featured = parsedFeatured.value;
    const tag = parsedTag.value;

    const filter: FilterQuery<IProject> = {
      status: { $ne: "invisible" },
    };

    if (category && category.trim()) {
      filter.category = category.toLowerCase().trim();
    }

    if (featured !== undefined) {
      filter.featured = featured.toLowerCase().trim() === "true";
    }

    if (tag && tag.trim()) {
      filter.tags = { $regex: new RegExp(`^${escapeRegex(tag.trim())}$`, "i") };
    }

    if (parsedHost.value !== undefined) {
      const hostVal = parsedHost.value.trim();
      if (hostVal !== "self" && hostVal !== "people") {
        res.status(400).json({
          success: false,
          message: "Invalid host filter: must be 'self' or 'people'",
        });
        return;
      }
      if (hostVal === "self") {
        filter.$or = [{ host: "self" }, { host: { $exists: false } }, { host: null }];
      } else {
        filter.host = "people";
      }
    }

    if (parsedForked.value !== undefined) {
      const forkedVal = parsedForked.value.trim().toLowerCase();
      if (forkedVal !== "true" && forkedVal !== "false") {
        res.status(400).json({
          success: false,
          message: "Invalid forked filter: must be 'true' or 'false'",
        });
        return;
      }
      if (forkedVal === "true") {
        filter.forkedFrom = { $ne: null, $exists: true, $nin: ["", null] };
      } else {
        const forkedFalseCondition = {
          $or: [{ forkedFrom: null }, { forkedFrom: { $exists: false } }, { forkedFrom: "" }],
        };
        if (filter.$or) {
          filter.$and = filter.$and || [];
          filter.$and.push({ $or: filter.$or });
          delete filter.$or;
          filter.$and.push(forkedFalseCondition);
        } else {
          filter.$or = forkedFalseCondition.$or;
        }
      }
    }

    let query = Project.find(filter);
    if (typeof (query as unknown as { populate?: unknown }).populate === "function") {
      query = (query as unknown as { populate: (path: string) => typeof query })
        .populate("contributors.contributor")
        .populate("versions.contributors.contributor")
        .populate("hostedBy")
        .populate("versions.hostedBy");
    }
    const projects = await query
      .sort({ featured: -1, startDate: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: projects.length,
      data: projects.map(formatProjectResponse),
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminProjects = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedCategory = parseQueryParam(req.query.category, "category");
    if (parsedCategory.error) {
      res.status(400).json({
        success: false,
        message: parsedCategory.error,
      });
      return;
    }

    const parsedFeatured = parseQueryParam(req.query.featured, "featured");
    if (parsedFeatured.error) {
      res.status(400).json({
        success: false,
        message: parsedFeatured.error,
      });
      return;
    }

    const parsedTag = parseQueryParam(req.query.tag, "tag");
    if (parsedTag.error) {
      res.status(400).json({
        success: false,
        message: parsedTag.error,
      });
      return;
    }

    const parsedStatus = parseQueryParam(req.query.status, "status");
    if (parsedStatus.error) {
      res.status(400).json({
        success: false,
        message: parsedStatus.error,
      });
      return;
    }

    const parsedHost = parseQueryParam(req.query.host, "host");
    if (parsedHost.error) {
      res.status(400).json({
        success: false,
        message: parsedHost.error,
      });
      return;
    }

    const parsedForked = parseQueryParam(req.query.forked, "forked");
    if (parsedForked.error) {
      res.status(400).json({
        success: false,
        message: parsedForked.error,
      });
      return;
    }

    const category = parsedCategory.value;
    const featured = parsedFeatured.value;
    const tag = parsedTag.value;
    const status = parsedStatus.value;

    const filter: FilterQuery<IProject> = {};

    if (status && status.trim()) {
      filter.status = status.toLowerCase().trim() as ProjectStatus;
    }

    if (category && category.trim()) {
      filter.category = category.toLowerCase().trim();
    }

    if (featured !== undefined) {
      filter.featured = featured.toLowerCase().trim() === "true";
    }

    if (tag && tag.trim()) {
      filter.tags = { $regex: new RegExp(`^${escapeRegex(tag.trim())}$`, "i") };
    }

    if (parsedHost.value !== undefined) {
      const hostVal = parsedHost.value.trim();
      if (hostVal !== "self" && hostVal !== "people") {
        res.status(400).json({
          success: false,
          message: "Invalid host filter: must be 'self' or 'people'",
        });
        return;
      }
      if (hostVal === "self") {
        filter.$or = [{ host: "self" }, { host: { $exists: false } }, { host: null }];
      } else {
        filter.host = "people";
      }
    }

    if (parsedForked.value !== undefined) {
      const forkedVal = parsedForked.value.trim().toLowerCase();
      if (forkedVal !== "true" && forkedVal !== "false") {
        res.status(400).json({
          success: false,
          message: "Invalid forked filter: must be 'true' or 'false'",
        });
        return;
      }
      if (forkedVal === "true") {
        filter.forkedFrom = { $ne: null, $exists: true, $nin: ["", null] };
      } else {
        const forkedFalseCondition = {
          $or: [{ forkedFrom: null }, { forkedFrom: { $exists: false } }, { forkedFrom: "" }],
        };
        if (filter.$or) {
          filter.$and = filter.$and || [];
          filter.$and.push({ $or: filter.$or });
          delete filter.$or;
          filter.$and.push(forkedFalseCondition);
        } else {
          filter.$or = forkedFalseCondition.$or;
        }
      }
    }

    let query = Project.find(filter);
    if (typeof (query as unknown as { populate?: unknown }).populate === "function") {
      query = (query as unknown as { populate: (path: string) => typeof query })
        .populate("contributors.contributor")
        .populate("versions.contributors.contributor")
        .populate("hostedBy")
        .populate("versions.hostedBy");
    }
    const projects = await query
      .sort({ featured: -1, startDate: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: projects.length,
      data: projects.map(formatProjectResponse),
    });
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const categories: string[] = await Project.distinct("category", {
      status: { $ne: "invisible" },
    });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();

    if (!slug) {
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    let query = Project.findOne({ slug });
    if (typeof (query as unknown as { populate?: unknown }).populate === "function") {
      query = (query as unknown as { populate: (path: string) => typeof query })
        .populate("contributors.contributor")
        .populate("versions.contributors.contributor")
        .populate("hostedBy")
        .populate("versions.hostedBy");
    }
    const project = await query.lean();

    if (!project) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    if (project.status === "invisible" && !req.adminAuthenticated) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatProjectResponse(project),
    });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({
        success: false,
        message: "Project title is required",
      });
      return;
    }

    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug.toLowerCase().trim()
        : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

    const category = typeof body.category === "string" ? body.category.toLowerCase().trim() : "";
    const description = typeof body.description === "string" ? body.description : "";
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!image) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Project image URL or image file upload is required",
      });
      return;
    }

    if (!isValidHttpUrl(image)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "image must be a valid http or https URL",
      });
      return;
    }

    if (!category) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Project category is required",
      });
      return;
    }

    if (!description) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Project description is required",
      });
      return;
    }

    const startDate = body.startDate ? new Date(body.startDate as string) : new Date();
    const endDate = body.endDate ? new Date(body.endDate as string) : undefined;
    const featured = body.featured === true || body.featured === "true";
    const status = (body.status as ProjectStatus) || "planning";

    let videoDemo: string | undefined = undefined;
    if (typeof body.videoDemo === "string" && body.videoDemo.trim() !== "") {
      const v = body.videoDemo.trim();
      if (!isValidHttpUrl(v)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "videoDemo must be a valid http or https URL",
        });
        return;
      }
      videoDemo = v;
    }

    let deployedLink: string | undefined = undefined;
    if (typeof body.deployedLink === "string" && body.deployedLink.trim() !== "") {
      const d = body.deployedLink.trim();
      if (!isValidHttpUrl(d)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "deployedLink must be a valid http or https URL",
        });
        return;
      }
      deployedLink = d;
    }

    let githubLink: string | undefined = undefined;
    if (typeof body.githubLink === "string" && body.githubLink.trim() !== "") {
      const g = body.githubLink.trim();
      if (!isValidHttpUrl(g)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "githubLink must be a valid http or https URL",
        });
        return;
      }
      githubLink = g;
    }

    let tags: string[] = [];
    if (typeof body.tags === "string") {
      try {
        tags = JSON.parse(body.tags) as string[];
      } catch {
        tags = body.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      }
    } else if (Array.isArray(body.tags)) {
      tags = (body.tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }

    let contributors: IProjectContributor[] = [];
    if (body.contributors !== undefined) {
      const contrResult = await parseAndValidateContributors(body.contributors);
      if (contrResult.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: contrResult.error });
        return;
      }
      contributors = contrResult.contributors || [];
    }

    let socialLinks: ISocialLink[] = [];
    if (body.socialLinks !== undefined) {
      const socialResult = parseAndValidateSocialLinks(body.socialLinks);
      if (socialResult.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: socialResult.error });
        return;
      }
      socialLinks = socialResult.socialLinks || [];
    }

    const threeDModel = parseJsonField<{
      fileUrl: string;
      initialRotation?: [number, number, number];
      enableExplodedView: boolean;
    } | undefined>(body.threeDModel, undefined);
    if (threeDModel?.fileUrl && typeof threeDModel.fileUrl === "string" && threeDModel.fileUrl.trim() !== "") {
      if (!isValidHttpUrl(threeDModel.fileUrl)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "threeDModel.fileUrl must be a valid http or https URL",
        });
        return;
      }
    }

    let skills: Types.ObjectId[] = [];
    if (typeof body.skills === "string") {
      try {
        const parsed = JSON.parse(body.skills) as string[];
        skills = parsed.map((s) => new Types.ObjectId(s));
      } catch {
        skills = body.skills.split(",").map((s) => s.trim()).filter(Boolean).map((s) => new Types.ObjectId(s));
      }
    } else if (Array.isArray(body.skills)) {
      skills = (body.skills as unknown[]).map((s) => new Types.ObjectId(String(s)));
    }

    let gallery: IGalleryImage[] = [];
    if (req.galleryUploadedFiles && req.galleryUploadedFiles.length > 0) {
      const uploadedFiles = req.galleryUploadedFiles;
      let galleryMetaList: Array<{ tags?: unknown; caption?: unknown }> = [];

      if (body.galleryMeta !== undefined) {
        if (typeof body.galleryMeta === "string") {
          try {
            const parsed = JSON.parse(body.galleryMeta);
            if (!Array.isArray(parsed)) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
              return;
            }
            galleryMetaList = parsed;
          } catch {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({ success: false, message: "Invalid JSON format for galleryMeta" });
            return;
          }
        } else if (Array.isArray(body.galleryMeta)) {
          galleryMetaList = body.galleryMeta as Array<{ tags?: unknown; caption?: unknown }>;
        } else {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
          return;
        }

        if (galleryMetaList.length > uploadedFiles.length) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta contains more entries than uploaded files" });
          return;
        }
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const meta = galleryMetaList[i] || {};

        const tagsResult = normalizeAndValidateGalleryTags(meta.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(meta.caption);
        if (captionResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        gallery.push({
          _id: new Types.ObjectId(),
          url: file.url,
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }

      if (gallery.length > 30) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: "Gallery cannot exceed 30 items per project" });
        return;
      }
    }

    let forkedFrom: string | null = null;
    if (body.forkedFrom !== undefined && body.forkedFrom !== null) {
      const trimmed = String(body.forkedFrom).trim();
      if (trimmed === "") {
        forkedFrom = null;
      } else {
        if (trimmed.length > 2048) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "forkedFrom cannot exceed 2048 characters",
          });
          return;
        }
        if (!isValidHttpUrl(trimmed)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "forkedFrom must be a valid http or https URL",
          });
          return;
        }
        forkedFrom = trimmed;
      }
    }

    const hostRaw = body.host !== undefined && body.host !== null ? String(body.host).trim() : "self";
    if (hostRaw !== "self" && hostRaw !== "people") {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "host must be 'self' or 'people'",
      });
      return;
    }
    const host: "self" | "people" = hostRaw;

    let hostedBy: Types.ObjectId[] = [];
    if (body.hostedBy !== undefined) {
      const hostedByRes = await parseAndValidateHostedBy(body.hostedBy);
      if (hostedByRes.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: hostedByRes.error });
        return;
      }
      hostedBy = hostedByRes.hostedBy || [];
    }

    if (host === "people") {
      if (hostedBy.length === 0) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "host 'people' requires at least one person in hostedBy",
        });
        return;
      }
    } else {
      if (hostedBy.length > 0) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "hostedBy cannot be specified when host is 'self'",
        });
        return;
      }
    }

    const project = await Project.create({
      title,
      slug,
      category,
      description,
      featured,
      tags,
      skills,
      startDate,
      endDate,
      contributors,
      status,
      image,
      videoDemo,
      socialLinks,
      threeDModel,
      deployedLink,
      githubLink,
      versions: [],
      gallery,
      host,
      hostedBy,
      forkedFrom,
    });

    await populateProjectDoc(project);

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const updateProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid project ID format",
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updatePayload: Partial<IProject> = {};

    if (typeof body.title === "string") updatePayload.title = body.title.trim();
    if (typeof body.slug === "string") updatePayload.slug = body.slug.toLowerCase().trim();
    if (typeof body.category === "string") updatePayload.category = body.category.toLowerCase().trim();
    if (typeof body.description === "string") updatePayload.description = body.description;
    if (body.featured !== undefined) {
      updatePayload.featured = body.featured === true || body.featured === "true";
    }
    if (typeof body.status === "string") {
      updatePayload.status = body.status as ProjectStatus;
    }
    if (typeof body.image === "string") {
      if (body.image.trim() !== "") {
        if (!isValidHttpUrl(body.image)) {
          res.status(400).json({ success: false, message: "image must be a valid http or https URL" });
          return;
        }
        updatePayload.image = body.image.trim();
      }
    }
    if (body.videoDemo !== undefined) {
      if (body.videoDemo === null || (typeof body.videoDemo === "string" && body.videoDemo.trim() === "")) {
        updatePayload.videoDemo = null as unknown as string;
      } else if (typeof body.videoDemo === "string") {
        if (!isValidHttpUrl(body.videoDemo)) {
          res.status(400).json({ success: false, message: "videoDemo must be a valid http or https URL" });
          return;
        }
        updatePayload.videoDemo = body.videoDemo.trim();
      }
    }
    if (body.deployedLink !== undefined) {
      if (body.deployedLink === null || (typeof body.deployedLink === "string" && body.deployedLink.trim() === "")) {
        updatePayload.deployedLink = null as unknown as string;
      } else if (typeof body.deployedLink === "string") {
        if (!isValidHttpUrl(body.deployedLink)) {
          res.status(400).json({ success: false, message: "deployedLink must be a valid http or https URL" });
          return;
        }
        updatePayload.deployedLink = body.deployedLink.trim();
      }
    }
    if (body.githubLink !== undefined) {
      if (body.githubLink === null || (typeof body.githubLink === "string" && body.githubLink.trim() === "")) {
        updatePayload.githubLink = null as unknown as string;
      } else if (typeof body.githubLink === "string") {
        if (!isValidHttpUrl(body.githubLink)) {
          res.status(400).json({ success: false, message: "githubLink must be a valid http or https URL" });
          return;
        }
        updatePayload.githubLink = body.githubLink.trim();
      }
    }
    if (body.startDate) updatePayload.startDate = new Date(body.startDate as string);
    if (body.endDate !== undefined) {
      updatePayload.endDate = body.endDate ? new Date(body.endDate as string) : undefined;
    }

    if (body.tags !== undefined) {
      if (typeof body.tags === "string") {
        try {
          updatePayload.tags = JSON.parse(body.tags) as string[];
        } catch {
          updatePayload.tags = body.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        }
      } else if (Array.isArray(body.tags)) {
        updatePayload.tags = (body.tags as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
      }
    }

    if (body.contributors !== undefined) {
      const cRes = await parseAndValidateContributors(body.contributors);
      if (cRes.error) {
        res.status(400).json({ success: false, message: cRes.error });
        return;
      }
      updatePayload.contributors = cRes.contributors;
    }
    if (body.socialLinks !== undefined) {
      const sRes = parseAndValidateSocialLinks(body.socialLinks);
      if (sRes.error) {
        res.status(400).json({ success: false, message: sRes.error });
        return;
      }
      updatePayload.socialLinks = sRes.socialLinks;
    }
    if (body.threeDModel !== undefined) {
      const parsed3D = parseJsonField<{
        fileUrl: string;
        initialRotation?: [number, number, number];
        enableExplodedView: boolean;
      }>(body.threeDModel, { fileUrl: "", enableExplodedView: false });
      if (parsed3D.fileUrl && typeof parsed3D.fileUrl === "string" && parsed3D.fileUrl.trim() !== "") {
        if (!isValidHttpUrl(parsed3D.fileUrl)) {
          res.status(400).json({ success: false, message: "threeDModel.fileUrl must be a valid http or https URL" });
          return;
        }
      }
      updatePayload.threeDModel = parsed3D;
    }
    if (body.skills !== undefined) {
      if (typeof body.skills === "string") {
        try {
          const parsed = JSON.parse(body.skills) as string[];
          updatePayload.skills = parsed.map((s) => new Types.ObjectId(s));
        } catch {
          updatePayload.skills = body.skills.split(",").map((s) => s.trim()).filter(Boolean).map((s) => new Types.ObjectId(s));
        }
      } else if (Array.isArray(body.skills)) {
        updatePayload.skills = (body.skills as unknown[]).map((s) => new Types.ObjectId(String(s)));
      }
    }

    if (body.forkedFrom !== undefined) {
      if (body.forkedFrom === null || body.forkedFrom === "") {
        updatePayload.forkedFrom = null;
      } else {
        const trimmed = String(body.forkedFrom).trim();
        if (trimmed === "") {
          updatePayload.forkedFrom = null;
        } else {
          if (trimmed.length > 2048) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "forkedFrom cannot exceed 2048 characters",
            });
            return;
          }
          if (!isValidHttpUrl(trimmed)) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "forkedFrom must be a valid http or https URL",
            });
            return;
          }
          updatePayload.forkedFrom = trimmed;
        }
      }
    }

    if (body.host !== undefined || body.hostedBy !== undefined) {
      const existingProject = await Project.findById(id);
      if (!existingProject) {
        await cleanupUploadedVersionMedia(req);
        res.status(404).json({
          success: false,
          message: `Project not found with id: ${id}`,
        });
        return;
      }

      const storedHost = existingProject.host === "people" ? "people" : "self";

      if (body.host !== undefined) {
        const hostRaw = String(body.host).trim();
        if (hostRaw !== "self" && hostRaw !== "people") {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "host must be 'self' or 'people'",
          });
          return;
        }

        if (hostRaw === "self") {
          if (body.hostedBy !== undefined) {
            const parsed = await parseAndValidateHostedBy(body.hostedBy);
            if (parsed.error) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: parsed.error });
              return;
            }
            if (parsed.hostedBy && parsed.hostedBy.length > 0) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({
                success: false,
                message: "hostedBy cannot be specified when host is 'self'",
              });
              return;
            }
          }
          updatePayload.host = "self";
          updatePayload.hostedBy = [];
        } else {
          let finalHostedBy: Types.ObjectId[];
          if (body.hostedBy !== undefined) {
            const parsed = await parseAndValidateHostedBy(body.hostedBy);
            if (parsed.error) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: parsed.error });
              return;
            }
            finalHostedBy = parsed.hostedBy || [];
          } else {
            finalHostedBy = existingProject.hostedBy || [];
          }

          if (finalHostedBy.length === 0) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "host 'people' requires at least one person in hostedBy",
            });
            return;
          }

          updatePayload.host = "people";
          if (body.hostedBy !== undefined) {
            updatePayload.hostedBy = finalHostedBy;
          }
        }
      } else {
        const parsed = await parseAndValidateHostedBy(body.hostedBy);
        if (parsed.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: parsed.error });
          return;
        }
        const newHostedBy = parsed.hostedBy || [];

        if (storedHost === "self") {
          if (newHostedBy.length > 0) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "Cannot set hostedBy when host is self; set host to people",
            });
            return;
          }
          updatePayload.hostedBy = [];
        } else {
          if (newHostedBy.length === 0) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "host 'people' requires at least one person in hostedBy",
            });
            return;
          }
          updatePayload.hostedBy = newHostedBy;
        }
      }
    }

    // Ensure gallery and versions are NEVER modified by project PUT
    delete (updatePayload as Record<string, unknown>).gallery;
    delete (updatePayload as Record<string, unknown>).versions;

    const updatedProject = await Project.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        message: `Project not found with id: ${id}`,
      });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = extractParamString(req.params.id);

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid project ID format",
      });
      return;
    }

    const deletedProject = await Project.findByIdAndDelete(id);

    if (!deletedProject) {
      res.status(404).json({
        success: false,
        message: `Project not found with id: ${id}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const addProjectVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();

    if (!slug) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    const body = req.body as Omit<Partial<IProjectVersion>, "isLatest"> & {
      threeDModel?: { fileUrl?: string } | string;
      isLatest?: boolean | string;
    };
    const threeDModel = parseJsonField<{ fileUrl?: string } | undefined>(
      body.threeDModel,
      undefined
    );
    const {
      versionTag,
      releaseDate,
      image,
      videoDemo,
      demoUrl,
      threeDFileUrl,
      isLatest,
    } = body;

    if (!versionTag) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Version tag is required (e.g., 'v1.0.0')",
      });
      return;
    }

    const changelogResult = parseChangelog(body.changelog);
    if (changelogResult.error) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: changelogResult.error,
      });
      return;
    }

    if (image !== undefined && typeof image === "string" && image.trim() !== "") {
      if (!isValidHttpUrl(image)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version image must be a valid http or https URL",
        });
        return;
      }
    }

    if (videoDemo !== undefined && typeof videoDemo === "string" && videoDemo.trim() !== "") {
      if (!isValidHttpUrl(videoDemo)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version videoDemo must be a valid http or https URL",
        });
        return;
      }
    }

    if (demoUrl !== undefined && typeof demoUrl === "string" && demoUrl.trim() !== "") {
      if (!isValidHttpUrl(demoUrl)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version demoUrl must be a valid http or https URL",
        });
        return;
      }
    }

    const raw3DUrl = threeDFileUrl ?? threeDModel?.fileUrl;
    if (raw3DUrl !== undefined && typeof raw3DUrl === "string" && raw3DUrl.trim() !== "") {
      if (!isValidHttpUrl(raw3DUrl)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version threeDFileUrl must be a valid http or https URL",
        });
        return;
      }
    }

    let versionStatus: ProjectStatus = "planning";
    if (body.status !== undefined && body.status !== null) {
      const statusStr = String(body.status).trim();
      const validStatuses: ProjectStatus[] = ["invisible", "planning", "work_in_progress", "delay_hold", "active"];
      if (!validStatuses.includes(statusStr as ProjectStatus)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: `Invalid version status: '${statusStr}'. Allowed values are: ${validStatuses.join(", ")}`,
        });
        return;
      }
      versionStatus = statusStr as ProjectStatus;
    }

    let startDate: Date | undefined = undefined;
    if (body.startDate !== undefined && body.startDate !== null && String(body.startDate).trim() !== "") {
      const d = new Date(body.startDate as unknown as string);
      if (isNaN(d.getTime())) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Invalid version startDate format",
        });
        return;
      }
      startDate = d;
    }

    let endDate: Date | undefined = undefined;
    if (body.endDate !== undefined && body.endDate !== null && String(body.endDate).trim() !== "") {
      const d = new Date(body.endDate as unknown as string);
      if (isNaN(d.getTime())) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Invalid version endDate format",
        });
        return;
      }
      endDate = d;
    }

    if (startDate && endDate && endDate < startDate) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Version endDate cannot be earlier than startDate",
      });
      return;
    }

    let deployedLink: string | undefined = undefined;
    if (body.deployedLink !== undefined && body.deployedLink !== null && String(body.deployedLink).trim() !== "") {
      const link = String(body.deployedLink).trim();
      if (!isValidHttpUrl(link)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: `Invalid version deployedLink: '${link}'. Must be a valid http or https URL.`,
        });
        return;
      }
      deployedLink = link;
    }

    let githubLink: string | undefined = undefined;
    if (body.githubLink !== undefined && body.githubLink !== null && String(body.githubLink).trim() !== "") {
      const link = String(body.githubLink).trim();
      if (!isValidHttpUrl(link)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: `Invalid version githubLink: '${link}'. Must be a valid http or https URL.`,
        });
        return;
      }
      githubLink = link;
    }

    let contributors: IProjectContributor[] | undefined = undefined;
    if (body.contributors !== undefined) {
      const cRes = await parseAndValidateContributors(body.contributors);
      if (cRes.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: cRes.error });
        return;
      }
      contributors = cRes.contributors;
    }

    let socialLinks: ISocialLink[] | undefined = undefined;
    if (body.socialLinks !== undefined) {
      const sRes = parseAndValidateSocialLinks(body.socialLinks);
      if (sRes.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: sRes.error });
        return;
      }
      socialLinks = sRes.socialLinks;
    }

    let versionHost: "self" | "people" | undefined = undefined;
    let versionHostedBy: Types.ObjectId[] | undefined = undefined;

    if (body.hostedBy !== undefined && body.host === undefined) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Cannot set hostedBy without host on version",
      });
      return;
    }

    if (body.host !== undefined && body.host !== null && String(body.host).trim() !== "") {
      const vHostRaw = String(body.host).trim();
      if (vHostRaw !== "self" && vHostRaw !== "people") {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version host must be 'self' or 'people'",
        });
        return;
      }
      versionHost = vHostRaw;

      if (versionHost === "people") {
        const parsed = await parseAndValidateHostedBy(body.hostedBy);
        if (parsed.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: parsed.error });
          return;
        }
        if (!parsed.hostedBy || parsed.hostedBy.length === 0) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "Version host 'people' requires at least one person in hostedBy",
          });
          return;
        }
        versionHostedBy = parsed.hostedBy;
      } else {
        if (body.hostedBy !== undefined) {
          const parsed = await parseAndValidateHostedBy(body.hostedBy);
          if (parsed.error) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({ success: false, message: parsed.error });
            return;
          }
          if (parsed.hostedBy && parsed.hostedBy.length > 0) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "hostedBy cannot be specified when version host is 'self'",
            });
            return;
          }
        }
        versionHostedBy = [];
      }
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    const trimmedTag = versionTag.trim();
    const isDuplicate = project.versions.some(
      (v) => v.versionTag.trim().toLowerCase() === trimmedTag.toLowerCase()
    );
    if (isDuplicate) {
      await cleanupUploadedVersionMedia(req);
      res.status(409).json({
        success: false,
        message: `Version tag '${trimmedTag}' already exists for this project`,
      });
      return;
    }

    const shouldSetLatest = isLatest === true || isLatest === "true";

    if (shouldSetLatest) {
      project.versions.forEach((v) => {
        v.isLatest = false;
      });
    }

    let versionGallery: IGalleryImage[] = [];
    if (req.galleryUploadedFiles && req.galleryUploadedFiles.length > 0) {
      const uploadedFiles = req.galleryUploadedFiles;
      let galleryMetaList: Array<{ tags?: unknown; caption?: unknown }> = [];

      if ((body as Record<string, unknown>).galleryMeta !== undefined) {
        const rawMeta = (body as Record<string, unknown>).galleryMeta;
        if (typeof rawMeta === "string") {
          try {
            const parsed = JSON.parse(rawMeta);
            if (!Array.isArray(parsed)) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
              return;
            }
            galleryMetaList = parsed;
          } catch {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({ success: false, message: "Invalid JSON format for galleryMeta" });
            return;
          }
        } else if (Array.isArray(rawMeta)) {
          galleryMetaList = rawMeta as Array<{ tags?: unknown; caption?: unknown }>;
        } else {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
          return;
        }

        if (galleryMetaList.length > uploadedFiles.length) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta contains more entries than uploaded files" });
          return;
        }
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const meta = galleryMetaList[i] || {};

        const tagsResult = normalizeAndValidateGalleryTags(meta.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(meta.caption);
        if (captionResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        versionGallery.push({
          _id: new Types.ObjectId(),
          url: file.url,
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }

      if (versionGallery.length > 30) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: "Gallery cannot exceed 30 items per version" });
        return;
      }
    }

    const newVersion: IProjectVersion = {
      versionTag,
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      changelog: changelogResult.changelog ?? [],
      image,
      videoDemo,
      demoUrl,
      threeDFileUrl:
        threeDFileUrl ??
        threeDModel?.fileUrl,
      isLatest: shouldSetLatest,
      gallery: versionGallery,
      status: versionStatus,
      startDate,
      endDate,
      deployedLink,
      githubLink,
      contributors,
      socialLinks,
      host: versionHost,
      hostedBy: versionHostedBy,
    };

    project.versions.push(newVersion);
    await project.save();

    await populateProjectDoc(project);

    res.status(201).json({
      success: true,
      message: "Version added successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

interface UpdateProjectVersionInput {
  versionTag?: string;
  releaseDate?: string | Date;
  changelog?: string[] | string;
  demoUrl?: string;
  image?: string;
  videoDemo?: string;
  threeDFileUrl?: string;
  threeDModel?: { fileUrl?: string } | string;
  isLatest?: boolean | string;
  status?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  deployedLink?: string;
  githubLink?: string;
  contributors?: unknown;
  socialLinks?: unknown;
  host?: string | null;
  hostedBy?: unknown;
}

export const updateProjectVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const versionId = extractParamString(req.params.versionId);
    if (!versionId || !Types.ObjectId.isValid(versionId)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }

    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    if (!slug) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    const version = project.versions.find((v) => String(v._id) === versionId);
    if (!version) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({
        success: false,
        message: `Version not found with id: ${versionId}`,
      });
      return;
    }

    const body = req.body as UpdateProjectVersionInput;

    // 1. Validate and update versionTag
    if (body.versionTag !== undefined) {
      if (typeof body.versionTag !== "string" || !body.versionTag.trim()) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version tag is required and cannot be empty",
        });
        return;
      }
      const trimmedTag = body.versionTag.trim();
      const isDuplicate = project.versions.some(
        (v) =>
          String(v._id) !== versionId &&
          v.versionTag.trim().toLowerCase() === trimmedTag.toLowerCase()
      );
      if (isDuplicate) {
        await cleanupUploadedVersionMedia(req);
        res.status(409).json({
          success: false,
          message: `Version tag '${trimmedTag}' already exists for this project`,
        });
        return;
      }
      version.versionTag = trimmedTag;
    }

    // 2. Validate and update releaseDate
    if (body.releaseDate !== undefined) {
      const parsedDate = new Date(body.releaseDate);
      if (isNaN(parsedDate.getTime())) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Invalid release date format",
        });
        return;
      }
      version.releaseDate = parsedDate;
    }

    // 3. Update changelog
    if (body.changelog !== undefined) {
      const changelogResult = parseChangelog(body.changelog);
      if (changelogResult.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: changelogResult.error,
        });
        return;
      }
      if (changelogResult.isProvided) {
        version.changelog = changelogResult.changelog ?? [];
      }
    }

    // 4. Update demoUrl
    if (body.demoUrl !== undefined) {
      if (typeof body.demoUrl === "string" && body.demoUrl.trim() === "") {
        version.demoUrl = undefined;
      } else {
        const link = typeof body.demoUrl === "string" ? body.demoUrl.trim() : "";
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "Version demoUrl must be a valid http or https URL" });
          return;
        }
        version.demoUrl = link;
      }
    }

    // 5. Update image
    if (body.image !== undefined) {
      if (typeof body.image === "string" && body.image.trim() === "") {
        version.image = undefined;
      } else {
        const link = typeof body.image === "string" ? body.image.trim() : "";
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "Version image must be a valid http or https URL" });
          return;
        }
        version.image = link;
      }
    }

    // 6. Update videoDemo
    if (body.videoDemo !== undefined) {
      if (typeof body.videoDemo === "string" && body.videoDemo.trim() === "") {
        version.videoDemo = undefined;
      } else {
        const link = typeof body.videoDemo === "string" ? body.videoDemo.trim() : "";
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "Version videoDemo must be a valid http or https URL" });
          return;
        }
        version.videoDemo = link;
      }
    }

    // 7. Update threeDFileUrl / threeDModel
    const threeDModel = parseJsonField<{ fileUrl?: string } | undefined>(
      body.threeDModel,
      undefined
    );
    const uploaded3DUrl = threeDModel?.fileUrl;

    if (uploaded3DUrl !== undefined) {
      if (typeof uploaded3DUrl === "string" && uploaded3DUrl.trim() === "") {
        version.threeDFileUrl = undefined;
      } else {
        const link = typeof uploaded3DUrl === "string" ? uploaded3DUrl.trim() : "";
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "Version threeDFileUrl must be a valid http or https URL" });
          return;
        }
        version.threeDFileUrl = link;
      }
    } else if (body.threeDFileUrl !== undefined) {
      if (typeof body.threeDFileUrl === "string" && body.threeDFileUrl.trim() === "") {
        version.threeDFileUrl = undefined;
      } else {
        const link = typeof body.threeDFileUrl === "string" ? body.threeDFileUrl.trim() : "";
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "Version threeDFileUrl must be a valid http or https URL" });
          return;
        }
        version.threeDFileUrl = link;
      }
    }

    // 8. Update isLatest
    if (body.isLatest !== undefined) {
      const isLatestBool = body.isLatest === true || body.isLatest === "true";
      if (isLatestBool) {
        project.versions.forEach((v) => {
          v.isLatest = false;
        });
        version.isLatest = true;
      } else {
        version.isLatest = false;
      }
    }

    // 9. Update status
    if (body.status !== undefined) {
      if (typeof body.status === "string" && body.status.trim() === "") {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: "Version status cannot be empty",
        });
        return;
      }
      const statusStr = String(body.status).trim();
      const validStatuses: ProjectStatus[] = ["invisible", "planning", "work_in_progress", "delay_hold", "active"];
      if (!validStatuses.includes(statusStr as ProjectStatus)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({
          success: false,
          message: `Invalid version status: '${statusStr}'. Allowed values are: ${validStatuses.join(", ")}`,
        });
        return;
      }
      version.status = statusStr as ProjectStatus;
    }

    // 10. Update startDate and endDate
    let effectiveStartDate: Date | undefined = version.startDate;
    let effectiveEndDate: Date | undefined = version.endDate;

    if (body.startDate !== undefined) {
      if (body.startDate === null || (typeof body.startDate === "string" && body.startDate.trim() === "")) {
        effectiveStartDate = undefined;
      } else {
        const d = new Date(body.startDate as string);
        if (isNaN(d.getTime())) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "Invalid version startDate format",
          });
          return;
        }
        effectiveStartDate = d;
      }
    }

    if (body.endDate !== undefined) {
      if (body.endDate === null || (typeof body.endDate === "string" && body.endDate.trim() === "")) {
        effectiveEndDate = undefined;
      } else {
        const d = new Date(body.endDate as string);
        if (isNaN(d.getTime())) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "Invalid version endDate format",
          });
          return;
        }
        effectiveEndDate = d;
      }
    }

    if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Version endDate cannot be earlier than startDate",
      });
      return;
    }

    if (body.startDate !== undefined) {
      version.startDate = effectiveStartDate;
    }
    if (body.endDate !== undefined) {
      version.endDate = effectiveEndDate;
    }

    // 11. Update deployedLink
    if (body.deployedLink !== undefined) {
      if (body.deployedLink === null || (typeof body.deployedLink === "string" && body.deployedLink.trim() === "")) {
        version.deployedLink = undefined;
      } else {
        const link = String(body.deployedLink).trim();
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: `Invalid version deployedLink: '${link}'. Must be a valid http or https URL.`,
          });
          return;
        }
        version.deployedLink = link;
      }
    }

    // 12. Update githubLink
    if (body.githubLink !== undefined) {
      if (body.githubLink === null || (typeof body.githubLink === "string" && body.githubLink.trim() === "")) {
        version.githubLink = undefined;
      } else {
        const link = String(body.githubLink).trim();
        if (!isValidHttpUrl(link)) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: `Invalid version githubLink: '${link}'. Must be a valid http or https URL.`,
          });
          return;
        }
        version.githubLink = link;
      }
    }

    // 13. Update contributors
    if (body.contributors !== undefined) {
      const cRes = await parseAndValidateContributors(body.contributors);
      if (cRes.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: cRes.error });
        return;
      }
      version.contributors = cRes.contributors;
    }

    // 14. Update socialLinks
    if (body.socialLinks !== undefined) {
      const sRes = parseAndValidateSocialLinks(body.socialLinks);
      if (sRes.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: sRes.error });
        return;
      }
      version.socialLinks = sRes.socialLinks;
    }

    // 15. Update host and hostedBy
    if (body.host !== undefined) {
      if (body.host === "" || body.host === null) {
        version.host = undefined;
        version.hostedBy = undefined;
      } else {
        const vHostRaw = String(body.host).trim();
        if (vHostRaw !== "self" && vHostRaw !== "people") {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({
            success: false,
            message: "Version host must be 'self' or 'people'",
          });
          return;
        }

        if (vHostRaw === "people") {
          let finalHostedBy: Types.ObjectId[];
          if (body.hostedBy !== undefined) {
            const parsed = await parseAndValidateHostedBy(body.hostedBy);
            if (parsed.error) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: parsed.error });
              return;
            }
            finalHostedBy = parsed.hostedBy || [];
          } else {
            finalHostedBy = version.hostedBy || [];
          }

          if (finalHostedBy.length === 0) {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({
              success: false,
              message: "Version host 'people' requires at least one person in hostedBy",
            });
            return;
          }

          version.host = "people";
          version.hostedBy = finalHostedBy;
        } else {
          if (body.hostedBy !== undefined) {
            const parsed = await parseAndValidateHostedBy(body.hostedBy);
            if (parsed.error) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: parsed.error });
              return;
            }
            if (parsed.hostedBy && parsed.hostedBy.length > 0) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({
                success: false,
                message: "hostedBy cannot be specified when version host is 'self'",
              });
              return;
            }
          }
          version.host = "self";
          version.hostedBy = [];
        }
      }
    } else if (body.hostedBy !== undefined) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: "Cannot set hostedBy without host on version",
      });
      return;
    }

    await project.save();

    await populateProjectDoc(project);

    res.status(200).json({
      success: true,
      message: "Version updated successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const deleteProjectVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const versionId = extractParamString(req.params.versionId);
    if (!versionId || !Types.ObjectId.isValid(versionId)) {
      res.status(400).json({
        success: false,
        message: "Invalid identifier format",
      });
      return;
    }

    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    if (!slug) {
      res.status(400).json({
        success: false,
        message: "Project slug parameter is required",
      });
      return;
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({
        success: false,
        message: `Project not found with slug: ${slug}`,
      });
      return;
    }

    const versionIndex = project.versions.findIndex((v) => String(v._id) === versionId);
    if (versionIndex === -1) {
      res.status(404).json({
        success: false,
        message: `Version not found with id: ${versionId}`,
      });
      return;
    }

    project.versions.splice(versionIndex, 1);
    await project.save();

    await populateProjectDoc(project);

    res.status(200).json({
      success: true,
      message: "Version deleted successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Project Gallery Controllers
// ---------------------------------------------------------------------------

export const addProjectGallery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    if (!slug) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "Project slug parameter is required" });
      return;
    }

    const hasFiles = Boolean(req.galleryUploadedFiles && req.galleryUploadedFiles.length > 0);
    const hasItems = Boolean(req.body.items !== undefined);

    if (hasFiles && hasItems) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "A request must have files or items, not both" });
      return;
    }

    if (!hasFiles && !hasItems) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "A request must have files or items" });
      return;
    }

    const itemsToAdd: IGalleryImage[] = [];

    if (hasFiles) {
      const uploadedFiles = req.galleryUploadedFiles!;
      let galleryMetaList: Array<{ tags?: unknown; caption?: unknown }> = [];

      if (req.body.galleryMeta !== undefined) {
        if (typeof req.body.galleryMeta === "string") {
          try {
            const parsed = JSON.parse(req.body.galleryMeta);
            if (!Array.isArray(parsed)) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
              return;
            }
            galleryMetaList = parsed;
          } catch {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({ success: false, message: "Invalid JSON format for galleryMeta" });
            return;
          }
        } else if (Array.isArray(req.body.galleryMeta)) {
          galleryMetaList = req.body.galleryMeta;
        } else {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
          return;
        }

        if (galleryMetaList.length > uploadedFiles.length) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta contains more entries than uploaded files" });
          return;
        }
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const meta = galleryMetaList[i] || {};

        const tagsResult = normalizeAndValidateGalleryTags(meta.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(meta.caption);
        if (captionResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        itemsToAdd.push({
          _id: new Types.ObjectId(),
          url: file.url,
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }
    } else {
      let rawItems = req.body.items;
      if (typeof rawItems === "string") {
        try {
          rawItems = JSON.parse(rawItems);
        } catch {
          res.status(400).json({ success: false, message: "Invalid JSON format for items" });
          return;
        }
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        res.status(400).json({ success: false, message: "items must be a non-empty array" });
        return;
      }

      if (rawItems.length > 10) {
        res.status(400).json({ success: false, message: "At most 10 items per request" });
        return;
      }

      for (const item of rawItems) {
        if (!item || typeof item !== "object" || typeof item.url !== "string" || !isValidHttpUrl(item.url)) {
          res.status(400).json({ success: false, message: "Each item must have a valid http or https url" });
          return;
        }

        const tagsResult = normalizeAndValidateGalleryTags(item.tags);
        if (tagsResult.error) {
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(item.caption);
        if (captionResult.error) {
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        itemsToAdd.push({
          _id: new Types.ObjectId(),
          url: item.url.trim(),
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
      return;
    }

    const currentCount = Array.isArray(project.gallery) ? project.gallery.length : 0;
    if (currentCount + itemsToAdd.length > 30) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: `Gallery cannot exceed 30 items per project (current: ${currentCount}, adding: ${itemsToAdd.length})`,
      });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      {
        slug,
        $expr: {
          $lte: [
            { $add: [{ $size: { $ifNull: ["$gallery", []] } }, itemsToAdd.length] },
            30,
          ],
        },
      },
      {
        $push: { gallery: { $each: itemsToAdd } },
      },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "Gallery cannot exceed 30 items per project" });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(201).json({
      success: true,
      message: "Gallery images added successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const reorderProjectGallery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    if (!slug) {
      res.status(400).json({ success: false, message: "Project slug parameter is required" });
      return;
    }

    const { order } = req.body as { order?: unknown };
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      res.status(400).json({ success: false, message: "Order must be an array of image ID strings" });
      return;
    }

    for (const id of order) {
      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Invalid identifier format" });
        return;
      }
    }

    if (new Set(order).size !== order.length) {
      res.status(400).json({ success: false, message: "Order array cannot contain duplicates" });
      return;
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
      return;
    }

    const currentGallery = Array.isArray(project.gallery) ? project.gallery : [];
    const currentIds = currentGallery.map((item) => String(item._id));

    if (
      order.length !== currentIds.length ||
      !currentIds.every((id) => order.includes(id))
    ) {
      res.status(400).json({
        success: false,
        message: "Order must contain every current gallery image id exactly once",
      });
      return;
    }

    const itemMap = new Map(currentGallery.map((item) => [String(item._id), item]));
    project.gallery = order.map((id) => itemMap.get(id)!);
    await project.save();

    await populateProjectDoc(project);

    res.status(200).json({
      success: true,
      message: "Gallery order updated successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    next(error);
  }
};

export const updateProjectGalleryImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const imageId = extractParamString(req.params.imageId);

    if (!imageId || !Types.ObjectId.isValid(imageId)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const setFields: Record<string, unknown> = {};

    if (req.body.tags !== undefined) {
      if (
        req.body.tags === "" ||
        (Array.isArray(req.body.tags) && req.body.tags.length === 0)
      ) {
        setFields["gallery.$.tags"] = [];
      } else {
        const tagsResult = normalizeAndValidateGalleryTags(req.body.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }
        setFields["gallery.$.tags"] = tagsResult.tags || [];
      }
    }

    if (req.body.caption !== undefined) {
      const captionResult = validateGalleryCaption(req.body.caption);
      if (captionResult.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: captionResult.error });
        return;
      }
      setFields["gallery.$.caption"] = captionResult.caption || "";
    }

    if (typeof req.body.galleryImage === "string" && req.body.galleryImage) {
      const gUrl = req.body.galleryImage.trim();
      if (!isValidHttpUrl(gUrl)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: "galleryImage must be a valid http or https URL" });
        return;
      }
      setFields["gallery.$.url"] = gUrl;
    }

    if (Object.keys(setFields).length === 0) {
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      const item = (project.gallery || []).find((img) => String(img._id) === imageId);
      if (!item) {
        res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
        return;
      }
      await populateProjectDoc(project);
      res.status(200).json({
        success: true,
        message: "Gallery image updated successfully",
        data: formatProjectResponse(project),
      });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      { slug, "gallery._id": new Types.ObjectId(imageId) },
      { $set: setFields },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      await cleanupUploadedVersionMedia(req);
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(200).json({
      success: true,
      message: "Gallery image updated successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const deleteProjectGalleryImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const imageId = extractParamString(req.params.imageId);

    if (!imageId || !Types.ObjectId.isValid(imageId)) {
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      { slug, "gallery._id": new Types.ObjectId(imageId) },
      { $pull: { gallery: { _id: new Types.ObjectId(imageId) } } },
      { new: true }
    );

    if (!updatedProject) {
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(200).json({
      success: true,
      message: "Gallery image deleted successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Version Gallery Controllers
// ---------------------------------------------------------------------------

export const addVersionGallery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const versionId = extractParamString(req.params.versionId);

    if (!versionId || !Types.ObjectId.isValid(versionId)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const hasFiles = Boolean(req.galleryUploadedFiles && req.galleryUploadedFiles.length > 0);
    const hasItems = Boolean(req.body.items !== undefined);

    if (hasFiles && hasItems) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "A request must have files or items, not both" });
      return;
    }

    if (!hasFiles && !hasItems) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "A request must have files or items" });
      return;
    }

    const itemsToAdd: IGalleryImage[] = [];

    if (hasFiles) {
      const uploadedFiles = req.galleryUploadedFiles!;
      let galleryMetaList: Array<{ tags?: unknown; caption?: unknown }> = [];

      if (req.body.galleryMeta !== undefined) {
        if (typeof req.body.galleryMeta === "string") {
          try {
            const parsed = JSON.parse(req.body.galleryMeta);
            if (!Array.isArray(parsed)) {
              await cleanupUploadedVersionMedia(req);
              res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
              return;
            }
            galleryMetaList = parsed;
          } catch {
            await cleanupUploadedVersionMedia(req);
            res.status(400).json({ success: false, message: "Invalid JSON format for galleryMeta" });
            return;
          }
        } else if (Array.isArray(req.body.galleryMeta)) {
          galleryMetaList = req.body.galleryMeta;
        } else {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta must be a JSON array" });
          return;
        }

        if (galleryMetaList.length > uploadedFiles.length) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: "galleryMeta contains more entries than uploaded files" });
          return;
        }
      }

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const meta = galleryMetaList[i] || {};

        const tagsResult = normalizeAndValidateGalleryTags(meta.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(meta.caption);
        if (captionResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        itemsToAdd.push({
          _id: new Types.ObjectId(),
          url: file.url,
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }
    } else {
      let rawItems = req.body.items;
      if (typeof rawItems === "string") {
        try {
          rawItems = JSON.parse(rawItems);
        } catch {
          res.status(400).json({ success: false, message: "Invalid JSON format for items" });
          return;
        }
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        res.status(400).json({ success: false, message: "items must be a non-empty array" });
        return;
      }

      if (rawItems.length > 10) {
        res.status(400).json({ success: false, message: "At most 10 items per request" });
        return;
      }

      for (const item of rawItems) {
        if (!item || typeof item !== "object" || typeof item.url !== "string" || !isValidHttpUrl(item.url)) {
          res.status(400).json({ success: false, message: "Each item must have a valid http or https url" });
          return;
        }

        const tagsResult = normalizeAndValidateGalleryTags(item.tags);
        if (tagsResult.error) {
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }

        const captionResult = validateGalleryCaption(item.caption);
        if (captionResult.error) {
          res.status(400).json({ success: false, message: captionResult.error });
          return;
        }

        itemsToAdd.push({
          _id: new Types.ObjectId(),
          url: item.url.trim(),
          tags: tagsResult.tags || [],
          caption: captionResult.caption || "",
        });
      }
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
      return;
    }

    const version = (project.versions || []).find((v) => String(v._id) === versionId);
    if (!version) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({ success: false, message: `Version not found with id: ${versionId}` });
      return;
    }

    const currentCount = Array.isArray(version.gallery) ? version.gallery.length : 0;
    if (currentCount + itemsToAdd.length > 30) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({
        success: false,
        message: `Gallery cannot exceed 30 items per version (current: ${currentCount}, adding: ${itemsToAdd.length})`,
      });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      { slug, "versions._id": new Types.ObjectId(versionId) },
      { $push: { "versions.$.gallery": { $each: itemsToAdd } } },
      { new: true, runValidators: true }
    );

    if (!updatedProject) {
      await cleanupUploadedVersionMedia(req);
      res.status(404).json({ success: false, message: "Project or version not found" });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(201).json({
      success: true,
      message: "Gallery images added successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const reorderVersionGallery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const versionId = extractParamString(req.params.versionId);

    if (!versionId || !Types.ObjectId.isValid(versionId)) {
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const { order } = req.body as { order?: unknown };
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      res.status(400).json({ success: false, message: "Order must be an array of image ID strings" });
      return;
    }

    for (const id of order) {
      if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: "Invalid identifier format" });
        return;
      }
    }

    if (new Set(order).size !== order.length) {
      res.status(400).json({ success: false, message: "Order array cannot contain duplicates" });
      return;
    }

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
      return;
    }

    const version = (project.versions || []).find((v) => String(v._id) === versionId);
    if (!version) {
      res.status(404).json({ success: false, message: `Version not found with id: ${versionId}` });
      return;
    }

    const currentGallery = Array.isArray(version.gallery) ? version.gallery : [];
    const currentIds = currentGallery.map((item) => String(item._id));

    if (
      order.length !== currentIds.length ||
      !currentIds.every((id) => order.includes(id))
    ) {
      res.status(400).json({
        success: false,
        message: "Order must contain every current gallery image id exactly once",
      });
      return;
    }

    const itemMap = new Map(currentGallery.map((item) => [String(item._id), item]));
    version.gallery = order.map((id) => itemMap.get(id)!);
    await project.save();

    await populateProjectDoc(project);

    res.status(200).json({
      success: true,
      message: "Gallery order updated successfully",
      data: formatProjectResponse(project),
    });
  } catch (error) {
    next(error);
  }
};

export const updateVersionGalleryImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const versionId = extractParamString(req.params.versionId);
    const imageId = extractParamString(req.params.imageId);

    if (!versionId || !Types.ObjectId.isValid(versionId) || !imageId || !Types.ObjectId.isValid(imageId)) {
      await cleanupUploadedVersionMedia(req);
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const setFields: Record<string, unknown> = {};

    if (req.body.tags !== undefined) {
      if (
        req.body.tags === "" ||
        (Array.isArray(req.body.tags) && req.body.tags.length === 0)
      ) {
        setFields["versions.$[v].gallery.$[g].tags"] = [];
      } else {
        const tagsResult = normalizeAndValidateGalleryTags(req.body.tags);
        if (tagsResult.error) {
          await cleanupUploadedVersionMedia(req);
          res.status(400).json({ success: false, message: tagsResult.error });
          return;
        }
        setFields["versions.$[v].gallery.$[g].tags"] = tagsResult.tags || [];
      }
    }

    if (req.body.caption !== undefined) {
      const captionResult = validateGalleryCaption(req.body.caption);
      if (captionResult.error) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: captionResult.error });
        return;
      }
      setFields["versions.$[v].gallery.$[g].caption"] = captionResult.caption || "";
    }

    if (typeof req.body.galleryImage === "string" && req.body.galleryImage) {
      const gUrl = req.body.galleryImage.trim();
      if (!isValidHttpUrl(gUrl)) {
        await cleanupUploadedVersionMedia(req);
        res.status(400).json({ success: false, message: "galleryImage must be a valid http or https URL" });
        return;
      }
      setFields["versions.$[v].gallery.$[g].url"] = gUrl;
    }

    if (Object.keys(setFields).length === 0) {
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      const version = (project.versions || []).find((v) => String(v._id) === versionId);
      if (!version) {
        res.status(404).json({ success: false, message: `Version not found with id: ${versionId}` });
        return;
      }
      const item = (version.gallery || []).find((img) => String(img._id) === imageId);
      if (!item) {
        res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
        return;
      }
      await populateProjectDoc(project);
      res.status(200).json({
        success: true,
        message: "Gallery image updated successfully",
        data: formatProjectResponse(project),
      });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      {
        slug,
        "versions._id": new Types.ObjectId(versionId),
        "versions.gallery._id": new Types.ObjectId(imageId),
      },
      { $set: setFields },
      {
        arrayFilters: [
          { "v._id": new Types.ObjectId(versionId) },
          { "g._id": new Types.ObjectId(imageId) },
        ],
        new: true,
        runValidators: true,
      }
    );

    if (!updatedProject) {
      await cleanupUploadedVersionMedia(req);
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      const version = (project.versions || []).find((v) => String(v._id) === versionId);
      if (!version) {
        res.status(404).json({ success: false, message: `Version not found with id: ${versionId}` });
        return;
      }
      res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(200).json({
      success: true,
      message: "Gallery image updated successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    await cleanupUploadedVersionMedia(req);
    next(error);
  }
};

export const deleteVersionGalleryImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = extractParamString(req.params.slug).toLowerCase().trim();
    const versionId = extractParamString(req.params.versionId);
    const imageId = extractParamString(req.params.imageId);

    if (!versionId || !Types.ObjectId.isValid(versionId) || !imageId || !Types.ObjectId.isValid(imageId)) {
      res.status(400).json({ success: false, message: "Invalid identifier format" });
      return;
    }

    const updatedProject = await Project.findOneAndUpdate(
      {
        slug,
        "versions._id": new Types.ObjectId(versionId),
        "versions.gallery._id": new Types.ObjectId(imageId),
      },
      { $pull: { "versions.$[v].gallery": { _id: new Types.ObjectId(imageId) } } },
      {
        arrayFilters: [{ "v._id": new Types.ObjectId(versionId) }],
        new: true,
      }
    );

    if (!updatedProject) {
      const project = await Project.findOne({ slug });
      if (!project) {
        res.status(404).json({ success: false, message: `Project not found with slug: ${slug}` });
        return;
      }
      const version = (project.versions || []).find((v) => String(v._id) === versionId);
      if (!version) {
        res.status(404).json({ success: false, message: `Version not found with id: ${versionId}` });
        return;
      }
      res.status(404).json({ success: false, message: `Gallery image not found with id: ${imageId}` });
      return;
    }

    await populateProjectDoc(updatedProject);

    res.status(200).json({
      success: true,
      message: "Gallery image deleted successfully",
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    next(error);
  }
};
