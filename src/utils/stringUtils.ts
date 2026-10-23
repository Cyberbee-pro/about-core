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

