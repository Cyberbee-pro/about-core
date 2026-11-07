process.env.MONGOMS_DISTRO = process.env.MONGOMS_DISTRO || "ubuntu-22.04";
process.env.ADMIN_SECRET = "test-secret-token";
process.env.NODE_ENV = "test";

const mockUploadCalls: any[] = [];
const mockDestroy = jest.fn().mockResolvedValue({ result: "ok" });

jest.mock("@/config/cloudinary", () => {
  const search = {
    expression: jest.fn().mockReturnThis(),
    max_results: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ resources: [], total_count: 0 }),
  };
  const uploader = {
    destroy: mockDestroy,
    upload_stream: (options: any, callback: any): Writable => {
      mockUploadCalls.push(options);
      const writable = new Writable({
        write(_chunk, _encoding, next) {
          next();
        },
      });
      process.nextTick(() =>
        callback(null, {
          secure_url: `https://res.cloudinary.com/demo/${options.resource_type || "image"}/${options.folder}/${options.public_id || "file"}`,
          public_id: options.public_id ? `${options.folder}/${options.public_id}` : "test_id",
        })
      );
      return writable;
    },
  };
  return {
    __esModule: true,
    default: { uploader, search, config: jest.fn() },
    uploader,
    search,
  };
});

import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { Writable } from "stream";
import { app } from "@/server";
import { Project } from "@/models/Project";
import { Person } from "@/models/Person";
import { Certificate } from "@/models/Certificate";
import { isValidHttpUrl } from "@/utils/stringUtils";

describe("In-Memory MongoDB Integration & Clearing Tests", () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mockUploadCalls.length = 0;
    mockDestroy.mockClear();
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe("1. URL & Boolean Helper Unit Checks", () => {
    it("isValidHttpUrl rejects 'http:example.com' without '//'", () => {
      expect(isValidHttpUrl("http:example.com")).toBe(false);
      expect(isValidHttpUrl("https:example.com")).toBe(false);
      expect(isValidHttpUrl("http://example.com")).toBe(true);
      expect(isValidHttpUrl("https://example.com")).toBe(true);
    });
  });

  describe("2. Version Gallery Upload Uses Stored Tag (A3)", () => {
    it("version gallery upload uses stored versionTag even when body supplies versionTag", async () => {
      const proj = await Project.create({
        title: "Stored Tag Proj",
        slug: "stored-tag-proj",
        category: "web",
        description: "Test description",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          {
            versionTag: "v1.0-stored",
            releaseDate: new Date(),
            changelog: ["Initial"],
            gallery: [],
          },
        ],
      });

      const verId = proj.versions[0]._id!.toString();

      const res = await request(app)
        .post(`/api/v1/projects/${proj.slug}/versions/${verId}/gallery`)
        .set("Authorization", "Bearer test-secret-token")
        .field("versionTag", "malicious-tag-override")
        .attach("galleryImages", Buffer.from("fake-image"), "shot.png");

      expect(res.status).toBe(201);
      expect(mockUploadCalls.length).toBe(1);
      expect(mockUploadCalls[0].folder).toBe("portfolio/projects/stored-tag-proj/v1.0-stored/gallery");
      expect(mockUploadCalls[0].folder).not.toContain("malicious-tag-override");
    });
  });

  describe("3. Split Upload Fields per Route (A4)", () => {
    it("accepts galleryImages on POST /projects", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Creation Gallery Proj")
        .field("category", "web")
        .field("description", "Testing creation gallery")
        .field("image", "https://example.com/banner.png")
        .field("startDate", "2023-01-01")
        .field("status", "active")
        .field("galleryMeta", JSON.stringify([{ tags: ["preview"], caption: "Initial" }]))
        .attach("galleryImages", Buffer.from("creation-image"), "gal.png");

      expect(res.status).toBe(201);
      const readBack = await Project.findOne({ slug: "creation-gallery-proj" });
      expect(readBack?.gallery).toHaveLength(1);
      expect(readBack?.gallery[0].caption).toBe("Initial");
    });

    it("rejects gallery files on PUT /projects/:id with 400 (MulterError)", async () => {
      const proj = await Project.create({
        title: "No Gallery On Update",
        slug: "no-gallery-on-update",
        category: "web",
        description: "desc",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .field("title", "Updated Title")
        .attach("galleryImages", Buffer.from("should-fail"), "fail.png");

      expect(res.status).toBe(400);

      const readBack = await Project.findById(proj._id);
      expect(readBack?.title).toBe("No Gallery On Update");
      expect(readBack?.gallery).toHaveLength(0);
    });
  });

  describe("4. Gallery Atomic Reordering with 409 On Concurrent Conflict (E15)", () => {
    it("returns 409 when project gallery items change concurrently before reorder executes", async () => {
      const item1Id = new Types.ObjectId();
      const item2Id = new Types.ObjectId();
      const proj = await Project.create({
        title: "Reorder Proj",
        slug: "reorder-proj",
        category: "web",
        description: "Reordering test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        gallery: [
          { _id: item1Id, url: "https://example.com/1.png", tags: [], caption: "1" },
          { _id: item2Id, url: "https://example.com/2.png", tags: [], caption: "2" },
        ],
      });

      const item3Id = new Types.ObjectId();
      const origFindOne = Project.findOne.bind(Project);
      (jest.spyOn(Project, "findOne") as any).mockImplementationOnce(async (...args: any[]) => {
        const doc = await (origFindOne as any)(...args);
        // Concurrent modification right between the read and the atomic write
        await Project.updateOne(
          { _id: proj._id },
          { $push: { gallery: { _id: item3Id, url: "https://example.com/3.png", tags: [], caption: "3" } } }
        );
        return doc;
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj.slug}/gallery/order`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ order: [item2Id.toString(), item1Id.toString()] });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/concurrent modification/i);

      // Verify gallery was not overwritten
      const readBack = await Project.findById(proj._id);
      expect(readBack?.gallery).toHaveLength(3);
    });

    it("returns 409 when version gallery items change concurrently before reorder executes", async () => {
      const item1Id = new Types.ObjectId();
      const item2Id = new Types.ObjectId();
      const verId = new Types.ObjectId();
      const proj = await Project.create({
        title: "Version Reorder Proj",
        slug: "ver-reorder-proj",
        category: "web",
        description: "Reordering ver test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          {
            _id: verId,
            versionTag: "v1.0",
            releaseDate: new Date(),
            changelog: [],
            gallery: [
              { _id: item1Id, url: "https://example.com/1.png", tags: [], caption: "1" },
              { _id: item2Id, url: "https://example.com/2.png", tags: [], caption: "2" },
            ],
          },
        ],
      });

      const item3Id = new Types.ObjectId();
      const origFindOne = Project.findOne.bind(Project);
      (jest.spyOn(Project, "findOne") as any).mockImplementationOnce(async (...args: any[]) => {
        const doc = await (origFindOne as any)(...args);
        // Concurrent modification right between the read and the atomic write
        await Project.updateOne(
          { _id: proj._id, "versions._id": verId },
          { $push: { "versions.$.gallery": { _id: item3Id, url: "https://example.com/3.png", tags: [], caption: "3" } } }
        );
        return doc;
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${verId}/gallery/order`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ order: [item2Id.toString(), item1Id.toString()] });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/concurrent modification/i);
    });
  });

  describe("5. 30-Item Cap Enforced Atomically in addVersionGallery (E16)", () => {
    it("rejects atomically when adding items to version gallery exceeds 30 items", async () => {
      const existingItems = Array.from({ length: 29 }, (_, i) => ({
        _id: new Types.ObjectId(),
        url: `https://example.com/img${i}.png`,
        tags: [],
        caption: `Img ${i}`,
      }));

      const verId = new Types.ObjectId();
      const proj = await Project.create({
        title: "Cap Test Proj",
        slug: "cap-test-proj",
        category: "web",
        description: "testing cap",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          {
            _id: verId,
            versionTag: "v1.0",
            releaseDate: new Date(),
            changelog: [],
            gallery: existingItems,
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/projects/${proj.slug}/versions/${verId}/gallery`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          items: [
            { url: "https://example.com/new1.png" },
            { url: "https://example.com/new2.png" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/exceed.*30/i);

      const readBack = await Project.findById(proj._id);
      expect(readBack?.versions[0].gallery).toHaveLength(29);
    });
  });

  describe("6. Cross-Version Gallery Isolation (B7)", () => {
    it("returns 404 when updating or deleting an image using another version's ID", async () => {
      const img1Id = new Types.ObjectId();
      const img2Id = new Types.ObjectId();
      const ver1Id = new Types.ObjectId();
      const ver2Id = new Types.ObjectId();

      const proj = await Project.create({
        title: "Cross Ver Proj",
        slug: "cross-ver-proj",
        category: "web",
        description: "Isolation test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          {
            _id: ver1Id,
            versionTag: "v1.0",
            releaseDate: new Date(),
            changelog: [],
            gallery: [{ _id: img1Id, url: "https://example.com/1.png", tags: [], caption: "1" }],
          },
          {
            _id: ver2Id,
            versionTag: "v2.0",
            releaseDate: new Date(),
            changelog: [],
            gallery: [{ _id: img2Id, url: "https://example.com/2.png", tags: [], caption: "2" }],
          },
        ],
      });

      const putRes = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${ver1Id}/gallery/${img2Id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ caption: "Hacked caption" });

      expect(putRes.status).toBe(404);

      const delRes = await request(app)
        .delete(`/api/v1/projects/${proj.slug}/versions/${ver1Id}/gallery/${img2Id}`)
        .set("Authorization", "Bearer test-secret-token");

      expect(delRes.status).toBe(404);

      const readBack = await Project.findById(proj._id);
      expect(readBack?.versions[1].gallery[0].caption).toBe("2");
    });
  });

  describe("7. isLatest Validation Before Flag Modification", () => {
    it("returns 400 for invalid isLatest on PUT and leaves other versions' flags untouched", async () => {
      const ver1Id = new Types.ObjectId();
      const ver2Id = new Types.ObjectId();

      const proj = await Project.create({
        title: "Latest Proj",
        slug: "latest-proj",
        category: "web",
        description: "Latest test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          { _id: ver1Id, versionTag: "v1.0", releaseDate: new Date(), changelog: [], isLatest: true },
          { _id: ver2Id, versionTag: "v2.0", releaseDate: new Date(), changelog: [], isLatest: false },
        ],
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${ver2Id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ isLatest: "invalid-boolean" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/isLatest must be a boolean/i);

      const readBack = await Project.findById(proj._id);
      expect(readBack?.versions[0].isLatest).toBe(true);
      expect(readBack?.versions[1].isLatest).toBe(false);
    });

    it("returns 400 for invalid isLatest on POST version and leaves existing flags untouched", async () => {
      const ver1Id = new Types.ObjectId();

      const proj = await Project.create({
        title: "Latest Post Proj",
        slug: "latest-post-proj",
        category: "web",
        description: "Latest post test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          { _id: ver1Id, versionTag: "v1.0", releaseDate: new Date(), changelog: [], isLatest: true },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/projects/${proj.slug}/versions`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ versionTag: "v2.0", isLatest: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/isLatest must be a boolean/i);

      const readBack = await Project.findById(proj._id);
      expect(readBack?.versions).toHaveLength(1);
      expect(readBack?.versions[0].isLatest).toBe(true);
    });
  });

  describe("8. Field Clearing Verified by Reading Back Real DB Documents", () => {
    it("clears Certificate link via $unset", async () => {
      const cert = await Certificate.create({
        title: "AWS Solutions Architect",
        description: "Cloud architecture certificate",
        organization: "Amazon",
        mediaUrl: "https://example.com/cert.png",
        link: "https://example.com/verify-cert",
      });

      const res = await request(app)
        .put(`/api/v1/certificates/${cert._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ link: "" });

      expect(res.status).toBe(200);

      const rawCert = await Certificate.collection.findOne({ _id: cert._id });
      expect(rawCert?.link).toBeUndefined();
    });

    it("clears Project links and forkedFrom to null", async () => {
      const proj = await Project.create({
        title: "Links Proj",
        slug: "links-proj",
        category: "web",
        description: "Links test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        videoDemo: "https://example.com/demo.mp4",
        deployedLink: "https://example.com/live",
        githubLink: "https://github.com/test/repo",
        forkedFrom: "https://github.com/parent/repo",
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          videoDemo: "",
          deployedLink: "",
          githubLink: "",
          forkedFrom: "",
        });

      expect(res.status).toBe(200);

      const rawProj = await Project.findById(proj._id).lean();
      expect(rawProj?.videoDemo).toBeNull();
      expect(rawProj?.deployedLink).toBeNull();
      expect(rawProj?.githubLink).toBeNull();
      expect(rawProj?.forkedFrom).toBeNull();
    });

    it("clears Person profileLink to null", async () => {
      const person = await Person.create({
        name: "Clearing Alice",
        profilePicUrl: "https://example.com/alice.png",
        profileLink: "https://example.com/alice-blog",
      });

      const res = await request(app)
        .put(`/api/v1/people/${person._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ profileLink: "" });

      expect(res.status).toBe(200);

      const rawPerson = await Person.findById(person._id).lean();
      expect(rawPerson?.profileLink).toBeNull();
    });

    it("clears Version optional media and link fields to undefined", async () => {
      const verId = new Types.ObjectId();
      const proj = await Project.create({
        title: "Version Clearing Proj",
        slug: "ver-clearing-proj",
        category: "web",
        description: "Version clearing test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          {
            _id: verId,
            versionTag: "v1.0",
            releaseDate: new Date(),
            changelog: [],
            demoUrl: "https://example.com/demo",
            image: "https://example.com/v.png",
            videoDemo: "https://example.com/v.mp4",
            threeDFileUrl: "https://example.com/v.glb",
            deployedLink: "https://example.com/v-live",
            githubLink: "https://github.com/v/repo",
          },
        ],
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${verId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({
          demoUrl: "",
          image: "",
          videoDemo: "",
          threeDFileUrl: "",
          deployedLink: "",
          githubLink: "",
        });

      expect(res.status).toBe(200);

      const rawProj = await Project.findById(proj._id).lean();
      const rawVer = rawProj?.versions[0];
      expect(rawVer?.demoUrl).toBeUndefined();
      expect(rawVer?.image).toBeUndefined();
      expect(rawVer?.videoDemo).toBeUndefined();
      expect(rawVer?.threeDFileUrl).toBeUndefined();
      expect(rawVer?.deployedLink).toBeUndefined();
      expect(rawVer?.githubLink).toBeUndefined();
    });
  });

  describe("9. Validation Checks (B5/B6, D10/D11, D13, Media URLs)", () => {
    it("POST /projects rejects non-string threeDModel.fileUrl with 400 (B5)", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          title: "Bad 3D Proj",
          category: "web",
          description: "Testing bad 3d fileUrl",
          image: "https://example.com/banner.png",
          startDate: "2023-01-01",
          status: "active",
          threeDModel: { fileUrl: 12345 },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/threeDModel.*fileUrl.*valid http/i);
    });

    it("PUT /projects/:id rejects threeDModel string 'null' with 400 (B6)", async () => {
      const proj = await Project.create({
        title: "3D Null Proj",
        slug: "3d-null-proj",
        category: "web",
        description: "Testing 3d null string",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ threeDModel: "null" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/threeDModel.*null/i);
    });

    it("POST /people rejects null or non-string name with 400 (D10)", async () => {
      const res1 = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: null, profilePicUrl: "https://example.com/p.png" });

      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post("/api/v1/people")
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: 12345, profilePicUrl: "https://example.com/p.png" });

      expect(res2.status).toBe(400);
    });

    it("PUT /people/:id rejects null or non-string name with 400 (D11)", async () => {
      const person = await Person.create({
        name: "Valid Person",
        profilePicUrl: "https://example.com/p.png",
      });

      const res1 = await request(app)
        .put(`/api/v1/people/${person._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: null });

      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put(`/api/v1/people/${person._id}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ name: 12345 });

      expect(res2.status).toBe(400);
    });

    it("POST /experiences rejects positions containing null or non-array (D13)", async () => {
      const res1 = await request(app)
        .post("/api/v1/experiences")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          organization: "Test Org",
          type: "full_time",
          tag: "focus",
          iconUrl: "https://example.com/icon.png",
          positions: "Lead Developer",
        });

      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/positions/i);

      const res2 = await request(app)
        .post("/api/v1/experiences")
        .set("Authorization", "Bearer test-secret-token")
        .send({
          organization: "Test Org 2",
          type: "full_time",
          tag: "focus",
          iconUrl: "https://example.com/icon.png",
          positions: [null],
        });

      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/positions/i);
    });

    it("PUT /projects/:slug/versions/:id rejects non-string media URLs without casting to string", async () => {
      const verId = new Types.ObjectId();
      const proj = await Project.create({
        title: "Version Bad Media Proj",
        slug: "ver-bad-media-proj",
        category: "web",
        description: "Bad media test",
        image: "https://example.com/banner.png",
        startDate: new Date("2023-01-01"),
        status: "active",
        versions: [
          { _id: verId, versionTag: "v1.0", releaseDate: new Date(), changelog: [] },
        ],
      });

      const res = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${verId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ image: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/image must be a valid http or https URL/i);

      const res2 = await request(app)
        .put(`/api/v1/projects/${proj.slug}/versions/${verId}`)
        .set("Authorization", "Bearer test-secret-token")
        .send({ videoDemo: true });

      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/videoDemo must be a valid http or https URL/i);
    });
  });
});
