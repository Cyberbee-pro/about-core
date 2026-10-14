/**
 * Escapes special regex characters in user-supplied strings before passing to new RegExp()
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
