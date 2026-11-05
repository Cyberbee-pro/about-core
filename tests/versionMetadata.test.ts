import request from "supertest";
import { Project } from "@/models/Project";
import { Person } from "@/models/Person";
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

jest.mock("@/models/Person", () => {
  const actual = jest.requireActual("@/models/Person");
  return {
    ...actual,
    Person: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      modelName: "Person",
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

    (Person.find as jest.Mock).mockImplementation((query?: Record<string, unknown>) => {
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

    (Person.findById as jest.Mock).mockImplementation((id: string) => {
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
    it("flattens populated contributors and hostedBy on project and versions, dropping dangling refs", async () => {
      const projectDoc = {
        _id: "proj-1",
        title: "Test",
        slug: "test-proj",
        host: "people",
        hostedBy: [
          {
            _id: new Types.ObjectId(validContrId1),
            name: "Alice",
            profilePicUrl: "https://example.com/alice.png",
            profileLink: "https://alice.dev",
          },
          null, // Dangling reference
        ],
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
            host: "people",
            hostedBy: [
              {
                _id: new Types.ObjectId(validContrId2),
                name: "Bob",
                profilePicUrl: "https://example.com/bob.png",
                profileLink: "",
              },
            ],
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
          {
            _id: new Types.ObjectId("60c72b2f9b1d8b2bad000011"),
            versionTag: "v2.0.0",
            status: "planning",
            contributors: [],
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

      // Project level hostedBy flattened
      expect(res.body.data.host).toBe("people");
      expect(res.body.data.hostedBy).toEqual([
        {
          _id: validContrId1,
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
        },
      ]);

      // Version 1 overrides host to people with hostedBy
      expect(res.body.data.versions[0].host).toBe("people");
      expect(res.body.data.versions[0].hostedBy).toEqual([
        {
          _id: validContrId2,
          name: "Bob",
          profilePicUrl: "https://example.com/bob.png",
          profileLink: null,
        },
      ]);
      expect(res.body.data.versions[0].effectiveHost).toBe("people");
      expect(res.body.data.versions[0].effectiveHostedBy).toEqual([
        {
          _id: validContrId2,
          name: "Bob",
          profilePicUrl: "https://example.com/bob.png",
          profileLink: null,
        },
      ]);

      // Version 2 inherits host and hostedBy from project
      expect(res.body.data.versions[1].host).toBeNull();
      expect(res.body.data.versions[1].hostedBy).toEqual([]);
      expect(res.body.data.versions[1].effectiveHost).toBe("people");
      expect(res.body.data.versions[1].effectiveHostedBy).toEqual([
        {
          _id: validContrId1,
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
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

  describe("Part C: Project Host and hostedBy (POST and PUT)", () => {
    it("POST /api/v1/projects defaults host to 'self' and hostedBy to [] when omitted", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);
      (Project.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ _id: "60c72b2f9b1d8b2bad000099", ...data })
      );

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Self Hosted Project",
          category: "web",
          description: "A description",
          image: "https://example.com/app.png",
        });

      expect(res.status).toBe(201);
      expect(Project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "self",
          hostedBy: [],
        })
      );
    });

    it("POST /api/v1/projects accepts host: 'people' with valid hostedBy array", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);
      (Project.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ _id: "60c72b2f9b1d8b2bad000099", ...data })
      );

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "People Hosted Project",
          category: "web",
          description: "A description",
          image: "https://example.com/app.png",
          host: "people",
          hostedBy: [validContrId1, validContrId2],
        });

      expect(res.status).toBe(201);
      expect(Project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "people",
          hostedBy: [new Types.ObjectId(validContrId1), new Types.ObjectId(validContrId2)],
        })
      );
    });

    it("POST /api/v1/projects rejects host: 'people' with empty or missing hostedBy with 400", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);

      const res1 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "People No Host 1",
          category: "web",
          description: "A description",
          image: "https://example.com/app.png",
          host: "people",
          hostedBy: [],
        });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/hostedBy/i);

      const res2 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "People No Host 2",
          category: "web",
          description: "A description",
          image: "https://example.com/app.png",
          host: "people",
        });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/hostedBy/i);
    });

    it("POST /api/v1/projects rejects host: 'self' with non-empty hostedBy with 400", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Self With Host",
          category: "web",
          description: "A description",
          image: "https://example.com/app.png",
          host: "self",
          hostedBy: [validContrId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/hostedBy.*self/i);
    });

    it("PUT /api/v1/projects/:id switches stored 'people' to 'self' and clears hostedBy automatically", async () => {
      (Project.findById as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "Existing Project",
        host: "people",
        hostedBy: [new Types.ObjectId(validContrId1)],
        versions: [],
      });
      (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "Existing Project",
        host: "self",
        hostedBy: [],
        versions: [],
      });

      const res = await request(app)
        .put("/api/v1/projects/60c72b2f9b1d8b2bad000099")
        .set("Authorization", "Bearer test-secret-token")
        .send({ host: "self" });

      expect(res.status).toBe(200);
      expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
        "60c72b2f9b1d8b2bad000099",
        expect.objectContaining({
          host: "self",
          hostedBy: [],
        }),
        expect.anything()
      );
    });

    it("PUT /api/v1/projects/:id rejects non-empty hostedBy when stored host is 'self' and no host sent (400)", async () => {
      (Project.findById as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "Existing Project",
        host: "self",
        hostedBy: [],
        versions: [],
      });

      const res = await request(app)
        .put("/api/v1/projects/60c72b2f9b1d8b2bad000099")
        .set("Authorization", "Bearer test-secret-token")
        .send({ hostedBy: [validContrId1] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/set host to people/i);
    });

    it("PUT /api/v1/projects/:id rejects host: 'self' with non-empty hostedBy (400)", async () => {
      (Project.findById as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "Existing Project",
        host: "people",
        hostedBy: [new Types.ObjectId(validContrId1)],
        versions: [],
      });

      const res = await request(app)
        .put("/api/v1/projects/60c72b2f9b1d8b2bad000099")
        .set("Authorization", "Bearer test-secret-token")
        .send({ host: "self", hostedBy: [validContrId1] });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/hostedBy.*self/i);
    });

    it("rejects unknown, invalid, or duplicate Person IDs in hostedBy with 400", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);

      // Unknown id
      const unknownId = "60c72b2f9b1d8b2bad000099";
      const res1 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Unknown Host",
          category: "web",
          description: "Desc",
          image: "https://example.com/app.png",
          host: "people",
          hostedBy: [unknownId],
        });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toContain(unknownId);

      // Invalid format
      const res2 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Invalid ID",
          category: "web",
          description: "Desc",
          image: "https://example.com/app.png",
          host: "people",
          hostedBy: ["invalid-id"],
        });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/invalid.*id/i);

      // Duplicate ids
      const res3 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Duplicate IDs",
          category: "web",
          description: "Desc",
          image: "https://example.com/app.png",
          host: "people",
          hostedBy: [validContrId1, validContrId1],
        });
      expect(res3.status).toBe(400);
      expect(res3.body.message).toMatch(/duplicate/i);
    });

    it("parses hostedBy in multipart as JSON array, repeated fields, or comma-separated string", async () => {
      (Project.findOne as jest.Mock).mockResolvedValue(null);
      (Project.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ _id: "60c72b2f9b1d8b2bad000099", ...data })
      );

      // JSON array string
      const res1 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Multipart JSON Array")
        .field("category", "web")
        .field("description", "Desc")
        .field("image", "https://example.com/app.png")
        .field("host", "people")
        .field("hostedBy", JSON.stringify([validContrId1, validContrId2]));
      expect(res1.status).toBe(201);

      // Repeated field
      const res2 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Multipart Repeated")
        .field("category", "web")
        .field("description", "Desc")
        .field("image", "https://example.com/app.png")
        .field("host", "people")
        .field("hostedBy", validContrId1)
        .field("hostedBy", validContrId2);
      expect(res2.status).toBe(201);

      // Comma separated string
      const res3 = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Multipart Comma")
        .field("category", "web")
        .field("description", "Desc")
        .field("image", "https://example.com/app.png")
        .field("host", "people")
        .field("hostedBy", `${validContrId1},${validContrId2}`);
      expect(res3.status).toBe(201);
    });

    it("partial PUT leaves host and hostedBy unchanged", async () => {
      (Project.findById as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "Old Title",
        host: "people",
        hostedBy: [new Types.ObjectId(validContrId1)],
        versions: [],
      });
      (Project.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        _id: "60c72b2f9b1d8b2bad000099",
        title: "New Title",
        host: "people",
        hostedBy: [new Types.ObjectId(validContrId1)],
        versions: [],
      });

      const res = await request(app)
        .put("/api/v1/projects/60c72b2f9b1d8b2bad000099")
        .set("Authorization", "Bearer test-secret-token")
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      const updateArg = (Project.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
      expect(updateArg).not.toHaveProperty("host");
      expect(updateArg).not.toHaveProperty("hostedBy");
    });
  });

  describe("Part D: Version Host Override and Inheritance", () => {
    it("version inherits host and hostedBy by default (stored host undefined, effective values match project)", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "host-project",
        host: "people",
        hostedBy: [
          {
            _id: new Types.ObjectId(validContrId1),
            name: "Alice",
            profilePicUrl: "https://example.com/alice.png",
            profileLink: "https://alice.dev",
          },
        ],
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/host-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({ versionTag: "v1.0.0" });

      expect(res.status).toBe(201);
      const vStored = mockProject.versions[0];
      expect(vStored.host).toBeUndefined();
      expect(vStored.hostedBy).toBeUndefined();

      const vResp = res.body.data.versions[0];
      expect(vResp.host).toBeNull();
      expect(vResp.hostedBy).toEqual([]);
      expect(vResp.effectiveHost).toBe("people");
      expect(vResp.effectiveHostedBy).toHaveLength(1);
      expect(vResp.effectiveHostedBy[0]._id).toBe(validContrId1);
    });

    it("version can override host to 'people' with hostedBy", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "host-project",
        host: "self",
        hostedBy: [],
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/host-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.0.0",
          host: "people",
          hostedBy: [validContrId2],
        });

      expect(res.status).toBe(201);
      const vStored = mockProject.versions[0];
      expect(vStored.host).toBe("people");
      expect(vStored.hostedBy).toEqual([new Types.ObjectId(validContrId2)]);

      const vResp = res.body.data.versions[0];
      expect(vResp.host).toBe("people");
      expect(vResp.effectiveHost).toBe("people");
    });

    it("version can override host to 'self' with empty hostedBy", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "host-project",
        host: "people",
        hostedBy: [
          {
            _id: new Types.ObjectId(validContrId1),
            name: "Alice",
            profilePicUrl: "https://example.com/alice.png",
            profileLink: "https://alice.dev",
          },
        ],
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/host-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.0.0",
          host: "self",
        });

      expect(res.status).toBe(201);
      const vStored = mockProject.versions[0];
      expect(vStored.host).toBe("self");

      const vResp = res.body.data.versions[0];
      expect(vResp.host).toBe("self");
      expect(vResp.hostedBy).toEqual([]);
      expect(vResp.effectiveHost).toBe("self");
      expect(vResp.effectiveHostedBy).toEqual([]);
    });

    it("rejects version hostedBy without host with 400", async () => {
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "host-project",
        versions: [] as Array<Record<string, unknown>>,
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post("/api/v1/projects/host-project/versions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          versionTag: "v1.0.0",
          hostedBy: [validContrId1],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/hostedBy.*without.*host/i);
    });

    it("PUT /api/v1/projects/:slug/versions/:versionId clears host override with empty string or null", async () => {
      const existingVer = {
        _id: new Types.ObjectId(validVerId1),
        versionTag: "v1.0.0",
        host: "people",
        hostedBy: [new Types.ObjectId(validContrId1)],
      };
      const mockProject = {
        _id: "60c72b2f9b1d8b2bad000099",
        slug: "host-project",
        host: "self",
        hostedBy: [],
        versions: [existingVer],
        save: jest.fn().mockResolvedValue(true),
      };
      (Project.findOne as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .put(`/api/v1/projects/host-project/versions/${validVerId1}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ host: "" });

      expect(res.status).toBe(200);
      expect(existingVer.host).toBeUndefined();
      expect(existingVer.hostedBy).toBeUndefined();
      expect(res.body.data.versions[0].host).toBeNull();
      expect(res.body.data.versions[0].effectiveHost).toBe("self");
    });
  });

  describe("Part E: Query Filters (?host= and ?forked=)", () => {
    it("GET /api/v1/projects?host=self includes projects matching host: self or missing host", async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Project.find as jest.Mock).mockImplementation(mockFind);

      const res = await request(app).get("/api/v1/projects?host=self");
      expect(res.status).toBe(200);
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ host: "self" }, { host: { $exists: false } }, { host: null }],
        })
      );
    });

    it("GET /api/v1/projects?host=people filters by host: 'people'", async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Project.find as jest.Mock).mockImplementation(mockFind);

      const res = await request(app).get("/api/v1/projects?host=people");
      expect(res.status).toBe(200);
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "people",
        })
      );
    });

    it("GET /api/v1/projects?host=invalid returns 400", async () => {
      const res = await request(app).get("/api/v1/projects?host=invalid");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/host.*self.*people/i);
    });

    it("GET /api/v1/projects?forked=true filters by non-null forkedFrom", async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Project.find as jest.Mock).mockImplementation(mockFind);

      const res = await request(app).get("/api/v1/projects?forked=true");
      expect(res.status).toBe(200);
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          forkedFrom: { $ne: null, $exists: true, $nin: ["", null] },
        })
      );
    });

    it("GET /api/v1/projects?forked=false filters by null/missing forkedFrom", async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Project.find as jest.Mock).mockImplementation(mockFind);

      const res = await request(app).get("/api/v1/projects?forked=false");
      expect(res.status).toBe(200);
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ forkedFrom: null }, { forkedFrom: { $exists: false } }, { forkedFrom: "" }],
        })
      );
    });

    it("GET /api/v1/projects?forked=invalid returns 400", async () => {
      const res = await request(app).get("/api/v1/projects?forked=invalid");
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/forked.*true.*false/i);
    });

    it("GET /api/v1/admin/projects supports ?host= and ?forked= filters", async () => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Project.find as jest.Mock).mockImplementation(mockFind);

      const res1 = await request(app)
        .get("/api/v1/admin/projects?host=people&forked=true")
        .set("Authorization", "Bearer test-secret-token");
      expect(res1.status).toBe(200);
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "people",
          forkedFrom: { $ne: null, $exists: true, $nin: ["", null] },
        })
      );

      const res2 = await request(app)
        .get("/api/v1/admin/projects?host=invalid")
        .set("Authorization", "Bearer test-secret-token");
      expect(res2.status).toBe(400);
    });
  });
});
