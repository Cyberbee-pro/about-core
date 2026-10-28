import request from "supertest";
import { LogEntry } from "@/models/LogEntry";
import { Project } from "@/models/Project";
import { SiteConfig } from "@/models/SiteConfig";
import { Writable } from "stream";

// Set environment variables for tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock Mongoose models
jest.mock("@/models/LogEntry");
jest.mock("@/models/Project");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

interface CloudinaryMockOptions {
  folder: string;
  resource_type: string;
  public_id?: string;
  access_mode?: string;
}

type CloudinaryMockCallback = (
  err: Error | null,
  result?: { secure_url: string; public_id: string }
) => void;

jest.mock("@/config/cloudinary", () => {
  const uploadCalls: CloudinaryMockOptions[] = [];
  const search = {
    expression: jest.fn(),
    max_results: jest.fn(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  search.expression.mockReturnValue(search);
  search.max_results.mockReturnValue(search);
  const uploader = {
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    upload_stream: (options: CloudinaryMockOptions, callback: CloudinaryMockCallback): Writable => {
      uploadCalls.push(options);
      const writable = new Writable({ write(_chunk, _encoding, next) { next(); } });
      process.nextTick(() => callback(null, {
        secure_url: `https://res.cloudinary.com/demo/${options.resource_type}/${options.folder}/test_file`,
        public_id: options.public_id ? `${options.folder}/${options.public_id}` : "test_public_id",
      }));
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

interface CloudinaryTestDouble {
  uploader: {
    destroy: jest.Mock;
    upload_stream: jest.Mock;
  };
  search: {
    expression: jest.Mock;
    max_results: jest.Mock;
    execute: jest.Mock;
  };
  uploadCalls: CloudinaryMockOptions[];
}

const mockCloudinary = jest.requireMock("@/config/cloudinary") as {
  default: CloudinaryTestDouble;
};
const mockApiSearch = mockCloudinary.default.search;
const mockUploadCalls = mockCloudinary.default.uploadCalls;
const mockDestroy = mockCloudinary.default.uploader.destroy;

const { app: expressApp } = require("@/server") as typeof import("@/server");
const app = expressApp.listen(0);

describe("about-core API & Middleware Integration Tests", () => {
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      app.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;

    // Re-establish search mock chaining after clearAllMocks
    mockApiSearch.expression.mockReturnValue(mockApiSearch);
    mockApiSearch.max_results.mockReturnValue(mockApiSearch);
    mockApiSearch.execute.mockResolvedValue({ resources: [], total_count: 0 });
  });

  describe("Health Check", () => {
    it("GET /health should return healthy status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.uptime).toBe("number");
    });

    it("GET /api/v1/health should return service details as JSON", async () => {
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.service).toBe("about-core");
      expect(res.body.version).toBe("1.0.0");
      expect(res.body.status).toBe("healthy");
      expect(res.body).toHaveProperty("dbStatus");
      expect(res.body).toHaveProperty("memoryUsageMB");
    });

    it("GET /api/v1/health should always return JSON even when Accept header includes text/html", async () => {
      const res = await request(app)
        .get("/api/v1/health")
        .set("Accept", "text/html,application/xhtml+xml");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.service).toBe("about-core");
      expect(res.body.status).toBe("healthy");
    });

    it("GET / should serve the MAGI EVA-0 HTML dashboard from public/index.html", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.text).toContain("ABOUT CORE");
      expect(res.text).toContain("EVA 0");
      expect(res.text).toContain("HEX_L.svg");
      expect(res.text).toContain("HEX_R.svg");
      expect(res.text).toContain("red-accent-line");
      expect(res.text).toContain("memorySegments");
      expect(res.text).toContain("memoryMeter");
      expect(res.text).toContain("memory-bar");
      expect(res.text).toContain("memoryVal");
    });

    it("GET /index.html should serve the static HTML dashboard directly", async () => {
      const res = await request(app).get("/index.html");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.text).toContain("ABOUT CORE");
      expect(res.text).toContain("EVA 0");
    });

    it("GET /haz.svg should serve the static hazard SVG from public/", async () => {
      const res = await request(app).get("/haz.svg");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/svg+xml");
    });
  });

  describe("LogEntry MongoDB Middleware", () => {
    it("intercepts incoming request and logs to MongoDB LogEntry collection", async () => {
      (LogEntry.create as jest.Mock).mockResolvedValue({});

      const res = await request(app).get("/health");
      expect(res.status).toBe(200);

      // Give event loop a tick for res.on('finish') async callback
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(LogEntry.create).toHaveBeenCalled();
      const createCallArg = (LogEntry.create as jest.Mock).mock.calls[0][0];
      expect(createCallArg).toHaveProperty("method", "GET");
      expect(createCallArg).toHaveProperty("endpoint", "/health");
      expect(createCallArg).toHaveProperty("statusCode", 200);
      expect(createCallArg).toHaveProperty("level", "INFO");
    });

    it("assigns WARN level for 4xx status codes", async () => {
      (LogEntry.create as jest.Mock).mockResolvedValue({});

      const res = await request(app).get("/non-existent-route");
      expect(res.status).toBe(404);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(LogEntry.create).toHaveBeenCalled();
      const createCallArg = (LogEntry.create as jest.Mock).mock.calls[0][0];
      expect(createCallArg).toHaveProperty("statusCode", 404);
      expect(createCallArg).toHaveProperty("level", "WARN");
    });
  });

  describe("Authentication Middleware", () => {
    it("rejects unauthorized access to protected routes without token", async () => {
      const res = await request(app).post("/api/v1/projects").send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Unauthorized");
    });

    it("rejects unauthorized access with invalid bearer token", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer invalid-token")
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("accepts valid bearer token or x-admin-token", async () => {
      (Project.create as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000001",
        title: "Test Project",
        slug: "test-project",
      });

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Test Project",
          category: "web",
          description: "A test project",
          image: "https://example.com/test.png",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Multer & Cloudinary Media Upload Routing", () => {
    it("maps image, video, and raw 3D model files to their respective folders and resource types", async () => {
      (Project.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ _id: "60c72b2f9b1d8b2bad000001", ...data })
      );

      const fakeImageBuffer = Buffer.from("fake-image-content");
      const fakeVideoBuffer = Buffer.from("fake-video-content");
      const fake3DModelBuffer = Buffer.from("fake-gltf-binary-content");

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Spatial Canvas")
        .field("category", "spatial")
        .field("description", "3D WebGL Portfolio Experiment")
        .attach("image", fakeImageBuffer, {
          filename: "hero.png",
          contentType: "image/png",
        })
        .attach("videoDemo", fakeVideoBuffer, {
          filename: "demo.mp4",
          contentType: "video/mp4",
        })
        .attach("threeDModel", fake3DModelBuffer, {
          filename: "robot.glb",
          contentType: "model/gltf-binary",
        });

      expect(res.status).toBe(201);
      expect(mockUploadCalls.length).toBe(3);

      const imageUpload = mockUploadCalls.find((c) => c.folder === "portfolio/projects/spatial-canvas/images");
      expect(imageUpload).toBeDefined();
      expect(imageUpload?.resource_type).toBe("image");
      expect(imageUpload?.public_id).toBe("spatial-canvas_1");

      const videoUpload = mockUploadCalls.find((c) => c.folder === "portfolio/projects/spatial-canvas/videos");
      expect(videoUpload).toBeDefined();
      expect(videoUpload?.resource_type).toBe("video");
      expect(videoUpload?.public_id).toBe("spatial-canvas_1");

      const modelUpload = mockUploadCalls.find((c) => c.folder === "portfolio/projects/spatial-canvas/models");
      expect(modelUpload).toBeDefined();
      expect(modelUpload?.resource_type).toBe("raw");
      expect(modelUpload?.public_id).toBe("spatial-canvas_1");

      expect(Project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          image: "https://res.cloudinary.com/demo/image/portfolio/projects/spatial-canvas/images/test_file",
          videoDemo: "https://res.cloudinary.com/demo/video/portfolio/projects/spatial-canvas/videos/test_file",
          threeDModel: expect.objectContaining({
            fileUrl: "https://res.cloudinary.com/demo/raw/portfolio/projects/spatial-canvas/models/test_file",
          }),
        })
      );
    });
  });

  describe("Public Project Routes", () => {
    it("GET /api/v1/projects returns filtered non-invisible projects", async () => {
      const mockProjects = [
        { title: "IoT Hub", slug: "iot-hub", category: "iot", status: "active" },
      ];

      (Project.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProjects),
        }),
      });

      const res = await request(app).get("/api/v1/projects?category=iot");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.data).toEqual(mockProjects);
      expect(Project.find).toHaveBeenCalledWith({
        status: { $ne: "invisible" },
        category: "iot",
      });
    });

    it("GET /api/v1/projects/categories returns distinct categories", async () => {
      (Project.distinct as jest.Mock).mockResolvedValue(["iot", "web", "ai"]);

      const res = await request(app).get("/api/v1/projects/categories");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(["iot", "web", "ai"]);
      expect(Project.distinct).toHaveBeenCalledWith("category", {
        status: { $ne: "invisible" },
      });
    });

    it("GET /api/v1/projects/:slug returns single project", async () => {
      const mockProject = {
        title: "IoT Hub",
        slug: "iot-hub",
        status: "active",
      };

      (Project.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockProject),
      });

      const res = await request(app).get("/api/v1/projects/iot-hub");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe("iot-hub");
    });

    it("GET /api/v1/projects/:slug returns 404 when project not found", async () => {
      (Project.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const res = await request(app).get("/api/v1/projects/missing-slug");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Protected Project Mutation Routes", () => {
    it("PUT /api/v1/projects/:id updates project details", async () => {
      const updatedProject = {
        _id: "60c72b2f9b1d8b2bad000001",
        title: "Updated Title",
        category: "robotics",
      };

      (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedProject);

      const res = await request(app)
        .put("/api/v1/projects/60c72b2f9b1d8b2bad000001")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Updated Title",
          category: "robotics",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("Updated Title");
    });

    it("DELETE /api/v1/projects/:id deletes project", async () => {
      (Project.findByIdAndDelete as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000001",
      });

      const res = await request(app)
        .delete("/api/v1/projects/60c72b2f9b1d8b2bad000001")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("deleted successfully");
    });

    it("rejects invalid ObjectId formats", async () => {
      const res = await request(app)
        .delete("/api/v1/projects/invalid-id")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid project ID");
    });
  });

  describe("Admin Project Routes", () => {
    it("GET /api/v1/admin/projects rejects unauthorized request without token", async () => {
      const res = await request(app).get("/api/v1/admin/projects");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Unauthorized");
    });

    it("GET /api/v1/admin/projects rejects request with invalid bearer token", async () => {
      const res = await request(app)
        .get("/api/v1/admin/projects")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Unauthorized");
    });

    it("GET /api/v1/admin/projects returns all projects including invisible and draft items when authenticated", async () => {
      const mockAdminProjects = [
        { title: "Secret Project", slug: "secret-project", category: "rnd", status: "invisible", featured: false },
        { title: "Planning Project", slug: "planning-proj", category: "web", status: "planning", featured: true },
        { title: "Active Project", slug: "active-proj", category: "mobile", status: "active", featured: false },
      ];

      (Project.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAdminProjects),
        }),
      });

      const res = await request(app)
        .get("/api/v1/admin/projects")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.data).toEqual(mockAdminProjects);
      // Verify no status filter was imposed
      expect(Project.find).toHaveBeenCalledWith({});
    });

    it("GET /api/v1/admin/projects supports query filters for status, category, featured, and tag", async () => {
      const mockFilteredProjects = [
        { title: "Secret Project", slug: "secret-project", category: "rnd", status: "invisible", featured: true, tags: ["ai"] },
      ];

      (Project.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockFilteredProjects),
        }),
      });

      const res = await request(app)
        .get("/api/v1/admin/projects?status=invisible&category=rnd&featured=true&tag=ai")
        .set("x-admin-token", "test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.data).toEqual(mockFilteredProjects);
      expect(Project.find).toHaveBeenCalledWith({
        status: "invisible",
        category: "rnd",
        featured: true,
        tags: "ai",
      });
    });
  });

  describe("Site Configuration Routes", () => {
    it("GET /api/v1/config returns existing configuration with profile and job titles", async () => {
      const mockConfig = {
        name: "Shibraj Das",
        pfpUrl: "https://res.cloudinary.com/demo/image/upload/pfp.jpg",
        pfpPublicId: "portfolio/site_config/pfp_123456",
        jobTitles: ["Full-Stack Developer", "Low-Level Developer"],
        resumeUrl: "https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/resume_date_1.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full Stack Engineer",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(mockConfig);

      const res = await request(app).get("/api/v1/config");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Shibraj Das");
      expect(res.body.data.pfpUrl).toBe("https://res.cloudinary.com/demo/image/upload/pfp.jpg");
      expect(res.body.data.pfpPublicId).toBe("portfolio/site_config/pfp_123456");
      expect(res.body.data.jobTitles).toEqual(["Full-Stack Developer", "Low-Level Developer"]);
      expect(res.body.data.resumeUrl).toBe("https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/resume_date_1.pdf");
    });

    it("GET /api/v1/config returns 404 when no configuration exists", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get("/api/v1/config");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Site configuration not found");
      expect(SiteConfig.create).not.toHaveBeenCalled();
    });

    it("GET /api/v1/config preserves resume link from legacy resumeDriveUrl when resumeUrl is absent", async () => {
      const legacyConfig = {
        name: "Shibraj Das",
        jobTitles: ["Engineer"],
        resumeDriveUrl: "https://drive.google.com/file/d/legacy-resume-link/view",
        statusMessage: "Building systems...",
        bioSummary: "Engineer bio",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(legacyConfig);

      const res = await request(app).get("/api/v1/config");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resumeUrl).toBe("https://drive.google.com/file/d/legacy-resume-link/view");
    });

    it("PUT /api/v1/config updates configuration when authenticated with complete payload", async () => {
      const updatedConfig = {
        name: "Shibraj D.",
        jobTitles: ["Lead Architect", "Systems Engineer"],
        resumeUrl: "https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/new-resume.pdf",
        statusMessage: "Shipping features...",
        bioSummary: "Updated bio",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockResolvedValue(updatedConfig);

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send(updatedConfig);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Shibraj D.");
      expect(res.body.data.jobTitles).toEqual(["Lead Architect", "Systems Engineer"]);
      expect(res.body.data.statusMessage).toBe("Shipping features...");
    });

    it("PUT /api/v1/config rejects update when required fields are missing", async () => {
      const incompleteConfig = {
        name: "Shibraj D.",
      };

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send(incompleteConfig);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Missing required fields");
      expect(res.body.message).toContain("jobTitles");
      expect(res.body.message).toContain("resumeUrl");
    });

    it("PUT /api/v1/config parses stringified jobTitles from multipart requests with all required fields", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockImplementation((_q, update) =>
        Promise.resolve(update.$set || update)
      );

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Core Engineer", "Graphics Dev"]))
        .field("resumeUrl", "https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/resume_date_1.pdf")
        .field("statusMessage", "Building systems...")
        .field("bioSummary", "Full stack engineer");

      expect(res.status).toBe(200);
      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: expect.objectContaining({
            name: "Shibraj Das",
            jobTitles: ["Core Engineer", "Graphics Dev"],
            resumeUrl: "https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/resume_date_1.pdf",
          }),
        },
        expect.any(Object)
      );
    });

    it("PUT /api/v1/config uploads new profile picture to portfolio/site_config, retains history, and does NOT delete previous image", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
        pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_old",
        pfpPublicId: "portfolio/site_config/pfp_old",
        pfpHistory: [
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_old",
            publicId: "portfolio/site_config/pfp_old",
            uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockImplementation((_q, update) =>
        Promise.resolve({
          ...existingConfig,
          ...(update.$set || {}),
          pfpHistory: [
            ...(update.$push?.pfpHistory?.$each || []),
            ...existingConfig.pfpHistory,
          ],
        })
      );

      const fakeImage = Buffer.from("fake-avatar-data");

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Full-Stack Developer"]))
        .field("resumeUrl", "https://example.com/resume.pdf")
        .field("statusMessage", "Building systems...")
        .field("bioSummary", "Full stack engineer")
        .attach("pfp", fakeImage, {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);

      // Verify Cloudinary upload folder and naming
      const pfpUploadCall = mockUploadCalls.find(
        (call) => call.folder === "portfolio/site_config"
      );
      expect(pfpUploadCall).toBeDefined();
      expect(pfpUploadCall?.resource_type).toBe("image");
      expect(pfpUploadCall?.public_id).toMatch(/^pfp_\d+$/);

      // Verify previous image was NOT deleted from Cloudinary
      expect(mockDestroy).not.toHaveBeenCalled();

      // Verify update in database preserves history and adds new avatar via atomic operators
      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: expect.objectContaining({
            pfpUrl: expect.stringContaining("portfolio/site_config/test_file"),
            pfpPublicId: expect.stringContaining("portfolio/site_config/pfp_"),
          }),
          $push: {
            pfpHistory: {
              $each: [
                expect.objectContaining({
                  url: expect.stringContaining("portfolio/site_config/test_file"),
                  publicId: expect.stringContaining("portfolio/site_config/pfp_"),
                }),
              ],
              $position: 0,
            },
          },
        },
        expect.any(Object)
      );
    });

    it("PUT /api/v1/config allows selecting past profile picture from pfpHistory (carousel selection)", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
        pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_current",
        pfpPublicId: "portfolio/site_config/pfp_current",
        pfpHistory: [
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_current",
            publicId: "portfolio/site_config/pfp_current",
            uploadedAt: new Date("2026-02-01T00:00:00.000Z"),
          },
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_past",
            publicId: "portfolio/site_config/pfp_past",
            uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockImplementation((_q, update) =>
        Promise.resolve({ ...existingConfig, ...(update.$set || {}) })
      );

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.pdf",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
          pfpPublicId: "portfolio/site_config/pfp_past",
        });

      expect(res.status).toBe(200);

      // Verify active pfp was switched to selected past history item
      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: expect.objectContaining({
            pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_past",
            pfpPublicId: "portfolio/site_config/pfp_past",
          }),
        },
        expect.any(Object)
      );

      // Verify no Cloudinary destroy was triggered
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("PUT /api/v1/config rejects selection when pfpPublicId and pfpUrl are mismatched", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
        pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
        pfpPublicId: "portfolio/site_config/pfp_1",
        pfpHistory: [
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
            publicId: "portfolio/site_config/pfp_1",
            uploadedAt: new Date(),
          },
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_2",
            publicId: "portfolio/site_config/pfp_2",
            uploadedAt: new Date(),
          },
        ],
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.pdf",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
          pfpPublicId: "portfolio/site_config/pfp_1",
          pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_2",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Selected profile picture does not match history or is mismatched");
    });

    it("PUT /api/v1/config rejects selection when raw pfpUrl is not found in pfpHistory", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
        pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
        pfpPublicId: "portfolio/site_config/pfp_1",
        pfpHistory: [
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
            publicId: "portfolio/site_config/pfp_1",
            uploadedAt: new Date(),
          },
        ],
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.pdf",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
          pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/unknown_pfp",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Raw profile picture URL without valid publicId is not allowed");
    });

    it("PUT /api/v1/config rejects selection when pfpPublicId is not found in pfpHistory", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
        pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
        pfpPublicId: "portfolio/site_config/pfp_1",
        pfpHistory: [
          {
            url: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
            publicId: "portfolio/site_config/pfp_1",
            uploadedAt: new Date(),
          },
        ],
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.pdf",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
          pfpPublicId: "portfolio/site_config/unknown_id",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Profile picture publicId not found in history");
    });

    it("POST /api/v1/config rejects when only one of pfpUrl or pfpPublicId is provided", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.pdf",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
          pfpUrl: "https://res.cloudinary.com/demo/image/portfolio/site_config/pfp_1",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Both pfpUrl and pfpPublicId must be provided together");
    });

    it("PUT /api/v1/config uploads resume PDF to portfolio/site_config/resume, saves resumeUrl, and returns updated document", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockImplementation((_q, update) =>
        Promise.resolve({
          ...existingConfig,
          ...(update.$set || {}),
        })
      );

      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Full-Stack Developer"]))
        .field("resumeUrl", "https://example.com/resume.pdf")
        .field("statusMessage", "Building systems...")
        .field("bioSummary", "Full stack engineer")
        .attach("resume", fakePdf, {
          filename: "my-resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify Cloudinary upload folder, resource_type, and naming convention
      const resumeUploadCall = mockUploadCalls.find(
        (call) => call.folder === "portfolio/site_config/resume"
      );
      expect(resumeUploadCall).toBeDefined();
      expect(resumeUploadCall?.resource_type).toBe("auto");
      expect(resumeUploadCall?.public_id).toBe("resume_date_1");
      expect(resumeUploadCall?.access_mode).toBeUndefined();

      // Verify MongoDB was updated with resumeUrl
      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          $set: expect.objectContaining({
            resumeUrl: expect.stringContaining("portfolio/site_config/resume"),
          }),
        }),
        expect.any(Object)
      );
    });

    it("PUT /api/v1/config persists submitted resumeUrl completely unchanged without modifying extension", async () => {
      const existingConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://example.com/resume.custom-ext?query=1",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(existingConfig);
      (SiteConfig.findOneAndUpdate as jest.Mock).mockImplementation((_q, update) =>
        Promise.resolve({
          ...existingConfig,
          ...(update.$set || {}),
        })
      );

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          name: "Shibraj Das",
          jobTitles: ["Full-Stack Developer"],
          resumeUrl: "https://example.com/resume.custom-ext?query=1",
          statusMessage: "Building systems...",
          bioSummary: "Full stack engineer",
        });

      expect(res.status).toBe(200);
      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          $set: expect.objectContaining({
            resumeUrl: "https://example.com/resume.custom-ext?query=1",
          }),
        }),
        expect.any(Object)
      );
    });

    it("POST /api/v1/config/resume uploads resume PDF directly and updates configuration", async () => {
      const updatedConfig = {
        name: "Shibraj Das",
        jobTitles: ["Full-Stack Developer"],
        resumeUrl: "https://res.cloudinary.com/demo/auto/portfolio/site_config/resume/resume_date_1.pdf",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer",
      };

      (SiteConfig.findOneAndUpdate as jest.Mock).mockResolvedValue(updatedConfig);

      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("Resume PDF uploaded");
      expect(res.body.resumeUrl).toBe("https://res.cloudinary.com/demo/auto/portfolio/site_config/resume/test_file");

      expect(SiteConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: {
            resumeUrl: "https://res.cloudinary.com/demo/auto/portfolio/site_config/resume/test_file",
            resumePublicId: "portfolio/site_config/resume/resume_date_1",
          },
        },
        { new: true }
      );

      const resumeUploadCall = mockUploadCalls.find(
        (call) => call.folder === "portfolio/site_config/resume"
      );
      expect(resumeUploadCall).toBeDefined();
      expect(resumeUploadCall?.resource_type).toBe("auto");
      expect(resumeUploadCall?.public_id).toBe("resume_date_1");
      expect(resumeUploadCall?.access_mode).toBeUndefined();
    });

    it("POST /api/v1/config/resume rejects with 400 when no resume file is attached", async () => {
      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("No resume PDF file uploaded");
    });

    it("POST /api/v1/config/resume rejects with 400 when resumeUrl is in body but no file is attached", async () => {
      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .send({
          resumeUrl: "https://res.cloudinary.com/demo/raw/upload/portfolio/site_config/resume/resume_spoofed.pdf",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("No resume PDF file uploaded");
      expect(SiteConfig.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("POST /api/v1/config/resume cleans up uploaded Cloudinary asset and returns 404 when configuration does not exist", async () => {
      (SiteConfig.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Site configuration not found");
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("POST /api/v1/config/resume rejects with 400 when uploaded file buffer is not a valid PDF", async () => {
      const fakeInvalidFile = Buffer.from("Not a real PDF file content");

      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .attach("resume", fakeInvalidFile, {
          filename: "not_a_pdf.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid file content: only PDF files are allowed for resume upload");
      expect(mockUploadCalls.filter((c) => c.folder === "portfolio/site_config/resume")).toHaveLength(0);
      expect(SiteConfig.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("POST /api/v1/config cleans up uploaded resume PDF if config already exists (409)", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue({ name: "Existing Config" });
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Dev"]))
        .field("statusMessage", "Building...")
        .field("bioSummary", "Bio...")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(409);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("POST /api/v1/config cleans up uploaded resume PDF if payload validation fails (400)", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        // Missing "name" to trigger validation failure
        .field("jobTitles", JSON.stringify(["Dev"]))
        .field("statusMessage", "Building...")
        .field("bioSummary", "Bio...")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(400);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("POST /api/v1/config does NOT call mockDestroy when validation fails without an uploaded file (safety guard)", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send({
          // Missing "name" to trigger validation failure
          resumePublicId: "portfolio/site_config/resume/pre_existing_resume.pdf",
          resumeUrl: "https://example.com/resume.pdf",
          jobTitles: ["Dev"],
        });

      expect(res.status).toBe(400);
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("POST /api/v1/config cleans up uploaded resume PDF if database creation throws (500)", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
      (SiteConfig.create as jest.Mock).mockRejectedValue(new Error("Database connection dropped"));
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Dev"]))
        .field("statusMessage", "Building...")
        .field("bioSummary", "Bio...")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(500);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("PUT /api/v1/config cleans up uploaded resume PDF if payload validation fails (400)", async () => {
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        // Missing "name" to trigger validation failure
        .field("jobTitles", JSON.stringify(["Dev"]))
        .field("statusMessage", "Building...")
        .field("bioSummary", "Bio...")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(400);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("PUT /api/v1/config cleans up uploaded resume PDF if database update throws (500)", async () => {
      (SiteConfig.findOneAndUpdate as jest.Mock).mockRejectedValue(new Error("Write collision"));
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .field("name", "Shibraj Das")
        .field("jobTitles", JSON.stringify(["Dev"]))
        .field("statusMessage", "Building...")
        .field("bioSummary", "Bio...")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(500);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("POST /api/v1/config/resume cleans up uploaded resume PDF and propagates error if database update throws (500)", async () => {
      (SiteConfig.findOneAndUpdate as jest.Mock).mockRejectedValue(new Error("Mongo network error"));
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(500);
      expect(mockDestroy).toHaveBeenCalledWith(
        "portfolio/site_config/resume/resume_date_1"
      );
    });

    it("POST /api/v1/config/resume swallows destroy cleanup errors so original error is not masked", async () => {
      (SiteConfig.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      mockDestroy.mockRejectedValueOnce(new Error("Cloudinary API unavailable"));
      const fakePdf = Buffer.from("%PDF-1.4 fake pdf data");

      const res = await request(app)
        .post("/api/v1/config/resume")
        .set("x-admin-token", "test-secret-token")
        .attach("resume", fakePdf, {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain("Site configuration not found");
      expect(mockDestroy).toHaveBeenCalled();
    });
  });


  describe("Admin Log Query Routes", () => {
    it("GET /api/v1/admin/logs queries logs by date filter when authenticated", async () => {
      const mockLogs = [
        {
          timestamp: new Date("2026-10-01T10:00:00.000Z"),
          level: "INFO",
          method: "GET",
          endpoint: "/api/v1/projects",
          statusCode: 200,
        },
      ];

      (LogEntry.countDocuments as jest.Mock).mockResolvedValue(1);
      (LogEntry.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockLogs),
            }),
          }),
        }),
      });

      const res = await request(app)
        .get("/api/v1/admin/logs?date=2026-10-01")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(LogEntry.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: {
            $gte: new Date("2026-10-01T00:00:00.000Z"),
            $lte: new Date("2026-10-01T23:59:59.999Z"),
          },
        })
      );
    });

    it("GET /api/v1/admin/logs queries logs by month and level filters", async () => {
      (LogEntry.countDocuments as jest.Mock).mockResolvedValue(0);
      (LogEntry.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const res = await request(app)
        .get("/api/v1/admin/logs?month=2026-10&level=WARN")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(LogEntry.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "WARN",
        })
      );
    });
  });

  describe("Project Version Management", () => {
    it("POST /api/v1/projects/:slug/versions adds version to project", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000001",
        versions: [{ versionTag: "v1.0.0", isLatest: true }],
        save: jest.fn().mockResolvedValue(true),
      };

      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/test-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.1.0",
          changelog: ["Added 3D exploded view support"],
          isLatest: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockProject.versions[0].isLatest).toBe(false);
      expect(mockProject.versions[1].versionTag).toBe("v1.1.0");
      expect(mockProject.versions[1].isLatest).toBe(true);
      expect(mockProject.save).toHaveBeenCalled();
    });

    it("parses multipart version fields before adding a version", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000001",
        versions: [] as { versionTag: string }[],
        save: jest.fn().mockResolvedValue(true),
      };

      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/test-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .field("versionTag", "v1.2.0")
        .field("changelog", JSON.stringify(["Added multipart support"]));

      expect(res.status).toBe(201);
      expect(mockProject.versions[0].versionTag).toBe("v1.2.0");
    });

    it("stores uploaded media URLs on the new version", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000001",
        image: "https://example.com/project-image.png",
        videoDemo: "https://example.com/project-video.mp4",
        threeDModel: { fileUrl: "https://example.com/project-model.glb" },
        versions: [] as Record<string, unknown>[],
        save: jest.fn().mockResolvedValue(true),
      };

      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/versioned-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .field("versionTag", "v2.0.0")
        .field("slug", "versioned-project")
        .attach("image", Buffer.from("version image"), {
          filename: "version.png",
          contentType: "image/png",
        })
        .attach("videoDemo", Buffer.from("version video"), {
          filename: "version.mp4",
          contentType: "video/mp4",
        })
        .attach("threeDModel", Buffer.from("version model"), {
          filename: "version.glb",
          contentType: "model/gltf-binary",
        });

      const uploadedVersion = mockProject.versions[0];
      expect(res.status).toBe(201);
      expect(uploadedVersion).toEqual(
        expect.objectContaining({
          image: expect.stringContaining("/image/portfolio/projects/versioned-project/v2.0.0/images/"),
          videoDemo: expect.stringContaining("/video/portfolio/projects/versioned-project/v2.0.0/videos/"),
          threeDFileUrl: expect.stringContaining("/raw/portfolio/projects/versioned-project/v2.0.0/models/"),
        })
      );
      expect(mockProject.image).toBe("https://example.com/project-image.png");
      expect(mockProject.videoDemo).toBe("https://example.com/project-video.mp4");
      expect(mockProject.threeDModel.fileUrl).toBe("https://example.com/project-model.glb");
    });
  });
});
