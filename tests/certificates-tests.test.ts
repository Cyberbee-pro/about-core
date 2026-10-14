import request from "supertest";
import { Certificate } from "@/models/Certificate";
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
jest.mock("@/models/Certificate");
jest.mock("@/models/LogEntry");
jest.mock("@/models/Project");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("@/server");

describe("Certificates API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadCalls.length = 0;
    (Certificate.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: "cert-1",
          title: "Test Cert",
          description: "Cert Description",
          link: "https://example.com",
          mediaUrl: "portfolio/certificate/cert.jpg",
          organization: "Cert Org",
          weight: 0,
        },
      ]),
    });
    (Certificate.findById as jest.Mock).mockResolvedValue({
      _id: "cert-1",
      title: "Test Cert",
      description: "Cert Description",
      link: "https://example.com",
      mediaUrl: "portfolio/certificate/cert.jpg",
      organization: "Cert Org",
      weight: 0,
    });
    (Certificate.findOne as jest.Mock).mockResolvedValue(null);
    (Certificate.create as jest.Mock).mockResolvedValue({
      _id: "cert-1",
      title: "Test Cert",
      description: "Cert Description",
      link: "https://example.com",
      mediaUrl: "portfolio/certificate/cert.jpg",
      organization: "Cert Org",
      weight: 0,
    });
    (Certificate.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "cert-1",
      title: "Updated Cert",
      description: "Cert Description",
      link: "https://example.com",
      mediaUrl: "portfolio/certificate/cert.jpg",
      organization: "Cert Org",
      weight: 0,
    });
    (Certificate.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: "cert-1",
      title: "Test Cert",
      description: "Cert Description",
      link: "https://example.com",
      mediaUrl: "portfolio/certificate/cert.jpg",
      organization: "Cert Org",
      weight: 0,
    });
  });

  it("GET /api/v1/certificates returns all certificates", async () => {
    const res = await request(app).get("/api/v1/certificates");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/v1/certificates/:id returns a single certificate", async () => {
    const res = await request(app).get("/api/v1/certificates/cert-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Test Cert");
  });

  it("POST /api/v1/certificates creates a certificate (admin protected)", async () => {
    (Certificate.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/certificates")
      .set("Authorization", "Bearer test-secret-token")
      .send({
        title: "Test Cert",
        description: "Cert Description",
        link: "https://example.com",
        mediaUrl: "portfolio/certificate/cert.jpg",
        organization: "Cert Org",
        weight: 0,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Test Cert");
  });

  it("POST /api/v1/certificates handles multipart mediaUrl image upload to Cloudinary", async () => {
    (Certificate.findOne as jest.Mock).mockResolvedValue(null);
    (Certificate.create as jest.Mock).mockImplementation((data) =>
      Promise.resolve({ _id: "cert-2", ...data })
    );

    const fakeImageBuffer = Buffer.from("fake-cert-image-content");
    const res = await request(app)
      .post("/api/v1/certificates")
      .set("Authorization", "Bearer test-secret-token")
      .field("title", "AWS Cloud Practitioner 2024")
      .field("organization", "Amazon Web Services")
      .field("description", "Foundational Cloud Certification")
      .field("weight", "1")
      .attach("mediaUrl", fakeImageBuffer, {
        filename: "aws-cert.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const uploadCall = mockUploadCalls.find(
      (c) => c.folder === "portfolio/certificate"
    );
    expect(uploadCall).toBeDefined();
    expect(uploadCall?.public_id).toBe("amazon_web_services_aws_cloud_practitioner_2024_2024");
    expect(uploadCall?.resource_type).toBe("image");
  });

  it("POST /api/v1/certificates with duplicate title returns 409", async () => {
    (Certificate.findOne as jest.Mock).mockResolvedValue({ title: "Test Cert" });
    const res = await request(app)
      .post("/api/v1/certificates")
      .set("Authorization", "Bearer test-secret-token")
      .send({
        title: "Test Cert",
        description: "Cert Description",
        link: "https://example.com",
        mediaUrl: "portfolio/certificate/cert.jpg",
        organization: "Cert Org",
        weight: 0,
      });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");
  });

  it("PUT /api/v1/certificates/:id updates a certificate (admin protected)", async () => {
    (Certificate.findOne as jest.Mock).mockResolvedValue(null);
    (Certificate.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "cert-1",
      title: "Updated Cert",
      description: "Cert Description",
      link: "https://example.com",
      mediaUrl: "portfolio/certificate/cert.jpg",
      organization: "Cert Org",
      weight: 0,
    });
    const res = await request(app)
      .put("/api/v1/certificates/cert-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ title: "Updated Cert" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Updated Cert");
  });

  it("DELETE /api/v1/certificates/:id deletes a certificate (admin protected)", async () => {
    const res = await request(app)
      .delete("/api/v1/certificates/cert-1")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Test Cert");
  });
});
