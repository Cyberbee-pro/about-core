import request from "supertest";
import { app, getAllowedOrigins } from "@/server";

describe("CORS Configuration Tests", () => {
  const originalClientOrigin = process.env.CLIENT_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalClientOrigin === undefined) {
      delete process.env.CLIENT_ORIGIN;
    } else {
      process.env.CLIENT_ORIGIN = originalClientOrigin;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("getAllowedOrigins helper", () => {
    it("no longer returns any built-in list when CLIENT_ORIGIN is not set", () => {
      delete process.env.CLIENT_ORIGIN;
      const origins = getAllowedOrigins();
      expect(origins).toEqual([]);
    });

    it("returns empty array when CLIENT_ORIGIN is empty string or whitespace", () => {
      process.env.CLIENT_ORIGIN = "  , ,  ";
      const origins = getAllowedOrigins();
      expect(origins).toEqual([]);
    });

    it("correctly parses comma-separated origins, trims entries, and strips trailing slashes", () => {
      process.env.CLIENT_ORIGIN = "https://app.example.com/, https://admin.example.com , https://api.example.com/ ";
      const origins = getAllowedOrigins();
      expect(origins).toEqual([
        "https://app.example.com",
        "https://admin.example.com",
        "https://api.example.com",
      ]);
    });

    it("filters out empty entries from trailing or consecutive commas", () => {
      process.env.CLIENT_ORIGIN = "https://app.example.com/,, https://admin.example.com,";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://app.example.com", "https://admin.example.com"]);
    });

    it("accepts explicit wildcard '*' as an allowed origin", () => {
      process.env.CLIENT_ORIGIN = "*";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["*"]);
    });

    it("ignores invalid entries and logs a warning for each ignored entry", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.CLIENT_ORIGIN = "https://valid.example.com, not-a-valid-origin, ftp://bad.example.com, http://valid2.example.com:8080";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://valid.example.com", "http://valid2.example.com:8080"]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not-a-valid-origin")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("ftp://bad.example.com")
      );
      warnSpy.mockRestore();
    });
  });

  describe("CORS Middleware Behavior", () => {
    describe("Configured CLIENT_ORIGIN", () => {
      it("allows requests matching configured origin with credentials", async () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        const res = await request(app)
          .get("/health")
          .set("Origin", "https://app.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
        expect(res.headers["access-control-allow-credentials"]).toBe("true");
      });

      it("allows requests with trailing slash in origin matching clean origin", async () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        const res = await request(app)
          .get("/health")
          .set("Origin", "https://app.example.com/");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-credentials"]).toBe("true");
      });

      it("matches allowed origin even if CLIENT_ORIGIN entry has trailing slash", async () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com/";
        const res = await request(app)
          .get("/health")
          .set("Origin", "https://app.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
      });

      it("rejects unknown origins with 403 when CLIENT_ORIGIN is configured", async () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        const res = await request(app)
          .get("/health")
          .set("Origin", "https://unknown.example.com");

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("Not allowed by CORS");
      });

      it("handles wildcard '*' CLIENT_ORIGIN without credentials", async () => {
        process.env.CLIENT_ORIGIN = "*";
        const res = await request(app)
          .get("/health")
          .set("Origin", "https://any-arbitrary-domain.org");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe("*");
        expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
      });

      it("handles preflight OPTIONS requests for allowed origins with expected headers", async () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        const res = await request(app)
          .options("/api/v1/projects")
          .set("Origin", "https://app.example.com")
          .set("Access-Control-Request-Method", "POST")
          .set("Access-Control-Request-Headers", "Content-Type, Authorization, x-admin-token");

        expect(res.status).toBe(204);
        expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
        expect(res.headers["access-control-allow-methods"]).toBe("GET,POST,PUT,DELETE,OPTIONS");
        expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
        expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
        expect(res.headers["access-control-allow-headers"]).toContain("x-admin-token");
        expect(res.headers["access-control-allow-credentials"]).toBe("true");
      });
    });

    describe("Unset CLIENT_ORIGIN in Production (Fail Closed)", () => {
      it("rejects requests with an Origin header with 403 when NODE_ENV=production", async () => {
        delete process.env.CLIENT_ORIGIN;
        process.env.NODE_ENV = "production";

        const res = await request(app)
          .get("/health")
          .set("Origin", "http://localhost:3000");

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("Not allowed by CORS");
      });

      it("allows requests without an Origin header when NODE_ENV=production", async () => {
        delete process.env.CLIENT_ORIGIN;
        process.env.NODE_ENV = "production";

        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("healthy");
      });
    });

    describe("Unset CLIENT_ORIGIN in Development / Test (Localhost allowed)", () => {
      it("allows localhost on port 3000 and 5173 when CLIENT_ORIGIN is unset in development", async () => {
        delete process.env.CLIENT_ORIGIN;
        process.env.NODE_ENV = "development";

        const res3000 = await request(app)
          .get("/health")
          .set("Origin", "http://localhost:3000");
        expect(res3000.status).toBe(200);
        expect(res3000.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
        expect(res3000.headers["access-control-allow-credentials"]).toBe("true");

        const res5173 = await request(app)
          .get("/health")
          .set("Origin", "http://localhost:5173");
        expect(res5173.status).toBe(200);
        expect(res5173.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
        expect(res5173.headers["access-control-allow-credentials"]).toBe("true");
      });

      it("allows 127.0.0.1 and [::1] on any port when CLIENT_ORIGIN is unset in development", async () => {
        delete process.env.CLIENT_ORIGIN;
        process.env.NODE_ENV = "development";

        const resIpv4 = await request(app)
          .get("/health")
          .set("Origin", "http://127.0.0.1:8080");
        expect(resIpv4.status).toBe(200);
        expect(resIpv4.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:8080");

        const resIpv6 = await request(app)
          .get("/health")
          .set("Origin", "http://[::1]:8080");
        expect(resIpv6.status).toBe(200);
        expect(resIpv6.headers["access-control-allow-origin"]).toBe("http://[::1]:8080");
      });

      it("rejects evil.example and http://localhost.evil.com with 403", async () => {
        delete process.env.CLIENT_ORIGIN;
        process.env.NODE_ENV = "development";

        const resEvil = await request(app)
          .get("/health")
          .set("Origin", "https://evil.example");
        expect(resEvil.status).toBe(403);
        expect(resEvil.body.success).toBe(false);

        const resSubdomain = await request(app)
          .get("/health")
          .set("Origin", "http://localhost.evil.com");
        expect(resSubdomain.status).toBe(403);
        expect(resSubdomain.body.success).toBe(false);
      });
    });

    describe("Requests with no Origin header", () => {
      it("allows requests with no Origin header (mobile apps, curl, server-to-server)", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("healthy");
      });
    });
  });
});
