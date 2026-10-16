import request from "supertest";
import { Experience } from "@/models/Experience";
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
    upload_stream: (
      options: CloudinaryMockOptions,
      callback: CloudinaryMockCallback
    ): Writable => {
      uploadCalls.push(options);
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
  const cloudinary = { uploader, search, uploadCalls };
  return { __esModule: true, default: cloudinary, cloudinary };
});

const mockCloudinary = jest.requireMock("@/config/cloudinary") as {
  default: {
    search: {
      expression: jest.Mock;
      max_results: jest.Mock;
      execute: jest.Mock;
    };
    uploadCalls: CloudinaryMockOptions[];
  };
};
const mockSearch = mockCloudinary.default.search;
const mockUploadCalls = mockCloudinary.default.uploadCalls;

// Mock models and DB
jest.mock("@/models/Experience");
jest.mock("@/models/LogEntry");
jest.mock("@/models/Project");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("@/server");

const validExperiencePayload = {
  organization: "Tech Corp",
  tag: "focus",
  type: "internship",
  iconUrl: "portfolio/experience/techcorp.png",
  skills: [],
  weight: 0,
  positions: [
    {
      position: "Software Engineering Intern",
      description: "Worked on backend services using Node.js.",
      startDate: "2024-06-01T00:00:00.000Z",
      isCurrent: false,
    },
  ],

};

const mockExperienceDoc = {
  _id: "exp-1",
  ...validExperiencePayload,
};

describe("Experiences API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    mockSearch.expression.mockReturnValue(mockSearch);
    mockSearch.max_results.mockReturnValue(mockSearch);
    mockSearch.execute.mockResolvedValue({ resources: [], total_count: 0 });
    (Experience.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockExperienceDoc]),
    });
    (Experience.findById as jest.Mock).mockResolvedValue(mockExperienceDoc);
    (Experience.findOne as jest.Mock).mockResolvedValue(null);
    (Experience.create as jest.Mock).mockResolvedValue(mockExperienceDoc);
    (Experience.updateMany as jest.Mock).mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    (Experience.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      ...mockExperienceDoc,
      organization: "Updated Tech Corp",
    });
    (Experience.findByIdAndDelete as jest.Mock).mockResolvedValue(mockExperienceDoc);
  });

  it("GET /api/v1/experiences returns all experiences", async () => {
    const res = await request(app).get("/api/v1/experiences");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/v1/experiences/:id returns a single experience", async () => {
    const res = await request(app).get("/api/v1/experiences/exp-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization).toBe("Tech Corp");
  });

  it("POST /api/v1/experiences creates an experience (admin protected)", async () => {
    (Experience.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", "Bearer test-secret-token")
      .send(validExperiencePayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization).toBe("Tech Corp");
  });

  it("POST /api/v1/experiences handles multipart iconUrl, mediaUrls, and certificateUrls uploads to Cloudinary", async () => {
    (Experience.findOne as jest.Mock).mockResolvedValue(null);
    (Experience.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ _id: "exp-2", ...data })
    );

    const fakeIconBuffer = Buffer.from("fake-icon-bytes");
    const fakeMediaBuffer = Buffer.from("fake-media-bytes");
    const fakeCertBuffer = Buffer.from("fake-cert-bytes");

    const res = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", "Bearer test-secret-token")
      .field("organization", "Tech Corp")
      .field("tag", "focus")
      .field("type", "internship")
      .field("weight", "2")
      .field(
        "positions",
        JSON.stringify([
          {
            position: "Senior Lead",
            description: "Lead developer",
            startDate: "2024-01-01",
            isCurrent: true,
          },
        ])

      )
      .attach("iconUrl", fakeIconBuffer, {
        filename: "icon.png",
        contentType: "image/png",
      })
      .attach("mediaUrls", fakeMediaBuffer, {
        filename: "demo.png",
        contentType: "image/png",
      })
      .attach("certificateUrls", fakeCertBuffer, {
        filename: "award.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const iconUpload = mockUploadCalls.find(
      (c) => c.folder === "portfolio/experiences/focus/tech-corp/icons"
    );
    expect(iconUpload).toBeDefined();
    expect(iconUpload?.public_id).toBe("experience_icon");

    const mediaUpload = mockUploadCalls.find(
      (c) => c.folder === "portfolio/experiences/focus/tech-corp/media"
    );
    expect(mediaUpload).toBeDefined();
    expect(mediaUpload?.public_id).toBe("experience_media_1");

    const certUpload = mockUploadCalls.find(
      (c) => c.folder === "portfolio/experiences/focus/tech-corp/certificates"
    );
    expect(certUpload).toBeDefined();
    expect(certUpload?.public_id).toBe("experience_certificate_1");
  });

  it("POST /api/v1/experiences with duplicate organization returns 409", async () => {
    (Experience.findOne as jest.Mock).mockResolvedValue(mockExperienceDoc);
    const res = await request(app)
      .post("/api/v1/experiences")
      .set("Authorization", "Bearer test-secret-token")
      .send(validExperiencePayload);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");
  });

  it("PUT /api/v1/experiences/:id updates an experience (admin protected)", async () => {
    (Experience.findOne as jest.Mock).mockResolvedValue(null);
    (Experience.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      ...mockExperienceDoc,
      organization: "Updated Tech Corp",
    });
    const res = await request(app)
      .put("/api/v1/experiences/exp-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ organization: "Updated Tech Corp" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization).toBe("Updated Tech Corp");
  });

  it("DELETE /api/v1/experiences/:id deletes an experience (admin protected)", async () => {
    const res = await request(app)
      .delete("/api/v1/experiences/exp-1")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization).toBe("Tech Corp");
  });

  describe("POST /api/v1/experiences/:organization/positions", () => {
    it("rejects unauthorized access without token (401)", async () => {
      const res = await request(app)
        .post("/api/v1/experiences/Tech%20Corp/positions")
        .send({ title: "Role" });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 404 if experience does not exist for organization", async () => {
      (Experience.findOne as jest.Mock).mockResolvedValue(null);
      const res = await request(app)
        .post("/api/v1/experiences/non-existent-org/positions")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          position: {
            position: "Tech Lead",
            description: "Promoted to lead",
            startDate: "2024-01-01",
            isCurrent: true,
          },
        });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Experience not found for organization: non-existent-org");
    });

    it("appends a position and updates isCurrent flags (admin protected) using organization name (case-insensitive)", async () => {
      const existingDoc = {
        _id: "exp-1",
        ...validExperiencePayload,
        positions: [
          {
            position: "Junior Dev",
            description: "Entry role",
            startDate: new Date("2023-01-01"),
            isCurrent: true,
          },
        ],
      };
      (Experience.findOne as jest.Mock).mockResolvedValue(existingDoc);

      const newPositionPayload = {
        position: "Senior Dev",
        description: "Promoted to Senior",
        startDate: "2024-01-01T00:00:00.000Z",
        isCurrent: true,
      };


      const expectedUpdatedDoc = {
        ...existingDoc,
        positions: [
          { ...existingDoc.positions[0], isCurrent: false },
          { ...newPositionPayload, isCurrent: true },
        ],
      };
      (Experience.findByIdAndUpdate as jest.Mock).mockResolvedValue(expectedUpdatedDoc);

      const res = await request(app)
        .post("/api/v1/experiences/tech%20corp/positions")
        .set("Authorization", "Bearer test-secret-token")
        .send({ position: newPositionPayload });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.positions).toHaveLength(2);
      expect(res.body.data.positions[0].isCurrent).toBe(false);
      expect(res.body.data.positions[1].isCurrent).toBe(true);
      expect(Experience.findOne).toHaveBeenCalledWith({
        organization: { $regex: expect.any(RegExp) },
      });
      expect(Experience.updateMany).toHaveBeenCalledWith(
        { _id: "exp-1" },
        { $set: { "positions.$[].isCurrent": false } }
      );
      expect(Experience.findByIdAndUpdate).toHaveBeenCalledWith(
        "exp-1",
        expect.objectContaining({
          $push: expect.objectContaining({
            positions: expect.objectContaining({
              position: "Senior Dev",
              isCurrent: true,
            }),

          }),
        }),
        expect.any(Object)
      );
    });

    it("handles multipart mediaUrls and certificateUrls uploads to Cloudinary when appending a position", async () => {
      (Experience.findOne as jest.Mock).mockResolvedValue(mockExperienceDoc);
      const updatedWithUploads = {
        ...mockExperienceDoc,
        positions: [
          ...mockExperienceDoc.positions,
          {
            position: "Tech Lead",
            description: "Leading frontend",
            startDate: new Date("2024-06-01"),
            isCurrent: true,
            mediaUrls: [
              "https://res.cloudinary.com/demo/image/portfolio/experiences/focus/tech-corp/media/experience_media_1",
            ],
            certificateUrls: [
              "https://res.cloudinary.com/demo/image/portfolio/experiences/focus/tech-corp/certificates/experience_certificate_1",
            ],
          },
        ],
      };
      (Experience.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedWithUploads);

      const fakeMediaBuffer = Buffer.from("fake-media");
      const fakeCertBuffer = Buffer.from("fake-cert");

      const res = await request(app)
        .post("/api/v1/experiences/Tech%20Corp/positions")
        .set("Authorization", "Bearer test-secret-token")
        .field(
          "position",
          JSON.stringify({
            position: "Tech Lead",
            description: "Leading frontend",
            startDate: "2024-06-01",
            isCurrent: true,
          })
        )

        .attach("mediaUrls", fakeMediaBuffer, {
          filename: "lead_demo.png",
          contentType: "image/png",
        })
        .attach("certificateUrls", fakeCertBuffer, {
          filename: "lead_cert.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const mediaUpload = mockUploadCalls.find(
        (c) => c.folder === "portfolio/experiences/focus/tech-corp/media"
      );
      expect(mediaUpload).toBeDefined();
      expect(mediaUpload?.public_id).toBe("experience_media_1");

      const certUpload = mockUploadCalls.find(
        (c) => c.folder === "portfolio/experiences/focus/tech-corp/certificates"
      );
      expect(certUpload).toBeDefined();
      expect(certUpload?.public_id).toBe("experience_certificate_1");
    });
  });
});
