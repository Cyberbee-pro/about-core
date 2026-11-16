import request from "supertest";
import { Project } from "@/models/Project";
import { Types } from "mongoose";
import { Writable } from "stream";

process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

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
        secure_url: `https://res.cloudinary.com/demo/${options.resource_type}/${options.folder}/${options.public_id || "test_file"}`,
        public_id: options.public_id ? `${options.folder}/${options.public_id}` : "test_public_id",
      }));
      return writable;
    },
  };
  const cloudinary = { uploader, search, uploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

const mockCloudinary = jest.requireMock("@/config/cloudinary") as {
  default: {
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
  };
};
const mockUploadCalls = mockCloudinary.default.uploadCalls;
const mockDestroy = mockCloudinary.default.uploader.destroy;
const mockSearch = mockCloudinary.default.search;

const { app: expressApp } = require("@/server") as typeof import("@/server");
const app = expressApp.listen(0);

describe("Tagged Image Galleries API Tests", () => {
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      app.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
    mockSearch.execute.mockResolvedValue({ resources: [], total_count: 0 });
  });

  const validImgId1 = new Types.ObjectId().toString();
  const validImgId2 = new Types.ObjectId().toString();
  const validVerId1 = new Types.ObjectId().toString();
  const validProjId = new Types.ObjectId().toString();

  describe("Authentication on all gallery routes", () => {
    const routes = [
      { method: "post", path: "/api/v1/projects/my-slug/gallery" },
      { method: "put", path: "/api/v1/projects/my-slug/gallery/order" },
      { method: "put", path: `/api/v1/projects/my-slug/gallery/${validImgId1}` },
      { method: "delete", path: `/api/v1/projects/my-slug/gallery/${validImgId1}` },
      { method: "post", path: `/api/v1/projects/my-slug/versions/${validVerId1}/gallery` },
      { method: "put", path: `/api/v1/projects/my-slug/versions/${validVerId1}/gallery/order` },
      { method: "put", path: `/api/v1/projects/my-slug/versions/${validVerId1}/gallery/${validImgId1}` },
      { method: "delete", path: `/api/v1/projects/my-slug/versions/${validVerId1}/gallery/${validImgId1}` },
    ];

    for (const r of routes) {
      it(`${r.method.toUpperCase()} ${r.path} returns 401 without token`, async () => {
        const req = (request(app) as unknown as Record<string, (url: string) => request.Test>)[r.method](r.path);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      });

      it(`${r.method.toUpperCase()} ${r.path} returns 401 with wrong token`, async () => {
        const req = (request(app) as unknown as Record<string, (url: string) => request.Test>)[r.method](r.path);
        const res = await req.set("Authorization", "Bearer wrong-secret");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      });
    }
  });

  describe("Project Gallery - POST /api/v1/projects/:slug/gallery", () => {
    it("adds 3 files with aligned galleryMeta (tags and captions land on the right files)", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: [],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => {
        return Promise.resolve({
          ...mockProject,
          gallery: update.$push.gallery.$each,
        });
      });

      const meta = [
        { tags: ["frontend", "react"], caption: "UI Dashboard" },
        { tags: ["backend"], caption: "Server Rack" },
        { tags: ["mobile", "android"], caption: "Phone View" },
      ];

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .attach("galleryImages", Buffer.from("img2"), "screen2.png")
        .attach("galleryImages", Buffer.from("img3"), "screen3.png")
        .field("galleryMeta", JSON.stringify(meta));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("Gallery images added successfully");
      expect(res.body.data.gallery).toHaveLength(3);
      expect(res.body.data.gallery[0].tags).toEqual(["frontend", "react"]);
      expect(res.body.data.gallery[0].caption).toBe("UI Dashboard");
      expect(res.body.data.gallery[1].tags).toEqual(["backend"]);
      expect(res.body.data.gallery[1].caption).toBe("Server Rack");
      expect(res.body.data.gallery[2].tags).toEqual(["mobile", "android"]);
      expect(res.body.data.gallery[2].caption).toBe("Phone View");
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("defaults missing meta entries to empty tags and caption when fewer meta than files", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: [],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => {
        return Promise.resolve({
          ...mockProject,
          gallery: update.$push.gallery.$each,
        });
      });

      const meta = [{ tags: ["first"], caption: "First only" }];

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .attach("galleryImages", Buffer.from("img2"), "screen2.png")
        .field("galleryMeta", JSON.stringify(meta));

      expect(res.status).toBe(201);
      expect(res.body.data.gallery).toHaveLength(2);
      expect(res.body.data.gallery[0].tags).toEqual(["first"]);
      expect(res.body.data.gallery[0].caption).toBe("First only");
      expect(res.body.data.gallery[1].tags).toEqual([]);
      expect(res.body.data.gallery[1].caption).toBe("");
    });

    it("rejects with 400 when more galleryMeta entries than files", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const meta = [
        { tags: ["one"], caption: "1" },
        { tags: ["two"], caption: "2" },
      ];

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .field("galleryMeta", JSON.stringify(meta));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it("adds images via JSON items payload", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => {
        return Promise.resolve({
          ...mockProject,
          gallery: update.$push.gallery.$each,
        });
      });

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [
            { url: "https://example.com/pic1.jpg", tags: ["url-tag"], caption: "From URL" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.gallery).toHaveLength(1);
      expect(res.body.data.gallery[0].url).toBe("https://example.com/pic1.jpg");
      expect(res.body.data.gallery[0].tags).toEqual(["url-tag"]);
      expect(res.body.data.gallery[0].caption).toBe("From URL");
    });

    it("rejects with 400 when both files and items are sent", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .field("items", JSON.stringify([{ url: "https://example.com/pic1.jpg" }]));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it("rejects with 400 when neither files nor items are sent", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects with 400 for non-http URLs in items", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "ftp://example.com/pic.jpg", tags: [] }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects with 404 if project does not exist", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/projects/non-existent/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "https://example.com/pic.jpg" }],
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Tag Normalization & Validation", () => {
    it("normalizes case, whitespace to hyphens, and removes duplicates keeping first", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => ({
        ...mockProject,
        gallery: update.$push.gallery.$each,
      }));

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [
            {
              url: "https://example.com/pic.jpg",
              tags: ["  Web Development  ", "WEB DEVELOPMENT", "react.js", "node_js"],
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.gallery[0].tags).toEqual(["web-development", "react.js", "node_js"]);
    });

    it("parses single repeated multipart field as one-item array", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => ({
        ...mockProject,
        gallery: update.$push.gallery.$each,
      }));

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .field("galleryMeta", JSON.stringify([{ tags: "single-tag" }]));

      expect(res.status).toBe(201);
      expect(res.body.data.gallery[0].tags).toEqual(["single-tag"]);
    });

    it("parses comma-separated tag string and JSON-array tag string", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => ({
        ...mockProject,
        gallery: update.$push.gallery.$each,
      }));

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [
            { url: "https://example.com/pic1.jpg", tags: "alpha, beta, gamma" as unknown as string[] },
            { url: "https://example.com/pic2.jpg", tags: '["delta", "epsilon"]' as unknown as string[] },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.gallery[0].tags).toEqual(["alpha", "beta", "gamma"]);
      expect(res.body.data.gallery[1].tags).toEqual(["delta", "epsilon"]);
    });

    it("rejects with 400 when more than 8 tags per image", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [
            {
              url: "https://example.com/pic.jpg",
              tags: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"],
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("8");
    });

    it("rejects with 400 and names offending tag when tag has invalid characters", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "https://example.com/pic.jpg", tags: ["good-tag", "bad<tag>"] }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("bad<tag>");
    });

    it("rejects with 400 and names offending tag when normalized tag exceeds 24 characters", async () => {
      const longTag = "a".repeat(25);
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "https://example.com/pic.jpg", tags: [longTag] }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(longTag);
    });
  });

  describe("Caption Rules", () => {
    it("trims caption and rejects with 400 if longer than 200 characters", async () => {
      const tooLongCaption = "c".repeat(201);
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "https://example.com/pic.jpg", caption: tooLongCaption }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("200");
    });

    it("clears caption with empty string", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: [] };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockImplementation((_query, update) => ({
        ...mockProject,
        gallery: update.$push.gallery.$each,
      }));

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [{ url: "https://example.com/pic.jpg", caption: "   " }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.gallery[0].caption).toBe("");
    });
  });

  describe("Limits & Rollback", () => {
    it("rejects with 400 when 11 files in one request", async () => {
      const req = request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token");

      for (let i = 0; i < 11; i++) {
        req.attach("galleryImages", Buffer.from(`img${i}`), `screen${i}.png`);
      }

      const res = await req;
      expect(res.status).toBe(400);
    });

    it("rejects with 400 and rolls back when 31st item would exceed 30 limit", async () => {
      const existing = Array.from({ length: 29 }, (_, i) => ({
        _id: new Types.ObjectId(),
        url: `https://example.com/${i}.png`,
        tags: [],
        caption: "",
      }));
      const mockProject = { _id: validProjId, slug: "cool-project", gallery: existing };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      // findOneAndUpdate with $expr returns null if limit exceeded
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .attach("galleryImages", Buffer.from("img2"), "screen2.png");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("30");
      expect(mockDestroy).toHaveBeenCalledTimes(2);
    });

    it("rejects with 400 when non-image file is uploaded in gallery", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("fake-video"), "video.mp4");

      expect(res.status).toBe(400);
      expect(mockUploadCalls).toHaveLength(0);
    });

    it("mixed valid and invalid files rolls back uploaded assets and saves nothing", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .attach("galleryImages", Buffer.from("glb-data"), "model.glb");

      expect(res.status).toBe(400);
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe("PUT /api/v1/projects/:slug/gallery/:imageId", () => {
    it("updates tags only, caption only, or both", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: [{ _id: validImgId1, url: "https://example.com/pic.png", tags: ["old"], caption: "Old" }],
      };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...mockProject,
        gallery: [{ _id: validImgId1, url: "https://example.com/pic.png", tags: ["new-tag"], caption: "New Caption" }],
      });

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          tags: ["new-tag"],
          caption: "New Caption",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        { slug: "cool-project", "gallery._id": expect.any(Types.ObjectId) },
        { $set: { "gallery.$.tags": ["new-tag"], "gallery.$.caption": "New Caption" } },
        { new: true, runValidators: true }
      );
    });

    it("clears tags with empty array and clears caption with empty string", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project" };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          tags: [],
          caption: "",
        });

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { "gallery.$.tags": [], "gallery.$.caption": "" } },
        expect.any(Object)
      );
    });

    it("leaves omitted fields unchanged", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project" };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ caption: "Only Caption" });

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { "gallery.$.caption": "Only Caption" } },
        expect.any(Object)
      );
    });

    it("replaces the file with new URL keeping the old Cloudinary asset", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project" };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImage", Buffer.from("new-img"), "new.png");

      expect(res.status).toBe(200);
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(mockUploadCalls).toHaveLength(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/projects/cool-project/gallery");
    });

    it("PUT /api/v1/projects/:slug/gallery/:imageId rolls back replacement image when caption exceeds 200 chars (400)", async () => {
      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .field("caption", "A".repeat(201))
        .attach("galleryImage", Buffer.from("replacement-img"), "replace.png");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("200 characters");
      expect(mockDestroy).toHaveBeenCalledWith(
        expect.stringContaining("portfolio/projects/cool-project/gallery/"),
        { resource_type: "image" }
      );
    });

    it("rejects with 400 for invalid imageId ObjectId", async () => {
      const res = await request(app)
        .put("/api/v1/projects/cool-project/gallery/not-a-valid-id")
        .set("Authorization", "Bearer test-secret-token")
        .send({ caption: "test" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid identifier format");
    });

    it("returns 404 when image is not found in project", async () => {
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (Project.findOne as jest.Mock).mockResolvedValue({ _id: validProjId, slug: "cool-project", gallery: [] });

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ caption: "test" });

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/v1/projects/:slug/gallery/order", () => {
    it("reorders gallery according to valid permutation of IDs", async () => {
      const existing = [
        { _id: new Types.ObjectId(validImgId1), url: "img1" },
        { _id: new Types.ObjectId(validImgId2), url: "img2" },
      ];
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: [...existing],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...mockProject,
        gallery: [existing[1], existing[0]],
      });

      const res = await request(app)
        .put("/api/v1/projects/cool-project/gallery/order")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          order: [validImgId2, validImgId1],
        });

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "cool-project" }),
        expect.objectContaining({ $set: { gallery: [existing[1], existing[0]] } }),
        expect.anything()
      );
    });

    it("rejects with 400 when missing an existing ID", async () => {
      const existing = [
        { _id: new Types.ObjectId(validImgId1), url: "img1" },
        { _id: new Types.ObjectId(validImgId2), url: "img2" },
      ];
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: existing,
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put("/api/v1/projects/cool-project/gallery/order")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          order: [validImgId1],
        });

      expect(res.status).toBe(400);
    });

    it("rejects with 400 when extra ID is provided", async () => {
      const existing = [{ _id: new Types.ObjectId(validImgId1), url: "img1" }];
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: existing,
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put("/api/v1/projects/cool-project/gallery/order")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          order: [validImgId1, validImgId2],
        });

      expect(res.status).toBe(400);
    });

    it("rejects with 400 when duplicate ID is provided in order", async () => {
      const existing = [
        { _id: new Types.ObjectId(validImgId1), url: "img1" },
        { _id: new Types.ObjectId(validImgId2), url: "img2" },
      ];
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: existing,
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put("/api/v1/projects/cool-project/gallery/order")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          order: [validImgId1, validImgId1],
        });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/v1/projects/:slug/gallery/:imageId", () => {
    it("removes only that item and does not destroy Cloudinary asset", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        gallery: [{ _id: validImgId2, url: "img2" }],
      };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .delete(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        { slug: "cool-project", "gallery._id": expect.any(Types.ObjectId) },
        { $pull: { gallery: { _id: expect.any(Types.ObjectId) } } },
        { new: true }
      );
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid imageId", async () => {
      const res = await request(app)
        .delete("/api/v1/projects/cool-project/gallery/invalid-id")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(400);
    });

    it("returns 404 when item not found", async () => {
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (Project.findOne as jest.Mock).mockResolvedValue({ _id: validProjId, slug: "cool-project", gallery: [] });

      const res = await request(app)
        .delete(`/api/v1/projects/cool-project/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(404);
    });
  });

  describe("Version Gallery Endpoints", () => {
    it("POST version gallery uploads to portfolio/projects/<slug>/<tag>/gallery", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", gallery: [] }],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("img1"), "screen1.png")
        .field("galleryMeta", JSON.stringify([{ tags: ["ver-tag"], caption: "Ver cap" }]));

      expect(res.status).toBe(201);
      expect(mockUploadCalls).toHaveLength(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/projects/cool-project/v1.0.0/gallery");
      expect(mockUploadCalls[0].public_id).toMatch(/^cool-project_\d+_[a-z0-9]+$/);
    });

    it("returns 400 for invalid versionId format", async () => {
      const res = await request(app)
        .post("/api/v1/projects/cool-project/versions/invalid-vid/gallery")
        .set("Authorization", "Bearer test-secret-token")
        .send({ items: [{ url: "https://example.com/pic.jpg" }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid identifier format");
    });

    it("returns 404 when versionId is unknown", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue({
        _id: validProjId,
        slug: "cool-project",
        versions: [],
      });

      const res = await request(app)
        .post(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ items: [{ url: "https://example.com/pic.jpg" }] });

      expect(res.status).toBe(404);
    });

    it("POST version gallery rolls back uploaded images with resource_type image on validation failure (400)", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", gallery: [] }],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImages", Buffer.from("v-img-1"), "screen1.png")
        .field(
          "galleryMeta",
          JSON.stringify([
            { tags: ["valid-tag"] },
            { tags: ["extra-entry"] },
          ])
        );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("galleryMeta contains more entries than uploaded files");
      expect(mockDestroy).toHaveBeenCalledWith(
        expect.stringContaining("portfolio/projects/cool-project/v1.0.0/gallery/"),
        { resource_type: "image" }
      );
    });

    it("PUT version gallery image updates item in version subdocument", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project" };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ caption: "Updated Version Image" });

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        {
          slug: "cool-project",
          versions: {
            $elemMatch: {
              _id: new Types.ObjectId(validVerId1),
              "gallery._id": new Types.ObjectId(validImgId1),
            },
          },
        },
        { $set: { "versions.$[v].gallery.$[g].caption": "Updated Version Image" } },
        expect.objectContaining({
          arrayFilters: [
            { "v._id": expect.any(Types.ObjectId) },
            { "g._id": expect.any(Types.ObjectId) },
          ],
          new: true,
        })
      );
    });

    it("PUT version gallery image replaces file and destroys nothing on success", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v1.0.0",
            gallery: [{ _id: new Types.ObjectId(validImgId1), url: "old-url", tags: [], caption: "" }],
          },
        ],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("galleryImage", Buffer.from("new-v-img"), "new.png");

      expect(res.status).toBe(200);
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(mockUploadCalls).toHaveLength(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/projects/cool-project/v1.0.0/gallery");
    });

    it("PUT version gallery image rolls back replacement file on validation error (400)", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v1.0.0",
            gallery: [{ _id: new Types.ObjectId(validImgId1), url: "old-url", tags: [], caption: "" }],
          },
        ],
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .field("caption", "A".repeat(201))
        .attach("galleryImage", Buffer.from("replacement-v-img"), "replace.png");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("200 characters");
      expect(mockDestroy).toHaveBeenCalledWith(
        expect.stringContaining("portfolio/projects/cool-project/v1.0.0/gallery/"),
        { resource_type: "image" }
      );
    });

    it("PUT version gallery order reorders version gallery array", async () => {
      const existing = [
        { _id: new Types.ObjectId(validImgId1), url: "img1" },
        { _id: new Types.ObjectId(validImgId2), url: "img2" },
      ];
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", gallery: existing }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...mockProject,
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", gallery: [existing[1], existing[0]] }],
      });

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery/order`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ order: [validImgId2, validImgId1] });

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "cool-project" }),
        expect.anything(),
        expect.anything()
      );
    });

    it("DELETE version gallery image removes item from version gallery", async () => {
      const mockProject = { _id: validProjId, slug: "cool-project" };
      (Project.findOneAndUpdate as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .delete(`/api/v1/projects/cool-project/versions/${validVerId1}/gallery/${validImgId1}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(Project.findOneAndUpdate).toHaveBeenCalledWith(
        {
          slug: "cool-project",
          versions: {
            $elemMatch: {
              _id: new Types.ObjectId(validVerId1),
              "gallery._id": new Types.ObjectId(validImgId1),
            },
          },
        },
        { $pull: { "versions.$[v].gallery": { _id: expect.any(Types.ObjectId) } } },
        expect.objectContaining({
          arrayFilters: [{ "v._id": expect.any(Types.ObjectId) }],
          new: true,
        })
      );
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("renaming version later does not move existing gallery assets", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v1.0.0",
            gallery: [{ _id: validImgId1, url: "https://res.cloudinary.com/.../v1.0.0/gallery/cool-project_1" }],
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ versionTag: "v1.0.1" });

      expect(res.status).toBe(200);
      expect(mockProject.versions[0].versionTag).toBe("v1.0.1");
      expect(mockProject.versions[0].gallery[0].url).toContain("v1.0.0");
      expect(mockDestroy).not.toHaveBeenCalled();
    });
  });

  describe("Creation-Time Uploads", () => {
    it("POST /api/v1/projects accepts galleryImages + galleryMeta in multipart", async () => {
      (Project.create as jest.Mock).mockImplementation((data) => Promise.resolve({ _id: validProjId, ...data }));

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "New Project")
        .field("category", "backend")
        .field("description", "A brand new project")
        .field("image", "https://example.com/banner.png")
        .attach("galleryImages", Buffer.from("g1"), "gal1.png")
        .attach("galleryImages", Buffer.from("g2"), "gal2.png")
        .field("galleryMeta", JSON.stringify([{ tags: ["launch"], caption: "Launch Day" }]));

      expect(res.status).toBe(201);
      expect(Project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gallery: expect.arrayContaining([
            expect.objectContaining({ tags: ["launch"], caption: "Launch Day" }),
            expect.objectContaining({ tags: [], caption: "" }),
          ]),
        })
      );
    });

    it("POST /api/v1/projects/:slug/versions accepts galleryImages + galleryMeta in multipart", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/cool-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .field("versionTag", "v2.0.0")
        .attach("galleryImages", Buffer.from("g1"), "vgal1.png")
        .field("galleryMeta", JSON.stringify([{ tags: ["v2-feat"], caption: "V2 Demo" }]));

      expect(res.status).toBe(201);
      expect(mockProject.versions[0].gallery).toHaveLength(1);
      expect((mockProject.versions[0].gallery as Array<Record<string, unknown>>)[0].caption).toBe("V2 Demo");
    });
  });

  describe("PUT Safety & Gallery Preservation", () => {
    it("PUT /api/v1/projects/:id with gallery field leaves gallery unchanged", async () => {
      const updatedProject = { _id: validProjId, title: "Updated" };
      (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedProject);

      const res = await request(app)
        .put(`/api/v1/projects/${validProjId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Updated",
          gallery: [{ url: "https://attacker.com/malicious.png" }],
        });

      expect(res.status).toBe(200);
      expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
        validProjId,
        expect.not.objectContaining({ gallery: expect.anything() }),
        expect.any(Object)
      );
    });

    it("PUT /api/v1/projects/:slug/versions/:versionId leaves version gallery unchanged", async () => {
      const mockProject = {
        _id: validProjId,
        slug: "cool-project",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", gallery: [{ url: "safe.png" }] }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/cool-project/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          demoUrl: "https://demo.com",
          gallery: [{ url: "https://attacker.com/malicious.png" }],
        });

      expect(res.status).toBe(200);
      expect(mockProject.versions[0].gallery).toEqual([{ url: "safe.png" }]);
    });
  });

  describe("Responses Guarantee: gallery: [] on old documents", () => {
    it("GET /api/v1/projects ensures gallery: [] on project and every version", async () => {
      const oldProject = {
        _id: validProjId,
        title: "Old Project",
        slug: "old-project",
        category: "web",
        versions: [{ _id: validVerId1, versionTag: "v1.0.0" }],
      };
      (Project.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([oldProject]),
        }),
      });

      const res = await request(app).get("/api/v1/projects");
      expect(res.status).toBe(200);
      expect(res.body.data[0].gallery).toEqual([]);
      expect(res.body.data[0].versions[0].gallery).toEqual([]);
    });

    it("GET /api/v1/projects/:slug ensures gallery: [] on project and every version", async () => {
      const oldProject = {
        _id: validProjId,
        title: "Old Project",
        slug: "old-project",
        status: "active",
        versions: [{ _id: validVerId1, versionTag: "v1.0.0" }],
      };
      (Project.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(oldProject),
      });

      const res = await request(app).get("/api/v1/projects/old-project");
      expect(res.status).toBe(200);
      expect(res.body.data.gallery).toEqual([]);
      expect(res.body.data.versions[0].gallery).toEqual([]);
    });

    it("GET /api/v1/admin/projects ensures gallery: [] on project and every version", async () => {
      const oldProject = {
        _id: validProjId,
        title: "Old Project",
        slug: "old-project",
        versions: [{ _id: validVerId1, versionTag: "v1.0.0" }],
      };
      (Project.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([oldProject]),
        }),
      });

      const res = await request(app)
        .get("/api/v1/admin/projects")
        .set("Authorization", "Bearer test-secret-token");
      expect(res.status).toBe(200);
      expect(res.body.data[0].gallery).toEqual([]);
      expect(res.body.data[0].versions[0].gallery).toEqual([]);
    });
  });
});
