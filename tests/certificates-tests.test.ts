import request from "supertest";
import { Certificate } from "../src/models/Certificate";

// Set env for admin auth in tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock models and DB
jest.mock("../src/models/Certificate");
jest.mock("../src/models/LogEntry");
jest.mock("../src/models/Project");
jest.mock("../src/models/SiteConfig");
jest.mock("../src/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("../src/server");

describe("Certificates API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
