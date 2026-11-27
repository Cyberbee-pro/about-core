import request from "supertest";
import { Achievement } from "@/models/Achievement";

// Set env for admin auth in tests
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

// Mock models and DB
jest.mock("@/models/Achievement");
jest.mock("@/models/LogEntry");
jest.mock("@/models/Project");
jest.mock("@/models/SiteConfig");
jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require("@/server");

describe("Achievements API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Achievement.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        { _id: "ach-1", title: "Test Achievement", detail: "Detail", date: "Jan 2024", weight: 0 },
      ]),
    });
    (Achievement.findById as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
    });
    (Achievement.findOne as jest.Mock).mockResolvedValue(null);
    (Achievement.create as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
    });
    (Achievement.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Updated Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
    });
    (Achievement.findByIdAndDelete as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
    });
  });

  it("GET /api/v1/achievements returns all achievements", async () => {
    const res = await request(app).get("/api/v1/achievements");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(Achievement.find).toHaveBeenCalledWith({});
  });

  it("GET /api/v1/achievements?featured=true filters by featured=true", async () => {
    (Achievement.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        { _id: "ach-1", title: "Featured Achievement", detail: "Detail", date: "Jan 2024", weight: 0, featured: true },
      ]),
    });

    const res = await request(app).get("/api/v1/achievements?featured=true");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Achievement.find).toHaveBeenCalledWith({ featured: true });
    expect(res.body.data[0].featured).toBe(true);
  });

  it("GET /api/v1/achievements?featured=false filters by featured=false", async () => {
    const res = await request(app).get("/api/v1/achievements?featured=false");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Achievement.find).toHaveBeenCalledWith({ featured: false });
  });

  it("GET /api/v1/achievements?featured=invalid returns 400", async () => {
    const res = await request(app).get("/api/v1/achievements?featured=invalid");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Achievement.find).not.toHaveBeenCalled();
  });

  it("GET /api/v1/achievements/:id returns a single achievement", async () => {
    const res = await request(app).get("/api/v1/achievements/ach-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Test Achievement");
  });

  it("POST /api/v1/achievements creates an achievement with featured flag (admin protected)", async () => {
    (Achievement.findOne as jest.Mock).mockResolvedValue(null);
    (Achievement.create as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
      featured: true,
    });
    const res = await request(app)
      .post("/api/v1/achievements")
      .set("Authorization", "Bearer test-secret-token")
      .send({ title: "Test Achievement", detail: "Detail", date: "Jan 2024", weight: 0, featured: true });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.featured).toBe(true);
    expect(Achievement.create).toHaveBeenCalledWith({
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
      featured: true,
    });
  });

  it("POST /api/v1/achievements defaults featured to false when omitted", async () => {
    (Achievement.findOne as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/achievements")
      .set("Authorization", "Bearer test-secret-token")
      .send({ title: "Test Achievement", detail: "Detail", date: "Jan 2024", weight: 0 });
    expect(res.status).toBe(201);
    expect(Achievement.create).toHaveBeenCalledWith({
      title: "Test Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
      featured: false,
    });
  });

  it("POST /api/v1/achievements with duplicate title returns 409", async () => {
    (Achievement.findOne as jest.Mock).mockResolvedValue({ title: "Test Achievement" });
    const res = await request(app)
      .post("/api/v1/achievements")
      .set("Authorization", "Bearer test-secret-token")
      .send({ title: "Test Achievement", detail: "Detail", date: "Jan 2024", weight: 0 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("duplicate");
  });

  it("PUT /api/v1/achievements/:id updates an achievement including featured (admin protected)", async () => {
    (Achievement.findOne as jest.Mock).mockResolvedValue(null);
    (Achievement.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: "ach-1",
      title: "Updated Achievement",
      detail: "Detail",
      date: "Jan 2024",
      weight: 0,
      featured: true,
    });
    const res = await request(app)
      .put("/api/v1/achievements/ach-1")
      .set("Authorization", "Bearer test-secret-token")
      .send({ title: "Updated Achievement", featured: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Updated Achievement");
    expect(res.body.data.featured).toBe(true);
    expect(Achievement.findByIdAndUpdate).toHaveBeenCalledWith(
      "ach-1",
      { title: "Updated Achievement", featured: true },
      { new: true, runValidators: true }
    );
  });

  it("DELETE /api/v1/achievements/:id deletes an achievement (admin protected)", async () => {
    const res = await request(app)
      .delete("/api/v1/achievements/ach-1")
      .set("Authorization", "Bearer test-secret-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Test Achievement");
  });
});
