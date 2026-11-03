/**
 * Escapes special regex characters in user-supplied strings before passing to new RegExp()
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Strips existing file extensions (e.g. .pdf, .pdf.pdf, or any trailing extension)
 * to prevent double-extension bugs when appending or saving.
 */
export const stripExtension = (filename: string): string => {
  if (!filename || typeof filename !== "string") return "";
  return filename
    .replace(/(\.pdf)+$/gi, "")
    .replace(/\.[a-zA-Z0-9]+$/i, "");
};

/**
 * Sanitizes a resume filename or public ID to ensure exactly one .pdf extension,
 * stripping pre-existing extensions first to avoid duplicate extensions like .pdf.pdf.
 */
export const sanitizeResumeFilename = (filename: string): string => {
  if (!filename || typeof filename !== "string") return "";
  const base = stripExtension(filename);
  return `${base}.pdf`;
};

/**
 * Sanitizes a resume delivery URL to ensure it does not end with duplicate .pdf extensions
 * (e.g. .pdf.pdf -> .pdf).
 */
export const sanitizeResumeUrl = (url: string): string => {
  if (!url || typeof url !== "string") return url;
  return url.replace(/(\.pdf)+$/i, ".pdf").replace(/\.pdf\.pdf/gi, ".pdf");
};

/**
 * Sanitizes a resume public ID to ensure it does not include file extensions
 * (e.g. 'resume_date_4.pdf' or 'resume_date_4.pdf.pdf' -> 'resume_date_4').
 */
export const sanitizeResumePublicId = (publicId: string): string => {
  if (!publicId || typeof publicId !== "string") return publicId;
  return stripExtension(publicId);
};

/**
 * Extracts a single string from an Express route parameter which may be string or string[].
 */
export const extractParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) {
    return param[0] ?? "";
  }
  return param ?? "";
};

/**
 * Validates that an input is an absolute http: or https: URL.
 * Parses with WHATWG `new URL`.
 * Rejects javascript:, data:, vbscript:, file:, ftp:, protocol-relative "//host",
 * relative paths, strings with control characters or embedded whitespace.
 * Trims surrounding whitespace first.
 */
export const isValidHttpUrl = (urlString: unknown): boolean => {
  if (typeof urlString !== "string") return false;
  const trimmed = urlString.trim();
  if (!trimmed) return false;
  if (/[\s\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const isHttpUrl = isValidHttpUrl;

export const normalizeHttpUrl = (urlString: unknown): string | null => {
  return isValidHttpUrl(urlString) ? (urlString as string).trim() : null;
};



