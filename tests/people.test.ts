import request from "supertest";
import { Types } from "mongoose";
import { Person } from "@/models/Person";
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

jest.mock("@/models/Person", () => {
  const actual = jest.requireActual("@/models/Person");
  return {
    ...actual,
    Person: {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
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

describe("People API Integration Tests", () => {
  const validId = "60c72b2f9b1d8b2bad000001";
  const validId2 = "60c72b2f9b1d8b2bad000002";

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    mockDestroy.mockClear();
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
    mockSearch.execute.mockResolvedValue({ resources: [], total_count: 0 });

    (Person.find as jest.Mock).mockImplementation(() => ({
      collation: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([
        { _id: validId, name: "Alice", profilePicUrl: "https://example.com/alice.png", profileLink: "https://alice.dev" },
        { _id: validId2, name: "bob", profilePicUrl: "https://example.com/bob.png", profileLink: null },
      ]),
    }));

    (Person.findById as jest.Mock).mockImplementation((id: string) => {
      if (id === validId) {
        return Promise.resolve({
          _id: validId,
          name: "Alice",
          profilePicUrl: "https://example.com/alice.png",
          profileLink: "https://alice.dev",
        });
      }
      return Promise.resolve(null);
    });

    (Person.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ _id: validId, ...data })
    );

    (Person.findByIdAndUpdate as jest.Mock).mockImplementation((id, update) =>
      Promise.resolve({ _id: id, ...update })
    );

    (Person.findByIdAndDelete as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({ _id: id, name: "Alice" })
    );

    (Project.find as jest.Mock).mockResolvedValue([]);
  });

  describe("Old /api/v1/contributors route removed", () => {
    it("returns 404 when accessing /api/v1/contributors", async () => {
      const res = await request(app).get("/api/v1/contributors");
      expect(res.status).toBe(404);
    });
  });

  describe("Authentication on Protected People Endpoints", () => {
    it("POST /api/v1/people rejects unauthorized request without token", async () => {
      const res = await request(app).post("/api/v1/people").send({ name: "Alice" });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("POST /api/v1/people rejects unauthorized request with wrong secret", async () => {
      const res = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer wrong-secret")
        .send({ name: "Alice" });
      expect(res.status).toBe(401);
    });

    it("PUT /api/v1/people/:id rejects unauthorized request without token", async () => {
      const res = await request(app).put(`/api/v1/people/${validId}`).send({ name: "Alice" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/v1/people/:id rejects unauthorized request without token", async () => {
      const res = await request(app).delete(`/api/v1/people/${validId}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Public Reads & Sorting", () => {
    it("GET /api/v1/people returns list sorted case-insensitively by name", async () => {
      const res = await request(app).get("/api/v1/people");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data[0].name).toBe("Alice");
      expect(res.body.data[1].name).toBe("bob");
    });

    it("GET /api/v1/people/:id returns single person", async () => {
      const res = await request(app).get(`/api/v1/people/${validId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(validId);
      expect(res.body.data.name).toBe("Alice");
    });

    it("GET /api/v1/people/:id returns 404 for unknown id", async () => {
      (Person.findById as jest.Mock).mockResolvedValue(null);
      const res = await request(app).get(`/api/v1/people/${validId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/people/:id returns 400 for invalid ObjectId", async () => {
      const res = await request(app).get("/api/v1/people/invalid-id");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid identifier format");
    });
  });

  describe("Create Person (POST /api/v1/people)", () => {
    it("creates person with URL string in profilePicUrl and optional profileLink", async () => {
      const res = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "  Charlie Brown  ",
          profilePicUrl: "https://example.com/charlie.png",
          profileLink: "https://github.com/charlie",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Charlie Brown",
          profilePicUrl: "https://example.com/charlie.png",
          profileLink: "https://github.com/charlie",
        })
      );
    });

    it("creates person with uploaded picture file", async () => {
      const res = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "Diana Prince")
        .attach("profilePicUrl", Buffer.from("fake-png-content"), "diana.png");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockUploadCalls.length).toBe(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/people/diana-prince");
      expect(mockUploadCalls[0].resource_type).toBe("image");
      expect(Person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Diana Prince",
          profilePicUrl: expect.stringContaining("portfolio/people/diana-prince"),
        })
      );
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("POST /api/v1/people rolls back uploaded picture when name is duplicate (409)", async () => {
      (Person.findOne as jest.Mock).mockResolvedValue({
        _id: validId,
        name: "Alice",
      });

      const res = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "alice")
        .attach("profilePicUrl", Buffer.from("fake-pic"), "alice.png");

      expect(res.status).toBe(409);
      expect(mockDestroy).toHaveBeenCalledWith(
        expect.stringContaining("portfolio/people/alice/"),
        { resource_type: "image" }
      );
    });

    it("returns 400 when name is missing or whitespace only", async () => {
      const res = await request(app)
        .post("/api/v1/people")
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
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          name: "Eve",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("picture");
    });

    it("returns 400 when profileLink is not a valid http/https URL", async () => {
      const res = await request(app)
        .post("/api/v1/people")
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
      (Person.findOne as jest.Mock).mockResolvedValue({
        _id: validId,
        name: "Alice",
      });

      const res = await request(app)
        .post("/api/v1/people")
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
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "George")
        .attach("profilePicUrl", Buffer.from("not-an-image"), "george.txt");

      expect(res.status).toBe(400);
      expect(Person.create).not.toHaveBeenCalled();
    });
  });

  describe("Update Person (PUT /api/v1/people/:id)", () => {
    it("updates name and validates uniqueness excluding self", async () => {
      (Person.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Alice Smith" });

      expect(res.status).toBe(200);
      expect(Person.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({ name: "Alice Smith" }),
        expect.anything()
      );
    });

    it("returns 409 if new name collides with another person", async () => {
      (Person.findOne as jest.Mock).mockResolvedValue({
        _id: validId2,
        name: "Bob",
      });

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Bob" });

      expect(res.status).toBe(409);
      expect(Person.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("PUT /api/v1/people/:id rolls back uploaded picture when name collides with another person (409)", async () => {
      (Person.findOne as jest.Mock).mockResolvedValue({
        _id: validId2,
        name: "Bob",
      });

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "Bob")
        .attach("profilePicUrl", Buffer.from("fake-pic"), "bob.png");

      expect(res.status).toBe(409);
      expect(mockDestroy).toHaveBeenCalledWith(
        expect.stringContaining("portfolio/people/bob/"),
        { resource_type: "image" }
      );
    });

    it("clears profileLink to null when empty string is sent", async () => {
      (Person.findByIdAndUpdate as jest.Mock).mockImplementation((id: string, update: Record<string, unknown>) =>
        Promise.resolve({
          _id: id,
          name: "Alice",
          profilePicUrl: "https://example.com/pic.jpg",
          ...update,
        })
      );

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ profileLink: "" });

      expect(res.status).toBe(200);
      expect(Person.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({ profileLink: null }),
        expect.anything()
      );
      expect(res.body.data.profileLink).toBeNull();
    });

    it("returns 400 if updated profileLink is invalid", async () => {
      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ profileLink: "ftp://invalid-url" });

      expect(res.status).toBe(400);
      expect(Person.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("replaces picture with uploaded file, uses stored name when name omitted, and keeps old Cloudinary asset", async () => {
      (Person.findById as jest.Mock).mockResolvedValue({
        _id: validId,
        name: "Alice",
        profilePicUrl: "https://example.com/old-alice.png",
      });

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("profilePicUrl", Buffer.from("new-pic-bytes"), "new-alice.png");

      expect(res.status).toBe(200);
      expect(mockUploadCalls.length).toBe(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/people/alice");
      expect(mockUploadCalls[0].public_id).toMatch(/^alice_\d+_[a-z0-9]+$/);
      expect(mockDestroy).not.toHaveBeenCalled();
      expect(Person.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        expect.objectContaining({
          profilePicUrl: expect.stringMatching(/portfolio\/people\/alice\/alice_\d+_[a-z0-9]+/),
        }),
        expect.anything()
      );
    });


    it("PUT without a name for two people gives two distinct ids", async () => {
      const id1 = "60c72b2f9b1d8b2bad000001";
      const id2 = "60c72b2f9b1d8b2bad000002";

      (Person.findById as jest.Mock).mockImplementation((id: string) => {
        if (id === id1) return Promise.resolve({ _id: id1, name: "Alice" });
        if (id === id2) return Promise.resolve({ _id: id2, name: "Bob" });
        return Promise.resolve(null);
      });
      (Person.findOne as jest.Mock).mockResolvedValue(null);
      (Person.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: id1 });

      await request(app)
        .put(`/api/v1/people/${id1}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("profilePicUrl", Buffer.from("alice-pic"), "alice.png");

      await request(app)
        .put(`/api/v1/people/${id2}`)
        .set("Authorization", "Bearer test-secret-token")
        .attach("profilePicUrl", Buffer.from("bob-pic"), "bob.png");

      expect(mockUploadCalls.length).toBe(2);
      expect(mockUploadCalls[0].folder).toBe("portfolio/people/alice");
      expect(mockUploadCalls[0].public_id).toMatch(/^alice_\d+_[a-z0-9]+$/);
      expect(mockUploadCalls[1].folder).toBe("portfolio/people/bob");
      expect(mockUploadCalls[1].public_id).toMatch(/^bob_\d+_[a-z0-9]+$/);
      expect(mockUploadCalls[0].public_id).not.toBe(mockUploadCalls[1].public_id);
    });

    it("colliding slugs ('Ada.Lovelace' and 'Ada Lovelace') give distinct ids", async () => {
      (Person.findOne as jest.Mock).mockResolvedValue(null);

      const res1 = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "Ada.Lovelace")
        .attach("profilePicUrl", Buffer.from("ada-1-pic"), "ada.png");

      expect(res1.status).toBe(201);
      expect(mockUploadCalls[0].folder).toBe("portfolio/people/ada-lovelace");
      expect(mockUploadCalls[0].public_id).toMatch(/^ada-lovelace_\d+_[a-z0-9]+$/);

      const res2 = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .field("name", "Ada Lovelace")
        .attach("profilePicUrl", Buffer.from("ada-2-pic"), "ada2.png");

      expect(res2.status).toBe(201);
      expect(mockUploadCalls[1].folder).toBe("portfolio/people/ada-lovelace");
      expect(mockUploadCalls[1].public_id).toMatch(/^ada-lovelace_\d+_[a-z0-9]+$/);
      expect(mockUploadCalls[0].public_id).not.toBe(mockUploadCalls[1].public_id);
    });

    it("returns 404 for unknown person id", async () => {
      (Person.findById as jest.Mock).mockResolvedValue(null);
      (Person.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Unknown" });

      expect(res.status).toBe(404);
    });

    it("returns 400 for bad ObjectId format", async () => {
      const res = await request(app)
        .put("/api/v1/people/bad-id")
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: "Bad" });

      expect(res.status).toBe(400);
    });
  });

  describe("Delete Person in Use (DELETE /api/v1/people/:id)", () => {
    it("returns 409 with counts when referenced as contributor by a project", async () => {
      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-1",
          slug: "cool-project",
          contributors: [{ contributor: validId }],
          versions: [],
          hostedBy: [],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(Project.find).toHaveBeenCalledWith({
        $or: [
          { "contributors.contributor": new Types.ObjectId(validId) },
          { "versions.contributors.contributor": new Types.ObjectId(validId) },
          { hostedBy: new Types.ObjectId(validId) },
          { "versions.hostedBy": new Types.ObjectId(validId) },
        ],
      });
      expect(res.body.message).toMatch(/contributor.*1 project\(s\).*0 (project )?version\(s\)/i);
      expect(res.body.message).toMatch(/host.*0 project\(s\).*0 (project )?version\(s\)/i);
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("returns 409 with counts when referenced as contributor only by a project version", async () => {
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
          hostedBy: [],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/contributor.*0 project\(s\).*1 (project )?version\(s\)/i);
      expect(res.body.message).toMatch(/host.*0 project\(s\).*0 (project )?version\(s\)/i);
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("returns 409 with counts when referenced as host on a project", async () => {
      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-3",
          slug: "hosted-project",
          contributors: [],
          versions: [],
          hostedBy: [validId],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/contributor.*0 project\(s\).*0 (project )?version\(s\)/i);
      expect(res.body.message).toMatch(/host.*1 project\(s\).*0 (project )?version\(s\)/i);
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("returns 409 with counts when referenced as host on a project version", async () => {
      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-4",
          slug: "version-hosted-project",
          contributors: [],
          versions: [
            {
              versionTag: "v2.0.0",
              hostedBy: [validId],
            },
          ],
          hostedBy: [],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/contributor.*0 project\(s\).*0 (project )?version\(s\)/i);
      expect(res.body.message).toMatch(/host.*0 project\(s\).*1 (project )?version\(s\)/i);
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("returns 409 when uppercase hex id is provided and person is referenced", async () => {
      const lowercaseId = "60c72b2f9b1d8b2bad000001";
      const uppercaseId = lowercaseId.toUpperCase();

      (Project.find as jest.Mock).mockResolvedValue([
        {
          _id: "proj-1",
          slug: "cool-project",
          contributors: [{ contributor: lowercaseId }],
          versions: [],
          hostedBy: [],
        },
      ]);

      const res = await request(app)
        .delete(`/api/v1/people/${uppercaseId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/contributor.*1 project\(s\)/i);
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("deletes person successfully when not referenced by any project or version", async () => {
      (Project.find as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Person.findByIdAndDelete).toHaveBeenCalledWith(validId);
      expect(mockDestroy).not.toHaveBeenCalled();
    });

    it("returns 404 when person to delete does not exist", async () => {
      (Project.find as jest.Mock).mockResolvedValue([]);
      (Person.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/people/${validId}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid ObjectId on DELETE", async () => {
      const res = await request(app)
        .delete("/api/v1/people/invalid-id")
        .set("Authorization", "Bearer test-secret-token");

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Invalid identifier format");
    });
  });
});
