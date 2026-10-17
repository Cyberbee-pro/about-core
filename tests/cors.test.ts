import request from "supertest";
import { app, getAllowedOrigins } from "@/server";

describe("CORS Configuration Tests", () => {
  const originalClientOrigin = process.env.CLIENT_ORIGIN;

  afterEach(() => {
    process.env.CLIENT_ORIGIN = originalClientOrigin;
  });

  describe("getAllowedOrigins helper", () => {
    it("returns default allowed origins when CLIENT_ORIGIN is not set", () => {
      delete process.env.CLIENT_ORIGIN;
      const origins = getAllowedOrigins();
      expect(origins).toContain("http://localhost:3000");
      expect(origins).toContain("https://core.shibraj.dev");
      expect(origins).toContain("https://client.shibraj.dev");
      expect(origins).toContain("https://shibraj.dev");
    });

    it("correctly parses comma-separated origins with whitespace", () => {
      process.env.CLIENT_ORIGIN = "https://site1.com, https://site2.com , https://site3.com";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://site1.com", "https://site2.com", "https://site3.com"]);
    });

    it("filters out empty entries from trailing or consecutive commas", () => {
      process.env.CLIENT_ORIGIN = "https://site1.com,, https://site2.com,";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://site1.com", "https://site2.com"]);
    });
  });

  describe("CORS Middleware Behavior", () => {
    it("allows requests with no Origin header (mobile apps, curl, server-to-server)", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("allows requests from http://localhost:3000 with credentials", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:3000");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("allows requests from https://core.shibraj.dev", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://core.shibraj.dev");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("https://core.shibraj.dev");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("allows requests with trailing slash in origin matching clean origin", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:3000/");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("handles preflight OPTIONS requests for allowed origins with expected headers", async () => {
      const res = await request(app)
        .options("/api/v1/projects")
        .set("Origin", "https://core.shibraj.dev")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Content-Type, Authorization, x-admin-token");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("https://core.shibraj.dev");
      expect(res.headers["access-control-allow-methods"]).toBe("GET,POST,PUT,DELETE,OPTIONS");
      expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
      expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
      expect(res.headers["access-control-allow-headers"]).toContain("x-admin-token");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("rejects requests from disallowed origins with 403 and CORS error message", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://unauthorized-domain.com");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Not allowed by CORS");
    });
  });
});
