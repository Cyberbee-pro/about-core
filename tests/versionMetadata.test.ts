import request from "supertest";
import { Project } from "@/models/Project";
import { Contributor } from "@/models/Contributor";
import { Types } from "mongoose";

process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

jest.mock("@/config/cloudinary", () => {
  const search = {
    expression: jest.fn().mockReturnThis(),
    max_results: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  const uploader = {
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
    upload_stream: jest.fn(),
  };
  return { __esModule: true, default: { uploader, search }, cloudinary: { uploader, search } };
});

jest.mock("@/models/Contributor", () => {
  const actual = jest.requireActual("@/models/Contributor");
  return {
    ...actual,
    Contributor: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
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

describe("Version Metadata & Shared Contributors Integration Tests", () => {
  const validContrId1 = "60c72b2f9b1d8b2bad000001";
  const validContrId2 = "60c72b2f9b1d8b2bad000002";
  const validVerId1 = "60c72b2f9b1d8b2bad000010";

  beforeEach(() => {
    jest.clearAllMocks();

    (Contributor.find as jest.Mock).mockImplementation((query?: Record<string, unknown>) => {
      const ids: unknown[] = (query?._id as { $in?: unknown[] })?.$in || [];
      const idStrs = ids.map(String);
      const results = [];
      if (idStrs.includes(validContrId1)) {
        results.push({
          _id: new Types.ObjectId(validContrId1),
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
        });
      }
      if (idStrs.includes(validContrId2)) {
        results.push({
          _id: new Types.ObjectId(validContrId2),
          name: "Bob",
          profilePicUrl: "https://example.com/bob.png",
          profileLink: null,
        });
      }
      return Promise.resolve(results);
    });

    (Contributor.findById as jest.Mock).mockImplementation((id: string) => {
      if (String(id) === validContrId1) {
        return Promise.resolve({
          _id: new Types.ObjectId(validContrId1),
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
        });
      }
      if (String(id) === validContrId2) {
        return Promise.resolve({
          _id: new Types.ObjectId(validContrId2),
          name: "Bob",
          profilePicUrl: "https://example.com/bob.png",
          profileLink: null,
        });
      }
      return Promise.resolve(null);
    });
  });

  describe("Part A: Version Metadata Fields (POST and PUT)", () => {
    it("POST /api/v1/projects/:slug/versions sets status: planning by default and leaves other fields unset", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/super-app/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.0.0",
        });

      expect(res.status).toBe(201);
      expect(mockProject.versions).toHaveLength(1);
      const createdVer = mockProject.versions[0];
      // In stored document, status is planning, and others are unset (no auto startDate)
      expect(createdVer.status).toBe("planning");
      expect(createdVer.startDate).toBeUndefined();
      expect(createdVer.endDate).toBeUndefined();
      expect(createdVer.deployedLink).toBeUndefined();
      expect(createdVer.githubLink).toBeUndefined();

      // In response format, null / [] are guaranteed
      expect(res.body.data.versions[0].status).toBe("planning");
      expect(res.body.data.versions[0].startDate).toBeNull();
      expect(res.body.data.versions[0].endDate).toBeNull();
      expect(res.body.data.versions[0].deployedLink).toBeNull();
      expect(res.body.data.versions[0].githubLink).toBeNull();
      expect(res.body.data.versions[0].contributors).toEqual([]);
      expect(res.body.data.versions[0].socialLinks).toEqual([]);
    });

    it("POST /api/v1/projects/:slug/versions accepts all 7 new metadata fields", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/super-app/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.0.0",
          status: "active",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-06-01T00:00:00.000Z",
          deployedLink: "https://app.dev",
          githubLink: "https://github.com/app",
          contributors: [{ contributor: validContrId1, role: "Lead Dev" }],
          socialLinks: [{ platform: "Twitter", url: "https://twitter.com/app" }],
        });

      expect(res.status).toBe(201);
      const v = mockProject.versions[0];
      expect(v.status).toBe("active");
      expect(v.startDate).toEqual(new Date("2026-01-01T00:00:00.000Z"));
      expect(v.endDate).toEqual(new Date("2026-06-01T00:00:00.000Z"));
      expect(v.deployedLink).toBe("https://app.dev");
      expect(v.githubLink).toBe("https://github.com/app");
      expect(v.contributors).toEqual([{ contributor: new Types.ObjectId(validContrId1), role: "Lead Dev" }]);
      expect(v.socialLinks).toEqual([{ platform: "Twitter", url: "https://twitter.com/app" }]);
    });

    it("PUT /api/v1/projects/:slug/versions/:versionId updates individual metadata fields and clears with empty string/array", async () => {
      const existingVersion = {
        _id: new Types.ObjectId(validVerId1),
        versionTag: "v1.0.0",
        status: "planning",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-06-01T00:00:00.000Z"),
        deployedLink: "https://old.dev",
        githubLink: "https://github.com/old",
        contributors: [{ contributor: new Types.ObjectId(validContrId1), role: "old" }],
        socialLinks: [{ platform: "Web", url: "https://web.dev" }],
      };
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [existingVersion],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          status: "active",
          startDate: "",
          endDate: "",
          deployedLink: "",
          githubLink: "",
          contributors: [],
          socialLinks: [],
        });

      expect(res.status).toBe(200);
      expect(existingVersion.status).toBe("active");
      expect(existingVersion.startDate).toBeUndefined();
      expect(existingVersion.endDate).toBeUndefined();
      expect(existingVersion.deployedLink).toBeUndefined();
      expect(existingVersion.githubLink).toBeUndefined();
      expect(existingVersion.contributors).toEqual([]);
      expect(existingVersion.socialLinks).toEqual([]);
    });

    it("PUT /api/v1/projects/:slug/versions/:versionId rejects status: '' with 400", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0", status: "active" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ status: "" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("status");
    });

    it("rejects invalid status value with 400", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ status: "not-a-valid-status" });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("status");
    });

    it("rejects endDate before startDate with 400", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          startDate: "2026-06-01T00:00:00.000Z",
          endDate: "2026-01-01T00:00:00.000Z",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/endDate.*startDate/i);
    });

    it("rejects endDate before stored startDate when only endDate is sent", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v1.0.0",
            startDate: new Date("2026-06-01T00:00:00.000Z"),
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          endDate: "2026-01-01T00:00:00.000Z",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/endDate.*startDate/i);
    });

    it("rejects non-http/https deployedLink, githubLink, and socialLink URLs with 400", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res1 = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ deployedLink: "ftp://files.example.com" });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ githubLink: "javascript:alert(1)" });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ socialLinks: [{ platform: "Web", url: "bad-url" }] });
      expect(res3.status).toBe(400);
    });
  });

  describe("Part B: Writing Contributors on Projects and Versions", () => {
    it("accepts bare ID strings and objects with role", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: [validContrId1, { contributor: validContrId2, role: "  UI Designer  " }],
        });

      expect(res.status).toBe(200);
      const v = mockProject.versions[0] as unknown as { contributors: Array<{ contributor: Types.ObjectId; role?: string }> };
      expect(v.contributors).toHaveLength(2);
      expect(v.contributors[0].contributor.toString()).toBe(validContrId1);
      expect(v.contributors[0].role).toBeUndefined();
      expect(v.contributors[1].contributor.toString()).toBe(validContrId2);
      expect(v.contributors[1].role).toBe("UI Designer");
    });

    it("returns 400 when duplicate contributor appears in the same list", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: [validContrId1, { contributor: validContrId1, role: "Tester" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/duplicate contributor/i);
    });

    it("returns 400 naming the unknown contributor id when not found in DB", async () => {
      const unknownId = "60c72b2f9b1d8b2bad000099";
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: [{ contributor: unknownId }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(unknownId);
    });

    it("returns 400 for invalid ObjectId contributor format", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: ["not-a-valid-object-id"],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid.*contributor/i);
    });

    it("returns 400 with clear explanation when old embedded format is sent", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: [{ name: "Alice", profilePicUrl: "https://example.com/pic.png" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/contributor.*must reference/i);
    });

    it("returns 400 when role exceeds 40 characters", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "super-app",
        versions: [{ _id: new Types.ObjectId(validVerId1), versionTag: "v1.0.0" }],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/super-app/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          contributors: [{ contributor: validContrId1, role: "A".repeat(41) }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("40 characters");
    });
  });

  describe("Response Formatting & Flattened Shape", () => {
    it("flattens populated contributors on project and versions, dropping dangling refs", async () => {
      const projectDoc = {
        _id: "proj-1",
        title: "Test",
        slug: "test-proj",
        contributors: [
          {
            contributor: {
              _id: new Types.ObjectId(validContrId1),
              name: "Alice",
              profilePicUrl: "https://example.com/alice.png",
              profileLink: "https://alice.dev",
            },
            role: "Lead Architect",
          },
          {
            contributor: null, // Dangling reference
            role: "Ghost",
          },
        ],
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v1.0.0",
            status: "active",
            contributors: [
              {
                contributor: {
                  _id: new Types.ObjectId(validContrId2),
                  name: "Bob",
                  profilePicUrl: "https://example.com/bob.png",
                  profileLink: "",
                },
                role: "",
              },
            ],
          },
        ],
      };

      (Project.findOne as jest.Mock).mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(projectDoc),
      });

      const res = await request(app).get("/api/v1/projects/test-proj");
      expect(res.status).toBe(200);

      // Project level contributor flattened
      expect(res.body.data.contributors).toEqual([
        {
          _id: validContrId1,
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
          role: "Lead Architect",
        },
      ]);

      // Version level contributor flattened, with empty profileLink and role returning null
      expect(res.body.data.versions[0].contributors).toEqual([
        {
          _id: validContrId2,
          name: "Bob",
          profilePicUrl: "https://example.com/bob.png",
          profileLink: null,
          role: null,
        },
      ]);
    });
  });

  describe("Legacy Safety", () => {
    it("handles legacy project with embedded contributors and old versions safely", async () => {
      const legacyProject = {
        _id: "proj-legacy",
        title: "Legacy",
        slug: "legacy-proj",
        contributors: [
          { name: "Old Alice", profilePicUrl: "https://example.com/old.png" },
        ],
        versions: [
          {
            _id: new Types.ObjectId(validVerId1),
            versionTag: "v0.9.0",
            // missing status, startDate, endDate, etc.
            contributors: [{ name: "Old Bob", profilePicUrl: "https://example.com/old-bob.png" }],
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      (Project.findOne as jest.Mock).mockResolvedValue(legacyProject);

      // Should be able to add a new version without validation errors
      const res = await request(app)
        .post("/api/v1/projects/legacy-proj/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({ versionTag: "v1.0.0" });

      expect(res.status).toBe(201);
      expect(legacyProject.save).toHaveBeenCalled();

      // Legacy version in response does not crash, returns nulls and omits legacy contributors
      const v09 = res.body.data.versions.find((v: { versionTag: string }) => v.versionTag === "v0.9.0");
      expect(v09.status).toBeNull();
      expect(v09.startDate).toBeNull();
      expect(v09.endDate).toBeNull();
      expect(v09.contributors).toEqual([]); // Legacy contributor omitted from response

      // Project level legacy contributor also omitted from response
      expect(res.body.data.contributors).toEqual([]);
    });
  });
});
