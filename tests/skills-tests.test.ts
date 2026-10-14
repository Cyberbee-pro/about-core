import request from "supertest";
import { Skill } from "@/models/Skill";
import { Writable } from "stream";

// Set env for admin auth in tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

interface CloudinaryMockOptions {
  folder: string;
  resource_type: string;
  public_id?: string;
}

type CloudinaryMockCallback = (
  err: Error | null,
  result?: { secure_url: string; public_id: string }
) => void;

const mockUploadCalls: CloudinaryMockOptions[] = [];

jest.mock("@/config/cloudinary", () => {
  const search = {
    expression: jest.fn().mockReturnThis(),
    max_results: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  const uploader = {
    upload_stream: (
      options: CloudinaryMockOptions,
      callback: CloudinaryMockCallback
    ): Writable => {
      mockUploadCalls.push(options);
      const writable = new Writable({
        write(_chunk, _encoding, next) {
          next();
        },
      });
      process.nextTick(() =>
        callback(null, {
          secure_url: `https://res.cloudinary.com/demo/${options.resource_type}/${options.folder}/${options.public_id || "file"}`,
          public_id: options.public_id || "test_id",
        })
      );
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls: mockUploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

// Mock models and DB
jest.mock("@/models/Skill");
jest.mock("@/models/LogEntry");
jest.mock("@/models/Project");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("@/server");

describe("Skills API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    (Skill.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        { _id: "skill-1", name: "TypeScript", logoUrl: "", featured: false, weight: 0 },
      ]),
    });
    (Skill.findById as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.create as jest.Mock).mockResolvedValue({
      _id: "skill-2",
      name: "React",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "Updated",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
  });

  it("GET /api/v1/skills returns all skills", async () => {
    const res = await request(app).get("/api/v1/skills");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/v1/skills/:id returns a single skill", async () => {
    const res = await request(app).get("/api/v1/skills/skill-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("TypeScript");
  });

  it("POST /api/v1/skills creates a skill (admin protected)", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "React", logoUrl: "", featured: false, weight: 0 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("React");
  });

  it("POST /api/v1/skills handles multipart logoUrl image upload to Cloudinary", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ _id: "skill-3", ...data })
    );

    const fakeImageBuffer = Buffer.from("fake-logo-content");
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .field("name", "React Native")
      .field("featured", "true")
      .field("weight", "5")
      .attach("logoUrl", fakeImageBuffer, {
        filename: "react-native.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("React Native");

    const uploadCall = mockUploadCalls.find(
      (c) => c.folder === "portfolio/skills/react-native"
    );
    expect(uploadCall).toBeDefined();
    expect(uploadCall?.public_id).toBe("react-native");
    expect(uploadCall?.resource_type).toBe("image");
  });

  it("POST /api/v1/skills with duplicate name returns 409", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue({ name: "React" });
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "React", logoUrl: "", featured: false, weight: 0 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");
  });

  it("PUT /api/v1/skills/:id updates a skill (admin protected)", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "Updated",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    const res = await request(app)
      .put("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Updated");
  });

  it("DELETE /api/v1/skills/:id deletes a skill (admin protected)", async () => {
    const res = await request(app)
      .delete("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("TypeScript");
  });
});