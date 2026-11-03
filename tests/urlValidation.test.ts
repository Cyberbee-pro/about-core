process.env.ADMIN_SECRET = "test-secret-token";

import request from "supertest";
import { Types } from "mongoose";
import { Writable } from "stream";

// Mock Cloudinary
const mockDestroy = jest.fn().mockResolvedValue({ result: "ok" });
const mockUploadCalls: Array<{ folder: string; public_id?: string; resource_type?: string }> = [];

jest.mock("@/config/cloudinary", () => {
  const uploadCalls: Array<{ folder: string; public_id?: string; resource_type?: string }> = mockUploadCalls;
  const search = {
    expression: jest.fn(),
    max_results: jest.fn(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  search.expression.mockReturnValue(search);
  search.max_results.mockReturnValue(search);
  const uploader = {
    destroy: mockDestroy,
    upload_stream: (options: any, callback: any): Writable => {
      uploadCalls.push(options);
      const writable = new Writable({
        write(_chunk, _encoding, next) {
          next();
        },
      });
      process.nextTick(() =>
        callback(null, {
          secure_url: `https://res.cloudinary.com/demo/${options.resource_type || "image"}/${options.folder}/${options.public_id || "test_file"}`,
          public_id: options.public_id ? `${options.folder}/${options.public_id}` : "test_public_id",
        })
      );
      return writable;
    },
  };
  return { __esModule: true, default: { uploader, search, uploadCalls }, cloudinary: { uploader, search, uploadCalls } };
});

// Mock models and DB
jest.mock("@/models/Contributor");
jest.mock("@/models/Project");
jest.mock("@/models/Skill");
jest.mock("@/models/Certificate");
jest.mock("@/models/Experience");
jest.mock("@/models/SiteConfig");
jest.mock("@/models/LogEntry");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

import { Contributor } from "@/models/Contributor";
import { Project } from "@/models/Project";
import { Skill } from "@/models/Skill";
import { Certificate } from "@/models/Certificate";
import { Experience } from "@/models/Experience";
import { SiteConfig } from "@/models/SiteConfig";
import { app } from "@/server";

const INVALID_URL_PAYLOADS = [
  "javascript:alert(1)",
  "data:text/html,x",
  "ftp://example.com",
  "//example.com/x.png",
  "not a url",
];

describe("URL Validation Across All Endpoints (TDD)", () => {
  const validId = new Types.ObjectId().toString();
  const validVerId = new Types.ObjectId().toString();
  const validImgId = new Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Contributor Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Contributor URL Validation", () => {
    describe("POST /api/v1/contributors", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid profilePicUrl: '%s' with 400",
        async (badUrl) => {
          (Contributor.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/contributors")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              name: "Alice",
              profilePicUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.success).toBe(false);
          expect(res.body.message).toMatch(/profilePicUrl.*http.*https/i);
          expect(Contributor.create).not.toHaveBeenCalled();
        }
      );

      it("accepts valid https and http profilePicUrl (201)", async () => {
        (Contributor.findOne as jest.Mock).mockResolvedValue(null);
        (Contributor.create as jest.Mock).mockImplementation((data) =>
          Promise.resolve({ _id: validId, ...data })
        );

        const res1 = await request(app)
          .post("/api/v1/contributors")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            name: "Alice",
            profilePicUrl: "https://example.com/alice.png",
          });
        expect(res1.status).toBe(201);

        const res2 = await request(app)
          .post("/api/v1/contributors")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            name: "Bob",
            profilePicUrl: "http://example.com/bob.png",
          });
        expect(res2.status).toBe(201);
      });
    });

    describe("PUT /api/v1/contributors/:id", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid profilePicUrl: '%s' with 400",
        async (badUrl) => {
          (Contributor.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .put(`/api/v1/contributors/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ profilePicUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.success).toBe(false);
          expect(res.body.message).toMatch(/profilePicUrl.*http.*https/i);
          expect(Contributor.findByIdAndUpdate).not.toHaveBeenCalled();
        }
      );

      it("rejects empty string profilePicUrl with 400 (cannot be empty)", async () => {
        const res = await request(app)
          .put(`/api/v1/contributors/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ profilePicUrl: "" });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      });

      it("accepts valid https and http profilePicUrl (200)", async () => {
        (Contributor.findOne as jest.Mock).mockResolvedValue(null);
        (Contributor.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          name: "Alice",
          profilePicUrl: "https://example.com/new.png",
        });

        const res = await request(app)
          .put(`/api/v1/contributors/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ profilePicUrl: "https://example.com/new.png" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Project Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Project URL Validation", () => {
    const baseProjectPayload = {
      title: "Test Project",
      category: "web",
      description: "Project Description",
      image: "https://example.com/image.png",
    };

    describe("POST /api/v1/projects", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid image: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...baseProjectPayload, image: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/image.*http.*https/i);
          expect(Project.create).not.toHaveBeenCalled();
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid videoDemo: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...baseProjectPayload, videoDemo: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/videoDemo.*http.*https/i);
          expect(Project.create).not.toHaveBeenCalled();
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid deployedLink: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...baseProjectPayload, deployedLink: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/deployedLink.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid githubLink: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...baseProjectPayload, githubLink: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/githubLink.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid threeDModel.fileUrl: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              ...baseProjectPayload,
              threeDModel: { fileUrl: badUrl, enableExplodedView: false },
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/threeDModel.*fileUrl.*http.*https/i);
        }
      );

      it("ignores versions payload on POST /api/v1/projects and creates project with versions: []", async () => {
        (Project.findOne as jest.Mock).mockResolvedValue(null);
        (Project.create as jest.Mock).mockImplementation((data) =>
          Promise.resolve({ _id: validId, ...data })
        );

        const maliciousPayload = [
          {
            versionTag: "x",
            tags: ["INVALID TAG!"],
            contributors: ["non-existent-id"],
            gallery: [
              {
                url: "javascript:alert(1)",
                tags: ["bad-tag!"],
                caption: "x".repeat(300),
              },
            ],
          },
        ];

        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            title: "Project With Ignored Versions",
            category: "web",
            description: "A project",
            image: "https://example.com/img.png",
            versions: maliciousPayload,
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.versions).toEqual([]);
        expect(Project.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Project With Ignored Versions",
            versions: [],
          })
        );
      });

      it("ignores versions in multipart POST /api/v1/projects without rolling back valid uploads", async () => {
        (Project.findOne as jest.Mock).mockResolvedValue(null);
        (Project.create as jest.Mock).mockImplementation((data) =>
          Promise.resolve({ _id: validId, ...data })
        );

        const fakeBuffer = Buffer.from("fake-png-bytes");
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", "Bearer test-secret-token")
          .field("title", "Multipart Project With Versions")
          .field("category", "web")
          .field("description", "A project")
          .field("image", "https://example.com/img.png")
          .field(
            "versions",
            JSON.stringify([
              {
                versionTag: "x",
                gallery: [{ url: "javascript:alert(1)" }],
              },
            ])
          )
          .attach("galleryImages", fakeBuffer, {
            filename: "photo.png",
            contentType: "image/png",
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.versions).toEqual([]);
        expect(Project.create).toHaveBeenCalledWith(
          expect.objectContaining({
            versions: [],
          })
        );
        expect(mockDestroy).not.toHaveBeenCalled();
      });
    });

    describe("PUT /api/v1/projects/:id", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid image: '%s' with 400",
        async (badUrl) => {
          const res = await request(app)
            .put(`/api/v1/projects/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ image: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/image.*http.*https/i);
          expect(Project.findByIdAndUpdate).not.toHaveBeenCalled();
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid videoDemo: '%s' with 400",
        async (badUrl) => {
          const res = await request(app)
            .put(`/api/v1/projects/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ videoDemo: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/videoDemo.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid deployedLink: '%s' with 400",
        async (badUrl) => {
          const res = await request(app)
            .put(`/api/v1/projects/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ deployedLink: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/deployedLink.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid githubLink: '%s' with 400",
        async (badUrl) => {
          const res = await request(app)
            .put(`/api/v1/projects/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ githubLink: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/githubLink.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid threeDModel.fileUrl: '%s' with 400",
        async (badUrl) => {
          const res = await request(app)
            .put(`/api/v1/projects/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({
              threeDModel: { fileUrl: badUrl, enableExplodedView: false },
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/threeDModel.*fileUrl.*http.*https/i);
        }
      );

      it("clears videoDemo, deployedLink, githubLink when empty string is sent", async () => {
        (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          title: "P1",
          slug: "p1",
          category: "web",
          versions: [],
        });

        const res = await request(app)
          .put(`/api/v1/projects/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({
            videoDemo: "",
            deployedLink: "",
            githubLink: "",
          });

        expect(res.status).toBe(200);
        expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
          validId,
          expect.objectContaining({
            videoDemo: undefined,
            deployedLink: undefined,
            githubLink: undefined,
          }),
          expect.anything()
        );
      });

      it("ignores versions payload on PUT /api/v1/projects/:id (including javascript: gallery URL, bad tags and invalid contributors)", async () => {
        const existingVersions = [
          {
            _id: "60c72b2f9b1d8b2bad000088",
            versionTag: "v1.0.0",
            gallery: [],
          },
        ];
        (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          title: "Existing Project",
          slug: "existing-project",
          category: "web",
          versions: existingVersions,
        });

        const maliciousVersions = [
          {
            versionTag: "x",
            tags: ["INVALID TAG!"],
            contributors: ["non-existent-contributor-id"],
            gallery: [{ url: "javascript:alert(1)" }],
          },
        ];

        const res = await request(app)
          .put(`/api/v1/projects/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({
            title: "Updated Title",
            versions: maliciousVersions,
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
          validId,
          expect.not.objectContaining({ versions: expect.anything() }),
          expect.anything()
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Project Version Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Project Version URL Validation", () => {
    describe("POST /api/v1/projects/:slug/versions", () => {
      const mockProjDoc: any = {
        _id: validId,
        slug: "cool-project",
        versions: [],
        save: jest.fn().mockResolvedValue(true),
      };

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid image: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .post("/api/v1/projects/cool-project/versions")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              versionTag: "v1.0.0",
              image: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version image.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid videoDemo: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .post("/api/v1/projects/cool-project/versions")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              versionTag: "v1.0.0",
              videoDemo: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version videoDemo.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid demoUrl: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .post("/api/v1/projects/cool-project/versions")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              versionTag: "v1.0.0",
              demoUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version demoUrl.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid threeDFileUrl: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .post("/api/v1/projects/cool-project/versions")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              versionTag: "v1.0.0",
              threeDFileUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version threeDFileUrl.*http.*https/i);
        }
      );

      it("accepts valid https and http URLs on version creation", async () => {
        (Project.findOne as jest.Mock).mockResolvedValue({
          _id: validId,
          slug: "cool-project",
          versions: [],
          save: jest.fn().mockResolvedValue(true),
        });

        const res = await request(app)
          .post("/api/v1/projects/cool-project/versions")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            versionTag: "v1.0.0",
            image: "https://example.com/img.png",
            videoDemo: "http://example.com/vid.mp4",
            demoUrl: "https://example.com/demo",
            threeDFileUrl: "https://example.com/model.glb",
          });

        expect(res.status).toBe(201);
      });
    });

    describe("PUT /api/v1/projects/:slug/versions/:versionId", () => {
      let mockProjDoc: any;

      beforeEach(() => {
        mockProjDoc = {
          _id: validId,
          slug: "cool-project",
          versions: [
            {
              _id: new Types.ObjectId(validVerId),
              versionTag: "v1.0.0",
              image: "https://example.com/old.png",
              videoDemo: "https://example.com/old.mp4",
              demoUrl: "https://example.com/old-demo",
              threeDFileUrl: "https://example.com/old.glb",
            },
          ],
          save: jest.fn().mockResolvedValue(true),
        };
      });

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid demoUrl: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .put(`/api/v1/projects/cool-project/versions/${validVerId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ demoUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version demoUrl.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid image: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .put(`/api/v1/projects/cool-project/versions/${validVerId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ image: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version image.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid videoDemo: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .put(`/api/v1/projects/cool-project/versions/${validVerId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ videoDemo: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version videoDemo.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid threeDFileUrl: '%s' with 400",
        async (badUrl) => {
          (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);
          const res = await request(app)
            .put(`/api/v1/projects/cool-project/versions/${validVerId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ threeDFileUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/Version threeDFileUrl.*http.*https/i);
        }
      );

      it("clears demoUrl, image, videoDemo, threeDFileUrl when empty string is sent", async () => {
        (Project.findOne as jest.Mock).mockResolvedValue(mockProjDoc);

        const res = await request(app)
          .put(`/api/v1/projects/cool-project/versions/${validVerId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({
            demoUrl: "",
            image: "",
            videoDemo: "",
            threeDFileUrl: "",
          });

        expect(res.status).toBe(200);
        expect(mockProjDoc.versions[0].demoUrl).toBeUndefined();
        expect(mockProjDoc.versions[0].image).toBeUndefined();
        expect(mockProjDoc.versions[0].videoDemo).toBeUndefined();
        expect(mockProjDoc.versions[0].threeDFileUrl).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Gallery PUT String URL Validation
  // ─────────────────────────────────────────────────────────────
  describe("Gallery PUT URL Validation", () => {
    it.each(INVALID_URL_PAYLOADS)(
      "PUT /api/v1/projects/:slug/gallery/:imageId rejects invalid galleryImage: '%s' with 400",
      async (badUrl) => {
        const res = await request(app)
          .put(`/api/v1/projects/cool-project/gallery/${validImgId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ galleryImage: badUrl });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/galleryImage.*http.*https/i);
      }
    );

    it.each(INVALID_URL_PAYLOADS)(
      "PUT /api/v1/projects/:slug/versions/:versionId/gallery/:imageId rejects invalid galleryImage: '%s' with 400",
      async (badUrl) => {
        const res = await request(app)
          .put(`/api/v1/projects/cool-project/versions/${validVerId}/gallery/${validImgId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ galleryImage: badUrl });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/galleryImage.*http.*https/i);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Skill Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Skill URL Validation", () => {
    describe("POST /api/v1/skills", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid logoUrl: '%s' with 400",
        async (badUrl) => {
          (Skill.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/skills")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              name: "TypeScript",
              type: "language",
              logoUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/logoUrl.*http.*https/i);
          expect(Skill.create).not.toHaveBeenCalled();
        }
      );

      it("accepts valid https and http logoUrl and empty string (201)", async () => {
        (Skill.findOne as jest.Mock).mockResolvedValue(null);
        (Skill.create as jest.Mock).mockImplementation((data) =>
          Promise.resolve({ _id: validId, ...data })
        );

        const res1 = await request(app)
          .post("/api/v1/skills")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            name: "TypeScript",
            type: "language",
            logoUrl: "https://example.com/ts.png",
          });
        expect(res1.status).toBe(201);

        const res2 = await request(app)
          .post("/api/v1/skills")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            name: "JavaScript",
            type: "language",
            logoUrl: "",
          });
        expect(res2.status).toBe(201);
      });
    });

    describe("PUT /api/v1/skills/:id", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid logoUrl: '%s' with 400",
        async (badUrl) => {
          (Skill.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .put(`/api/v1/skills/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ logoUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/logoUrl.*http.*https/i);
        }
      );

      it("clears logoUrl when empty string is sent", async () => {
        (Skill.findOne as jest.Mock).mockResolvedValue(null);
        (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          name: "TypeScript",
          logoUrl: "",
        });

        const res = await request(app)
          .put(`/api/v1/skills/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ logoUrl: "" });

        expect(res.status).toBe(200);
        expect(Skill.findByIdAndUpdate).toHaveBeenCalledWith(
          validId,
          expect.objectContaining({ logoUrl: "" }),
          expect.anything()
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Certificate Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Certificate URL Validation", () => {
    describe("POST /api/v1/certificates", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid mediaUrl: '%s' with 400",
        async (badUrl) => {
          (Certificate.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/certificates")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              title: "AWS Certified",
              organization: "Amazon",
              description: "Cert",
              mediaUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/mediaUrl.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid link: '%s' with 400",
        async (badUrl) => {
          (Certificate.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/certificates")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              title: "AWS Certified",
              organization: "Amazon",
              description: "Cert",
              mediaUrl: "https://example.com/cert.png",
              link: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/link.*http.*https/i);
        }
      );

      it("accepts valid https and http URLs and empty mediaUrl (201)", async () => {
        (Certificate.findOne as jest.Mock).mockResolvedValue(null);
        (Certificate.create as jest.Mock).mockImplementation((data) =>
          Promise.resolve({ _id: validId, ...data })
        );

        const res = await request(app)
          .post("/api/v1/certificates")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            title: "AWS Certified",
            organization: "Amazon",
            description: "Cert",
            mediaUrl: "https://example.com/cert.png",
            link: "http://example.com/verify",
          });

        expect(res.status).toBe(201);
      });
    });

    describe("PUT /api/v1/certificates/:id", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid mediaUrl: '%s' with 400",
        async (badUrl) => {
          (Certificate.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .put(`/api/v1/certificates/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ mediaUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/mediaUrl.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid link: '%s' with 400",
        async (badUrl) => {
          (Certificate.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .put(`/api/v1/certificates/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ link: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/link.*http.*https/i);
        }
      );

      it("clears mediaUrl and link when empty string is sent", async () => {
        (Certificate.findOne as jest.Mock).mockResolvedValue(null);
        (Certificate.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          title: "Cert",
          mediaUrl: "",
        });

        const res = await request(app)
          .put(`/api/v1/certificates/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ mediaUrl: "", link: "" });

        expect(res.status).toBe(200);
        expect(Certificate.findByIdAndUpdate).toHaveBeenCalledWith(
          validId,
          expect.objectContaining({ mediaUrl: "", link: undefined }),
          expect.anything()
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Experience Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("Experience URL Validation", () => {
    describe("POST /api/v1/experiences", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid iconUrl: '%s' with 400",
        async (badUrl) => {
          (Experience.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/experiences")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              organization: "Google",
              iconUrl: badUrl,
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/iconUrl.*http.*https/i);
        }
      );

      it("rejects invalid URL in positions[].mediaUrls with 400", async () => {
        (Experience.findOne as jest.Mock).mockResolvedValue(null);
        const res = await request(app)
          .post("/api/v1/experiences")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            organization: "Google",
            iconUrl: "https://example.com/icon.png",
            positions: [
              {
                position: "Engineer",
                mediaUrls: ["javascript:alert(1)"],
              },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/mediaUrls.*http.*https/i);
      });

      it("rejects invalid URL in positions[].certificateUrls with 400", async () => {
        (Experience.findOne as jest.Mock).mockResolvedValue(null);
        const res = await request(app)
          .post("/api/v1/experiences")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            organization: "Google",
            iconUrl: "https://example.com/icon.png",
            positions: [
              {
                position: "Engineer",
                certificateUrls: ["data:text/html,x"],
              },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/certificateUrls.*http.*https/i);
      });
    });

    describe("PUT /api/v1/experiences/:id", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid iconUrl: '%s' with 400",
        async (badUrl) => {
          (Experience.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .put(`/api/v1/experiences/${validId}`)
            .set("Authorization", "Bearer test-secret-token")
            .send({ iconUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/iconUrl.*http.*https/i);
        }
      );

      it("clears iconUrl when empty string is sent", async () => {
        (Experience.findOne as jest.Mock).mockResolvedValue(null);
        (Experience.findByIdAndUpdate as jest.Mock).mockResolvedValue({
          _id: validId,
          organization: "Google",
          iconUrl: "",
        });

        const res = await request(app)
          .put(`/api/v1/experiences/${validId}`)
          .set("Authorization", "Bearer test-secret-token")
          .send({ iconUrl: "" });

        expect(res.status).toBe(200);
        expect(Experience.findByIdAndUpdate).toHaveBeenCalledWith(
          validId,
          expect.objectContaining({ iconUrl: "" }),
          expect.anything()
        );
      });
    });

    describe("POST /api/v1/experiences/:organization/positions", () => {
      it("rejects invalid mediaUrls and certificateUrls with 400", async () => {
        (Experience.findOne as jest.Mock).mockResolvedValue({
          _id: validId,
          organization: "Google",
          positions: [],
        });

        const res1 = await request(app)
          .post("/api/v1/experiences/Google/positions")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            position: "Engineer",
            mediaUrls: ["//example.com/x.png"],
          });
        expect(res1.status).toBe(400);
        expect(res1.body.message).toMatch(/mediaUrls.*http.*https/i);

        const res2 = await request(app)
          .post("/api/v1/experiences/Google/positions")
          .set("Authorization", "Bearer test-secret-token")
          .send({
            position: "Engineer",
            certificateUrls: ["not a url"],
          });
        expect(res2.status).toBe(400);
        expect(res2.body.message).toMatch(/certificateUrls.*http.*https/i);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. SiteConfig Endpoints
  // ─────────────────────────────────────────────────────────────
  describe("SiteConfig URL Validation", () => {
    const validConfigPayload = {
      name: "John Doe",
      jobTitles: ["Developer"],
      statusMessage: "Active",
      bioSummary: "Hello",
      resumeUrl: "https://example.com/resume.pdf",
    };

    describe("POST /api/v1/config", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid resumeUrl: '%s' with 400",
        async (badUrl) => {
          (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/config")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...validConfigPayload, resumeUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/resumeUrl.*http.*https/i);
        }
      );

      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid pfpUrl: '%s' with 400",
        async (badUrl) => {
          (SiteConfig.findOne as jest.Mock).mockResolvedValue(null);
          const res = await request(app)
            .post("/api/v1/config")
            .set("Authorization", "Bearer test-secret-token")
            .send({
              ...validConfigPayload,
              pfpUrl: badUrl,
              pfpPublicId: "pfp_1",
            });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/pfpUrl.*http.*https/i);
        }
      );
    });

    describe("PUT /api/v1/config", () => {
      it.each(INVALID_URL_PAYLOADS)(
        "rejects invalid resumeUrl: '%s' with 400",
        async (badUrl) => {
          (SiteConfig.findOne as jest.Mock).mockResolvedValue({
            ...validConfigPayload,
          });
          const res = await request(app)
            .put("/api/v1/config")
            .set("Authorization", "Bearer test-secret-token")
            .send({ ...validConfigPayload, resumeUrl: badUrl });

          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/resumeUrl.*http.*https/i);
        }
      );
    });
  });
});
