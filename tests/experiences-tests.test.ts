import request from "supertest";
import { Experience } from "../src/models/Experience";

// Set env for admin auth in tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock models and DB
jest.mock("../src/models/Experience");
jest.mock("../src/models/LogEntry");
jest.mock("../src/models/Project");
jest.mock("../src/models/SiteConfig");
jest.mock("../src/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("../src/server");

const validExperiencePayload = {
  organization: "Tech Corp",
  tag: "focus",
  type: "internship",
  iconUrl: "portfolio/experience/techcorp.png",
  skills: [],
  weight: 0,
  positions: [
    {
      positionTag: "Initial Hire",
      title: "Software Engineering Intern",
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
    (Experience.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockExperienceDoc]),
    });
    (Experience.findById as jest.Mock).mockResolvedValue(mockExperienceDoc);
    (Experience.findOne as jest.Mock).mockResolvedValue(null);
    (Experience.create as jest.Mock).mockResolvedValue(mockExperienceDoc);
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
});
