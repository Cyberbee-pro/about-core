import request from "supertest";
import { Skill } from "../src/models/Skill";

// Set env for admin auth in tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock models and DB
jest.mock("../src/models/Skill");
jest.mock("../src/models/LogEntry");
jest.mock("../src/models/Project");
jest.mock("../src/models/SiteConfig");
jest.mock("../src/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("../src/server");

describe("Skills API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Skill.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        { _id: "skill-1", name: "TypeScript", logoUrl: "", featured: false, weight: 0 },
      ]),
    });
    (Skill.findById as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.create as jest.Mock).mockResolvedValue({
      _id: "skill-2",
      name: "React",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "Updated",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    (Skill.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "TypeScript",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
  });

  it("GET /api/v1/skills returns all skills", async () => {
    const res = await request(app).get("/api/v1/skills");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/v1/skills/:id returns a single skill", async () => {
    const res = await request(app).get("/api/v1/skills/skill-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("TypeScript");
  });

  it("POST /api/v1/skills creates a skill (admin protected)", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "React", logoUrl: "", featured: false, weight: 0 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("React");
  });

  it("POST /api/v1/skills with duplicate name returns 409", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue({ name: "React" });
    const res = await request(app)
      .post("/api/v1/skills")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "React", logoUrl: "", featured: false, weight: 0 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");
  });

  it("PUT /api/v1/skills/:id updates a skill (admin protected)", async () => {
    (Skill.findOne as jest.Mock).mockResolvedValue(null);
    (Skill.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "skill-1",
      name: "Updated",
      logoUrl: "",
      featured: false,
      weight: 0,
    });
    const res = await request(app)
      .put("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Updated");
  });

  it("DELETE /api/v1/skills/:id deletes a skill (admin protected)", async () => {
    const res = await request(app)
      .delete("/api/v1/skills/skill-1")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("TypeScript");
  });
});