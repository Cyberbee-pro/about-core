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
const mockDestroy = jest.fn().mockResolvedValue({ result: "ok" });

jest.mock("@/config/cloudinary", () => {
  const search = {
    expression: jest.fn().mockReturnThis(),
    max_results: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  const uploader = {
    destroy: mockDestroy,
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
          public_id: options.folder
            ? `${options.folder}/${options.public_id || "file"}`
            : options.public_id || "test_id",
        })
      );
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls: mockUploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

const mockCloudinary = jest.requireMock("@/config/cloudinary");
const mockSearch = mockCloudinary.default.search;

// Mock models and DB
jest.mock("@/models/Skill", () => {
  const actual = jest.requireActual("@/models/Skill");
  return {
    ...actual,
    Skill: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      modelName: "Skill",
    },
  };
});
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
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
    mockSearch.execute.mockResolvedValue({ resources: [], total_count: 0 });
    (Skill.find as jest.Mock).mockImplementation((filter?: Record<string, unknown>) => ({
      sort: jest.fn().mockResolvedValue([
        { _id: "skill-1", name: "TypeScript", type: filter?.type || "language", logoUrl: "", featured: false, weight: 0 },
      ]),
    }));
    (Skill.findById as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      type: "language",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({
        _id: "skill-2",
        name: "React",
        type: "tool",
        logoUrl: "",
        featured: false,
        weight: 0,
        ...data,
      })
    );
    (Skill.findByIdAndUpdate as jest.Mock).mockImplementation((id, data) =>
      Promise.resolve({
        _id: id,
        name: "Updated",
        type: "tool",
        logoUrl: "",
        featured: false,
        weight: 0,
        ...data,
      })
    );
    (Skill.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      type: "language",
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

  it("GET /api/v1/skills?type=language filters skills by type", async () => {
    const res = await request(app).get("/api/v1/skills?type=language");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Skill.find).toHaveBeenCalledWith({ type: "language" });
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
    expect(res.body.data.type).toBe("tool");
  });

  it("POST /api/v1/skills creates a skill with explicit type", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "Go", type: "language", logoUrl: "", featured: true, weight: 5 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Go");
    expect(res.body.data.type).toBe("language");
    expect(Skill.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Go", type: "language" })
    );
  });

  it("POST /api/v1/skills rejects invalid type with 400", async () => {
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "InvalidSkill", type: "invalid_type", logoUrl: "" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid skill type");
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
    expect(uploadCall?.public_id).toBe("react-native_1");
    expect(uploadCall?.resource_type).toBe("image");
  });

  it("POST /api/v1/skills with colliding slugs ('C' and 'C++') gives distinct ids", async () => {
    const mockCloudinary = jest.requireMock("@/config/cloudinary") as {
      default: { search: { execute: jest.Mock } };
    };
    mockCloudinary.default.search.execute.mockResolvedValueOnce({
      resources: [],
      total_count: 0,
    });

    const res1 = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .field("name", "C")
      .field("type", "language")
      .attach("logoUrl", Buffer.from("c-logo"), {
        filename: "c.png",
        contentType: "image/png",
      });

    expect(res1.status).toBe(201);
    expect(mockUploadCalls[0].folder).toBe("portfolio/skills/c");
    expect(mockUploadCalls[0].public_id).toBe("c_1");

    mockCloudinary.default.search.execute.mockResolvedValueOnce({
      resources: [
        {
          public_id: "portfolio/skills/c/c_1",
          folder: "portfolio/skills/c",
          resource_type: "image",
        },
      ],
      total_count: 1,
    });

    const res2 = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .field("name", "C++")
      .field("type", "language")
      .attach("logoUrl", Buffer.from("cpp-logo"), {
        filename: "cpp.png",
        contentType: "image/png",
      });

    expect(res2.status).toBe(201);
    expect(mockUploadCalls[1].folder).toBe("portfolio/skills/c");
    expect(mockUploadCalls[1].public_id).toBe("c_2");
    expect(mockUploadCalls[0].public_id).not.toBe(mockUploadCalls[1].public_id);
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

  it("a duplicate-name POST /skills with a file returns 409, destroys only that request's new upload, and leaves existing logo untouched", async () => {
    const existingSkill = {
      _id: "skill-react",
      name: "React",
      logoUrl: "https://res.cloudinary.com/demo/image/upload/portfolio/skills/react/react_1.png",
    };
    (Skill.findOne as jest.Mock).mockResolvedValue(existingSkill);

    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .field("name", "React")
      .field("type", "framework")
      .attach("logoUrl", Buffer.from("new-react-logo"), {
        filename: "react.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");

    // The failing request uploaded react_1 (or react_n), which must be destroyed
    expect(mockDestroy).toHaveBeenCalledWith(
      expect.stringMatching(/portfolio\/skills\/react\//),
      { resource_type: "image" }
    );
    // The existing logo in DB was NOT passed to destroy
    expect(mockDestroy).not.toHaveBeenCalledWith(
      "portfolio/skills/react/react_1.png",
      expect.anything()
    );
  });

  it("PUT /api/v1/skills/:id without a name for two skills gives two distinct ids", async () => {
    const id1 = "60c72b2f9b1d8b2bad000001";
    const id2 = "60c72b2f9b1d8b2bad000002";

    (Skill.findById as jest.Mock).mockImplementation((id) => {
      if (id === id1) return Promise.resolve({ _id: id1, name: "React" });
      if (id === id2) return Promise.resolve({ _id: id2, name: "Vue" });
      return Promise.resolve(null);
    });
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: id1 });

    await request(app)
      .put(`/api/v1/skills/${id1}`)
      .set("Authorization", "Bearer test-secret-token")
      .attach("logoUrl", Buffer.from("react-logo"), "react.png");

    await request(app)
      .put(`/api/v1/skills/${id2}`)
      .set("Authorization", "Bearer test-secret-token")
      .attach("logoUrl", Buffer.from("vue-logo"), "vue.png");

    expect(mockUploadCalls.length).toBe(2);
    expect(mockUploadCalls[0].folder).toBe("portfolio/skills/react");
    expect(mockUploadCalls[0].public_id).toBe("react_1");
    expect(mockUploadCalls[1].folder).toBe("portfolio/skills/vue");
    expect(mockUploadCalls[1].public_id).toBe("vue_1");
    expect(mockUploadCalls[0].public_id).not.toBe(mockUploadCalls[1].public_id);
  });

  it("a replaced picture on PUT /skills/:id keeps the old asset", async () => {
    (Skill.findById as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "React",
      logoUrl: "https://res.cloudinary.com/demo/image/upload/portfolio/skills/react/react_1.png",
    });
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "React",
      logoUrl: "https://res.cloudinary.com/demo/image/upload/portfolio/skills/react/react_2.png",
    });

    const res = await request(app)
      .put("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token")
      .attach("logoUrl", Buffer.from("new-logo"), "new.png");

    expect(res.status).toBe(200);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("PUT /api/v1/skills/:id updates a skill (admin protected)", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "Updated",
      type: "framework",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    const res = await request(app)
      .put("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "Updated", type: "framework" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Updated");
    expect(Skill.findByIdAndUpdate).toHaveBeenCalledWith(
      "skill-1",
      expect.objectContaining({ name: "Updated", type: "framework" }),
      expect.any(Object)
    );
  });

  it("PUT /api/v1/skills/:id rejects invalid type with 400", async () => {
    const res = await request(app)
      .put("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ type: "invalid_type" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid skill type");
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