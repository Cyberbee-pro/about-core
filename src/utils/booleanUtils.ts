export interface ParseBooleanFieldResult {
  value?: boolean;
  error?: string;
}

/**
 * Validates and parses boolean inputs (e.g. isLatest).
 * Accepts true, false, "true", "false".
 * Rejects other values with a 400-friendly error message.
 */
export const parseBooleanField = (
  value: unknown,
  fieldName: string = "isLatest"
): ParseBooleanFieldResult => {
  if (value === true || value === "true") {
    return { value: true };
  }
  if (value === false || value === "false") {
    return { value: false };
  }
  return {
    error: `${fieldName} must be a boolean (true or false)`,
  };
};
