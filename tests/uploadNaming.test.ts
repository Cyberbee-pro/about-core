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
  getNextPublicId,
  getNextResumePublicId,
  stripExtension,
  sanitizeResumeFilename,
  sanitizeResumeUrl,
  sanitizeResumePublicId,
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

describe("getNextPublicId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup chaining after clearAllMocks
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
  });

  it("returns slug_1 when folder is empty", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextPublicId(cache, "portfolio/projects/my-app/images", "my-app");
    expect(id).toBe("my-app_1");
  });

  it("returns slug_3 when slug_1 and slug_2 already exist", async () => {
    mockExecute.mockResolvedValue({
      resources: [
        { public_id: "portfolio/projects/my-app/images/my-app_1", folder: "portfolio/projects/my-app/images", resource_type: "image" },
        { public_id: "portfolio/projects/my-app/images/my-app_2", folder: "portfolio/projects/my-app/images", resource_type: "image" },
      ],
      total_count: 2,
    });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextPublicId(cache, "portfolio/projects/my-app/images", "my-app");
    expect(id).toBe("my-app_3");
  });

  it("returns profile_1 for profile assets with empty folder", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextPublicId(cache, "portfolio/profile/images", "profile");
    expect(id).toBe("profile_1");
  });

  it("uses cached results — does NOT call search API twice for the same folder", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    await getNextPublicId(cache, "portfolio/projects/demo/images", "demo");
    await getNextPublicId(cache, "portfolio/projects/demo/images", "demo");

    // Search API called only once for this folder
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("increments within the same cache when called for the same folder", async () => {
    mockExecute.mockResolvedValue({ resources: [], total_count: 0 });
    const cache: Map<string, string[] | null> = new Map();

    const id1 = await getNextPublicId(cache, "portfolio/projects/x/images", "x");
    const id2 = await getNextPublicId(cache, "portfolio/projects/x/images", "x");

    expect(id1).toBe("x_1");
    expect(id2).toBe("x_2");
  });

  it("falls back to timestamp name when search API throws", async () => {
    mockExecute.mockRejectedValue(new Error("Cloudinary unavailable"));
    const cache: Map<string, string[] | null> = new Map();

    const id = await getNextPublicId(cache, "portfolio/projects/fail/images", "fail");
    expect(id).toMatch(/^fail_\d{13,}$/); // timestamp pattern
  });

  it("caches the error — does not re‑call search on subsequent attempts", async () => {
    mockExecute.mockRejectedValue(new Error("Cloudinary unavailable"));
    const cache: Map<string, string[] | null> = new Map();

    await getNextPublicId(cache, "portfolio/projects/fail/images", "fail");
    await getNextPublicId(cache, "portfolio/projects/fail/images", "fail");

    expect(mockExecute).toHaveBeenCalledTimes(1);
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
});
