/**
 * Tests for getNextPublicId — sequential naming, caching, and fallback.
 */
jest.mock("@/config/cloudinary", () => {
  const search = {
    expression: jest.fn(),
    max_results: jest.fn(),
    execute: jest.fn(),
  };
  search.expression.mockReturnValue(search);
  search.max_results.mockReturnValue(search);
  const cloudinary = { search, uploader: { upload_stream: jest.fn() } };
  return { __esModule: true, default: cloudinary, cloudinary };
});

import {
  getUniquePublicId,
  getNextPublicId,
  getNextResumePublicId,
  stripExtension,
  sanitizeResumeFilename,
  sanitizeResumeUrl,
  sanitizeResumePublicId,
  sanitizeVersionTag,
} from "@/middlewares/uploadMiddleware";

interface CloudinarySearchTestDouble {
  search: {
    expression: jest.Mock;
    max_results: jest.Mock;
    execute: jest.Mock;
  };
}

const mockCloudinary = jest.requireMock("@/config/cloudinary") as {
  default: CloudinarySearchTestDouble;
};
const mockSearch = mockCloudinary.default.search;
const mockExecute = mockSearch.execute;

describe("getUniquePublicId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("appends timestamp and random string to base", () => {
    const id = getUniquePublicId("my-app");
    expect(id).toMatch(/^my-app_\d+_[a-z0-9]+$/);
  });

  it("produces distinct IDs for successive calls with the same base", () => {
    const id1 = getUniquePublicId("my-app");
    const id2 = getUniquePublicId("my-app");
    expect(id1).not.toBe(id2);
  });

  it("does not call Cloudinary Search API", () => {
    getUniquePublicId("test");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("getNextPublicId (compatibility wrapper)", () => {
  it("returns unique suffixed public ID using getUniquePublicId", async () => {
    const id = await getNextPublicId(new Map(), "folder", "my-app");
    expect(id).toMatch(/^my-app_\d+_[a-z0-9]+$/);
  });
});

describe("getNextResumePublicId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
  });

  it("returns resume_date_1 when resume folder is empty", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    expect(id).toBe("resume_date_1");
    expect(mockSearch.expression).toHaveBeenCalledWith("folder:portfolio/site_config/resume");
  });

  it("returns resume_date_3 when resume_date_1 and resume_date_2 exist (with or without .pdf extension)", async () => {
    mockExecute.mockResolvedValue({
      resources: [
        { public_id: "portfolio/site_config/resume/resume_date_1.pdf", folder: "portfolio/site_config/resume", resource_type: "raw" },
        { public_id: "portfolio/site_config/resume/resume_date_2", folder: "portfolio/site_config/resume", resource_type: "raw" },
      ],
      total_count: 2,
    });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    expect(id).toBe("resume_date_3");
  });

  it("returns resume_date_2 when existing file has no extension (resume_date_1)", async () => {
    mockExecute.mockResolvedValue({
      resources: [
        { public_id: "portfolio/site_config/resume/resume_date_1", folder: "portfolio/site_config/resume", resource_type: "raw" },
      ],
      total_count: 1,
    });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    expect(id).toBe("resume_date_2");
  });

  it("increments within the same request cache without re-querying Search API", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id1 = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    const id2 = await getNextResumePublicId(cache, "portfolio/site_config/resume");

    expect(id1).toBe("resume_date_1");
    expect(id2).toBe("resume_date_2");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns resume_date_2 when existing file has double extension (resume_date_1.pdf.pdf)", async () => {
    mockExecute.mockResolvedValue({
      resources: [
        { public_id: "portfolio/site_config/resume/resume_date_1.pdf.pdf", folder: "portfolio/site_config/resume", resource_type: "raw" },
      ],
      total_count: 1,
    });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    expect(id).toBe("resume_date_2");
  });

  it("strips existing extension from custom base before incrementing (e.g. resume_date.pdf -> resume_date_1)", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume", "resume_date.pdf");
    expect(id).toBe("resume_date_1");
  });

  it("strips double extension from custom base before incrementing (e.g. resume_date.pdf.pdf -> resume_date_1)", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume", "resume_date.pdf.pdf");
    expect(id).toBe("resume_date_1");
  });

  it("falls back to timestamp naming without extension when Search API fails", async () => {
    mockExecute.mockRejectedValue(new Error("Search API unavailable"));
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextResumePublicId(cache, "portfolio/site_config/resume");
    expect(id).toMatch(/^resume_date_\d{13,}$/);
    expect(id).not.toContain(".pdf");
  });
});

describe("Resume filename and URL sanitization helpers", () => {
  describe("stripExtension", () => {
    it("strips single .pdf extension", () => {
      expect(stripExtension("resume.pdf")).toBe("resume");
      expect(stripExtension("resume_date_1.pdf")).toBe("resume_date_1");
    });

    it("strips double .pdf.pdf extensions", () => {
      expect(stripExtension("resume.pdf.pdf")).toBe("resume");
      expect(stripExtension("resume_date_1.pdf.pdf")).toBe("resume_date_1");
    });

    it("strips uppercase .PDF extensions", () => {
      expect(stripExtension("resume.PDF")).toBe("resume");
      expect(stripExtension("resume.PDF.pdf")).toBe("resume");
    });

    it("strips general trailing extensions", () => {
      expect(stripExtension("resume.docx")).toBe("resume");
      expect(stripExtension("file.txt")).toBe("file");
    });

    it("preserves strings without extensions", () => {
      expect(stripExtension("resume_date_1")).toBe("resume_date_1");
      expect(stripExtension("")).toBe("");
    });
  });

  describe("sanitizeResumeFilename", () => {
    it("ensures a single .pdf extension when none exists", () => {
      expect(sanitizeResumeFilename("resume")).toBe("resume.pdf");
      expect(sanitizeResumeFilename("resume_date_1")).toBe("resume_date_1.pdf");
    });

    it("preserves single .pdf extension without duplicating", () => {
      expect(sanitizeResumeFilename("resume.pdf")).toBe("resume.pdf");
      expect(sanitizeResumeFilename("resume_date_1.pdf")).toBe("resume_date_1.pdf");
    });

    it("collapses double .pdf.pdf extension to single .pdf", () => {
      expect(sanitizeResumeFilename("resume.pdf.pdf")).toBe("resume.pdf");
      expect(sanitizeResumeFilename("resume_date_1.pdf.pdf")).toBe("resume_date_1.pdf");
    });
  });

  describe("sanitizeResumeUrl", () => {
    it("fixes double .pdf.pdf in delivery URLs", () => {
      const doublePdfUrl = "https://res.cloudinary.com/demo/image/upload/v1/portfolio/site_config/resume/resume_date_1.pdf.pdf";
      expect(sanitizeResumeUrl(doublePdfUrl)).toBe(
        "https://res.cloudinary.com/demo/image/upload/v1/portfolio/site_config/resume/resume_date_1.pdf"
      );
    });

    it("leaves normal .pdf URLs untouched", () => {
      const normalPdfUrl = "https://res.cloudinary.com/demo/image/upload/v1/portfolio/site_config/resume/resume_date_1.pdf";
      expect(sanitizeResumeUrl(normalPdfUrl)).toBe(normalPdfUrl);
    });

    it("leaves non-pdf URLs untouched", () => {
      const driveUrl = "https://drive.google.com/file/d/123/view";
      expect(sanitizeResumeUrl(driveUrl)).toBe(driveUrl);
    });
  });

  describe("sanitizeResumePublicId", () => {
    it("strips double .pdf.pdf from public ID to clean ID without extension", () => {
      expect(sanitizeResumePublicId("portfolio/site_config/resume/resume_date_1.pdf.pdf")).toBe(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("strips single .pdf extension from public ID", () => {
      expect(sanitizeResumePublicId("portfolio/site_config/resume/resume_date_1.pdf")).toBe(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("preserves public ID that has no extension", () => {
      expect(sanitizeResumePublicId("portfolio/site_config/resume/resume_date_1")).toBe(
        "portfolio/site_config/resume/resume_date_1"
      );
    });
  });

  describe("sanitizeVersionTag", () => {
    it("preserves dots in standard semantic version tags", () => {
      expect(sanitizeVersionTag("v1.0.0")).toBe("v1.0.0");
      expect(sanitizeVersionTag("1.2.3.4")).toBe("1.2.3.4");
      expect(sanitizeVersionTag("v2.1.0-beta.1")).toBe("v2.1.0-beta.1");
    });

    it("lowercases uppercase characters and trims whitespace", () => {
      expect(sanitizeVersionTag("  V1.0.0  ")).toBe("v1.0.0");
      expect(sanitizeVersionTag("RELEASE-2.0")).toBe("release-2.0");
    });

    it("preserves underscores and hyphens", () => {
      expect(sanitizeVersionTag("v1_0_0")).toBe("v1_0_0");
      expect(sanitizeVersionTag("v1-0-0")).toBe("v1-0-0");
    });

    it("replaces spaces, slashes, and special characters with hyphens", () => {
      expect(sanitizeVersionTag("v1/0/0")).toBe("v1-0-0");
      expect(sanitizeVersionTag("v1\\0\\0")).toBe("v1-0-0");
      expect(sanitizeVersionTag("v1 0 0")).toBe("v1-0-0");
      expect(sanitizeVersionTag("v1:0:0")).toBe("v1-0-0");
      expect(sanitizeVersionTag("v1@final#1")).toBe("v1-final-1");
    });

    it("prevents directory traversal by neutralizing consecutive dots", () => {
      expect(sanitizeVersionTag("../../v1.0.0")).toBe("v1.0.0");
      expect(sanitizeVersionTag("..")).toBe("");
      expect(sanitizeVersionTag("....")).toBe("");
      expect(sanitizeVersionTag("v1..0..0")).toBe("v1-0-0");
    });

    it("strips leading and trailing dots and hyphens", () => {
      expect(sanitizeVersionTag("---v1.0.0...")).toBe("v1.0.0");
      expect(sanitizeVersionTag(".v1.0.0.")).toBe("v1.0.0");
      expect(sanitizeVersionTag("---")).toBe("");
      expect(sanitizeVersionTag("...")).toBe("");
    });

    it("collapses multiple consecutive hyphens into a single hyphen", () => {
      expect(sanitizeVersionTag("v1---beta---1")).toBe("v1-beta-1");
    });

    it("safely truncates excessively long tags to maximum 64 characters", () => {
      const veryLong = "v1.0.0-" + "a".repeat(100);
      const sanitized = sanitizeVersionTag(veryLong);
      expect(sanitized.length).toBeLessThanOrEqual(64);
      expect(sanitized.startsWith("v1.0.0-")).toBe(true);
      expect(sanitized.endsWith("-")).toBe(false);
      expect(sanitized.endsWith(".")).toBe(false);
    });
  });
});
