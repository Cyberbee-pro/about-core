import request from "supertest";
import { Contributor } from "@/models/Contributor";
import { Project } from "@/models/Project";
import { Writable } from "stream";

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
          public_id: options.public_id || "test_id",
        })
      );
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls: mockUploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

jest.mock("@/models/Contributor", () => {
  const actual = jest.requireActual("@/models/Contributor");
  return {
    ...actual,
    Contributor: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      modelName: "Contributor",
    },
  };
});

jest.mock("@/models/Project", () => {
  const actual = jest.requireActual("@/models/Project");
  return {
    ...actual,
    Project: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      modelName: "Project",
    },
  };
});

jest.mock("@/models/LogEntry");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { app } = require("@/server");

describe("Contributors API Integration Tests", () => {
  const validId = "60c72b2f9b1d8b2bad000001";
  const validId2 = "60c72b2f9b1d8b2bad000002";

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    mockDestroy.mockClear();

    (Contributor.find as jest.Mock).mockImplementation(() => ({
      collation: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([
        { _id: validId, name: "Alice", profilePicUrl: "https://example.com/alice.png", profileLink: "https://alice.dev" },
        { _id: validId2, name: "bob", profilePicUrl: "https://example.com/bob.png", profileLink: null },
      ]),
    }));

    (Contributor.findById as jest.Mock).mockResolvedValue({
      _id: validId,
      name: "Alice",
      profilePicUrl: "https://example.com/alice.png",
      profileLink: "https://alice.dev",
    });

    (Contributor.findOne as jest.Mock).mockResolvedValue(null);

    (Contributor.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({
        _id: validId,
        ...data,
      })
    );

    (Contributor.findByIdAndUpdate as jest.Mock).mockImplementation((_id, data) =>
      Promise.resolve({
        _id: validId,
        name: "Alice Updated",
        profilePicUrl: "https://example.com/alice.png",
        ...data,
      })
    );

    (Contributor.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: validId,
      name: "Alice",
    });

    (Project.find as jest.Mock).mockResolvedValue([]);
  });

  describe("Authentication on Protected Contributor Endpoints", () => {
    it("POST /api/v1/contributors rejects unauthorized request without token", async () => {
      const res = await request(app).post("/api/v1/contributors").send({ name: "Alice" });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("POST /api/v1/contributors rejects unauthorized request with wrong secret", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer wrong-secret")
        .send({ name: "Alice" });
      expect(res.status).toBe(401);
    });

    it("PUT /api/v1/contributors/:id rejects unauthorized request without token", async () => {
      const res = await request(app).put(`/api/v1/contributors/${validId}`).send({ name: "Alice" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/v1/contributors/:id rejects unauthorized request without token", async () => {
      const res = await request(app).delete(`/api/v1/contributors/${validId}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Public Reads & Sorting", () => {
    it("GET /api/v1/contributors returns list sorted case-insensitively by name", async () => {
      const res = await request(app).get("/api/v1/contributors");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data[0].name).toBe("Alice");
      expect(res.body.data[1].name).toBe("bob");
    });

    it("GET /api/v1/contributors/:id returns single contributor", async () => {
      const res = await request(app).get(`/api/v1/contributors/${validId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(validId);
      expect(res.body.data.name).toBe("Alice");
    });

    it("GET /api/v1/contributors/:id returns 404 for unknown id", async () => {
      (Contributor.findById as jest.Mock).mockResolvedValue(null);
      const res = await request(app).get(`/api/v1/contributors/${validId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/contributors/:id returns 400 for invalid ObjectId", async () => {
      const res = await request(app).get("/api/v1/contributors/invalid-id");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid identifier format");
    });
  });

  describe("Create Contributor (POST /api/v1/contributors)", () => {
    it("creates contributor with URL string in profilePicUrl and optional profileLink", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "  Charlie Brown  ",
          profilePicUrl: "https://example.com/charlie.png",
          profileLink: "https://github.com/charlie",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Contributor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Charlie Brown",
          profilePicUrl: "https://example.com/charlie.png",
          profileLink: "https://github.com/charlie",
        })
      );
    });

    it("creates contributor with uploaded picture file", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "Diana Prince")
        .attach("profilePicUrl", Buffer.from("fake-png-content"), "diana.png");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockUploadCalls.length).toBe(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/contributors/diana-prince");
      expect(mockUploadCalls[0].resource_type).toBe("image");
      expect(Contributor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Diana Prince",
          profilePicUrl: expect.stringContaining("portfolio/contributors/diana-prince"),
        })
      );
    });

    it("returns 400 when name is missing or whitespace only", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "   ",
          profilePicUrl: "https://example.com/pic.png",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("name is required");
    });

    it("returns 400 when no picture or URL is supplied", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "Eve",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("picture");
    });

    it("returns 400 when profileLink is not a valid http/https URL", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "Frank",
          profilePicUrl: "https://example.com/pic.png",
          profileLink: "not-a-valid-url",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("profileLink");
    });

    it("returns 409 when name is duplicate (case-insensitive)", async () => {
      (Contributor.findOne as jest.Mock).mockResolvedValue({
        _id: validId,
        name: "Alice",
      });

      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "alice",
          profilePicUrl: "https://example.com/alice2.png",
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("unique");
    });

    it("returns 400 with rollback when non-image file is uploaded", async () => {
      const res = await request(app)
        .post("/api/v1/contributors")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "George")
        .attach("profilePicUrl", Buffer.from("not-an-image"), "george.txt");

      expect(res.status).toBe(400);
      expect(Contributor.create).not.toHaveBeenCalled();
    });
  });

  describe("Update Contributor (PUT /api/v1/contributors/:id)", () => {
    it("updates name and validates uniqueness excluding self", async () => {
      (Contributor.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Alice Smith" });

      expect(res.status).toBe(200);
      expect(Contributor.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({ name: "Alice Smith" }),
        expect.anything()
      );
    });

    it("returns 409 if new name collides with another contributor", async () => {
      (Contributor.findOne as jest.Mock).mockResolvedValue({
        _id: validId2,
        name: "Bob",
      });

      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Bob" });

      expect(res.status).toBe(409);
      expect(Contributor.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("clears profileLink when empty string is sent", async () => {
      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ profileLink: "" });

      expect(res.status).toBe(200);
      expect(Contributor.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({ profileLink: undefined }),
        expect.anything()
      );
    });

    it("returns 400 if updated profileLink is invalid", async () => {
      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ profileLink: "ftp://invalid-url" });

      expect(res.status).toBe(400);
      expect(Contributor.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("replaces picture with uploaded file and keeps old Cloudinary asset", async () => {
      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("profilePicUrl", Buffer.from("new-pic-bytes"), "new-alice.png");

      expect(res.status).toBe(200);
      expect(mockUploadCalls.length).toBe(1);
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(Contributor.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({
          profilePicUrl: expect.stringContaining("portfolio/contributors/"),
        }),
        expect.anything()
      );
    });

    it("returns 404 for unknown contributor id", async () => {
      (Contributor.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });

    it("returns 400 for bad ObjectId format", async () => {
      const res = await request(app)
        .put("/api/v1/contributors/bad-id")
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Ghost" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid identifier format");
    });
  });

  describe("Delete Contributor in Use (DELETE /api/v1/contributors/:id)", () => {
    it("returns 409 with project count when referenced by a project", async () => {
      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-1",
          slug: "cool-project",
          contributors: [{ contributor: validId }],
          versions: [],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/referenced by 1 project\(s\) and 0 version\(s\)/i);
      expect(Contributor.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("returns 409 with version count when referenced only by a project version", async () => {
      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-2",
          slug: "nested-version-project",
          contributors: [],
          versions: [
            {
              versionTag: "v1.0.0",
              contributors: [{ contributor: validId }],
            },
          ],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/referenced by 0 project\(s\) and 1 version\(s\)/i);
      expect(Contributor.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("deletes contributor successfully when not referenced by any project or version", async () => {
      (Project.find as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .delete(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Contributor.findByIdAndDelete).toHaveBeenCalledWith(validId);
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("returns 404 when contributor to delete does not exist", async () => {
      (Project.find as jest.Mock).mockResolvedValue([]);
      (Contributor.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/contributors/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ObjectId on DELETE", async () => {
      const res = await request(app)
        .delete("/api/v1/contributors/invalid-id")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid identifier format");
    });
  });
});
