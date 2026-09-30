import request from "supertest";
import { LogEntry } from "../src/models/LogEntry";
import { Project } from "../src/models/Project";
import { SiteConfig } from "../src/models/SiteConfig";
import { Writable } from "stream";

// Set environment variables for tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock Mongoose models
jest.mock("../src/models/LogEntry");
jest.mock("../src/models/Project");
jest.mock("../src/models/SiteConfig");
jest.mock("../src/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

interface CloudinaryMockOptions {
  folder: string;
  resource_type: string;
  public_id?: string;
}

type CloudinaryMockCallback = (
  err: Error | null,
  result?: { secure_url: string; public_id: string }
) => void;

jest.mock("../src/config/cloudinary", () => {
  const uploadCalls: CloudinaryMockOptions[] = [];
  const search = {
    expression: jest.fn(),
    max_results: jest.fn(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  search.expression.mockReturnValue(search);
  search.max_results.mockReturnValue(search);
  const uploader = {
    upload_stream: (options: CloudinaryMockOptions, callback: CloudinaryMockCallback): Writable => {
      uploadCalls.push(options);
      const writable = new Writable({ write(_chunk, _encoding, next) { next(); } });
      process.nextTick(() => callback(null, {
        secure_url: `https://res.cloudinary.com/demo/${options.resource_type}/${options.folder}/test_file`,
        public_id: "test_public_id",
      }));
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

interface CloudinaryTestDouble {
  search: {
    expression: jest.Mock;
    max_results: jest.Mock;
    execute: jest.Mock;
  };
  uploadCalls: CloudinaryMockOptions[];
}

const mockCloudinary = jest.requireMock("../src/config/cloudinary") as {
  default: CloudinaryTestDouble;
};
const mockApiSearch = mockCloudinary.default.search;
const mockUploadCalls = mockCloudinary.default.uploadCalls;
const { app: expressApp } = require("../src/server") as typeof import("../src/server");
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

    it("GET /api/v1/health should return service details", async () => {
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(res.body.service).toBe("about-core");
      expect(res.body.version).toBe("1.0.0");
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

  describe("Site Configuration Routes", () => {
    it("GET /api/v1/config returns existing configuration", async () => {
      const mockConfig = {
        resumeDriveUrl: "https://drive.google.com/resume",
        statusMessage: "Building systems...",
        bioSummary: "Full Stack Engineer",
      };

      (SiteConfig.findOne as jest.Mock).mockResolvedValue(mockConfig);

      const res = await request(app).get("/api/v1/config");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resumeDriveUrl).toBe("https://drive.google.com/resume");
    });

    it("GET /api/v1/config generates default config when none exists", async () => {
      (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
      (SiteConfig.create as jest.Mock).mockResolvedValue({
        resumeDriveUrl: "https://drive.google.com",
        statusMessage: "Building systems...",
        bioSummary: "Full stack engineer specializing in distributed systems and 3D web applications.",
      });

      const res = await request(app).get("/api/v1/config");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(SiteConfig.create).toHaveBeenCalled();
    });

    it("PUT /api/v1/config updates configuration when authenticated", async () => {
      const updatedConfig = {
        resumeDriveUrl: "https://drive.google.com/new-resume",
        statusMessage: "Shipping features...",
        bioSummary: "Updated bio",
      };

      (SiteConfig.findOneAndUpdate as jest.Mock).mockResolvedValue(updatedConfig);

      const res = await request(app)
        .put("/api/v1/config")
        .set("x-admin-token", "test-secret-token")
        .send(updatedConfig);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statusMessage).toBe("Shipping features...");
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
    it("POST /api/v1/projects/:id/versions adds version to project", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000001",
        versions: [{ versionTag: "v1.0.0", isLatest: true }],
        save: jest.fn().mockResolvedValue(true),
      };

      (Project.findById as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/60c72b2f9b1d8b2bad000001/versions")
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

      (Project.findById as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/60c72b2f9b1d8b2bad000001/versions")
        .set("Authorization", "Bearer test-secret-token")
        .field("versionTag", "v1.2.0")
        .field("changelog", JSON.stringify(["Added multipart support"]));

      expect(res.status).toBe(201);
      expect(mockProject.versions[0].versionTag).toBe("v1.2.0");
    });
  });
});
