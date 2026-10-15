import mongoose from "mongoose";
import { Skill } from "@/models/Skill";
import { Achievement } from "@/models/Achievement";
import { Experience } from "@/models/Experience";
import { Certificate } from "@/models/Certificate";
import { Project } from "@/models/Project";
import { SiteConfig } from "@/models/SiteConfig";

/**
 * These tests validate Mongoose schema definitions using `document.validate()`
 * and `document.validateSync()`, which do NOT require a live MongoDB connection.
 * This ensures portability across all environments (including NixOS).
 */

// ─── Skill Model ─────────────────────────────────────────────────────────────

describe("Skill Model", () => {
  const validSkillData = {
    name: "TypeScript",
    logoUrl: "https://cdn.example.com/skills/typescript.png",
  };

  it("validates a well-formed skill document", () => {
    const skill = new Skill(validSkillData);
    const error = skill.validateSync();
    expect(error).toBeUndefined();
  });

  it("has correct default values for featured and weight", () => {
    const skill = new Skill(validSkillData);
    expect(skill.featured).toBe(false);
    expect(skill.weight).toBe(0);
  });

  it("accepts custom featured and weight values", () => {
    const skill = new Skill({ ...validSkillData, featured: true, weight: 10 });
    expect(skill.featured).toBe(true);
    expect(skill.weight).toBe(10);
    expect(skill.validateSync()).toBeUndefined();
  });

  it("fails validation when name is missing", () => {
    const skill = new Skill({ logoUrl: "https://cdn.example.com/logo.png" });
    const error = skill.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.name).toBeDefined();
  });

  it("fails validation when logoUrl is missing", () => {
    const skill = new Skill({ name: "React" });
    const error = skill.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.logoUrl).toBeDefined();
  });

  it("trims the name field", () => {
    const skill = new Skill({
      name: "  React  ",
      logoUrl: "https://cdn.example.com/react.png",
    });
    expect(skill.name).toBe("React");
  });

  it("sets the correct model name", () => {
    expect(Skill.modelName).toBe("Skill");
  });

  it("has unique index on name", () => {
    const nameIndex = Skill.schema.path("name");
    expect((nameIndex as unknown as { options: { unique: boolean } }).options.unique).toBe(true);
  });
});

// ─── Achievement Model ───────────────────────────────────────────────────────

describe("Achievement Model", () => {
  const validAchievementData = {
    title: "Dean's List",
    date: "May 2025",
    detail: "Achieved a GPA of 3.9 in the spring semester.",
  };

  it("validates a well-formed achievement document", () => {
    const achievement = new Achievement(validAchievementData);
    const error = achievement.validateSync();
    expect(error).toBeUndefined();
  });

  it("defaults weight to 0", () => {
    const achievement = new Achievement(validAchievementData);
    expect(achievement.weight).toBe(0);
  });

  it("accepts a custom weight", () => {
    const achievement = new Achievement({ ...validAchievementData, weight: 5 });
    expect(achievement.weight).toBe(5);
    expect(achievement.validateSync()).toBeUndefined();
  });

  it("fails validation when title is missing", () => {
    const doc = new Achievement({ date: "May 2025", detail: "some detail" });
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.title).toBeDefined();
  });

  it("fails validation when date is missing", () => {
    const doc = new Achievement({ title: "Award", detail: "some detail" });
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.date).toBeDefined();
  });

  it("fails validation when detail is missing", () => {
    const doc = new Achievement({ title: "Award", date: "May 2025" });
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.detail).toBeDefined();
  });

  it("trims the title field", () => {
    const doc = new Achievement({ ...validAchievementData, title: "  Trimmed  " });
    expect(doc.title).toBe("Trimmed");
  });

  it("sets the correct model name", () => {
    expect(Achievement.modelName).toBe("Achievement");
  });
});

// ─── Experience Model ────────────────────────────────────────────────────────

describe("Experience Model", () => {
  const validExperienceData = {
    organization: "Tech Corp",
    tag: "focus" as const,
    type: "internship" as const,
    iconUrl: "https://cdn.example.com/icons/techcorp.png",
    positions: [
      {
        position: "Software Engineering Intern",
        description: "Worked on backend services using Node.js.",
        startDate: new Date("2024-06-01"),
        endDate: new Date("2024-12-01"),
        mediaUrls: [],
        certificateUrls: [],
        isCurrent: false,
      },
    ],
  };

  it("validates a well-formed experience document", () => {
    const experience = new Experience(validExperienceData);
    const error = experience.validateSync();
    expect(error).toBeUndefined();
  });

  it("has correct field values after construction", () => {
    const experience = new Experience(validExperienceData);
    expect(experience.organization).toBe("Tech Corp");
    expect(experience.tag).toBe("focus");
    expect(experience.type).toBe("internship");
    expect(experience.iconUrl).toBe(validExperienceData.iconUrl);
    expect(experience.weight).toBe(0);
    expect(experience.positions).toHaveLength(1);
    expect(experience.positions[0].position).toBe("Software Engineering Intern");
    expect(experience.positions[0].isCurrent).toBe(false);
  });


  it("rejects invalid tag enum value", () => {
    const doc = new Experience({ ...validExperienceData, tag: "invalid_tag" });
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.tag).toBeDefined();
  });

  it("rejects invalid type enum value", () => {
    const doc = new Experience({ ...validExperienceData, type: "invalid_type" });
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.type).toBeDefined();
  });

  it("accepts all valid tag values", () => {
    for (const tag of ["focus", "extracurricular"] as const) {
      const doc = new Experience({ ...validExperienceData, tag });
      expect(doc.validateSync()).toBeUndefined();
    }
  });

  it("accepts all valid type values", () => {
    const validTypes = [
      "internship", "contract", "freelance",
      "full_time", "part_time", "club", "volunteering",
    ] as const;
    for (const type of validTypes) {
      const doc = new Experience({ ...validExperienceData, type });
      expect(doc.validateSync()).toBeUndefined();
    }
  });

  it("defaults weight to 0", () => {
    const experience = new Experience(validExperienceData);
    expect(experience.weight).toBe(0);
  });

  it("stores skill ObjectId references", () => {
    const skillId = new mongoose.Types.ObjectId();
    const experience = new Experience({
      ...validExperienceData,
      skills: [skillId],
    });
    expect(experience.skills).toHaveLength(1);
    expect(experience.skills[0].toString()).toBe(skillId.toString());
    expect(experience.validateSync()).toBeUndefined();
  });

  it("defaults isCurrent to false in position subdocument", () => {
    const experience = new Experience({
      ...validExperienceData,
      positions: [
        {
          position: "Junior Dev",
          description: "Started as junior.",
          startDate: new Date("2024-01-01"),
        },
      ],
    });
    expect(experience.positions[0].isCurrent).toBe(false);
  });

  it("fails validation when position is missing in position subdocument", () => {
    const experience = new Experience({
      ...validExperienceData,
      positions: [
        {
          description: "Missing position title",
          startDate: new Date("2024-01-01"),
        },
      ],
    });
    const error = experience.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors["positions.0.position"]).toBeDefined();
  });


  it("fails validation when organization is missing", () => {
    const { organization: _org, ...noOrg } = validExperienceData;
    const doc = new Experience(noOrg);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.organization).toBeDefined();
  });

  it("fails validation when iconUrl is missing", () => {
    const { iconUrl: _icon, ...noIcon } = validExperienceData;
    const doc = new Experience(noIcon);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.iconUrl).toBeDefined();
  });

  it("fails validation when tag is missing", () => {
    const { tag: _tag, ...noTag } = validExperienceData;
    const doc = new Experience(noTag);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.tag).toBeDefined();
  });

  it("fails validation when type is missing", () => {
    const { type: _type, ...noType } = validExperienceData;
    const doc = new Experience(noType);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.type).toBeDefined();
  });

  it("trims organization field", () => {
    const doc = new Experience({ ...validExperienceData, organization: "  Trimmed Org  " });
    expect(doc.organization).toBe("Trimmed Org");
  });

  it("sets the correct model name", () => {
    expect(Experience.modelName).toBe("Experience");
  });
});

// ─── Certificate Model ──────────────────────────────────────────────────────

describe("Certificate Model", () => {
  const validCertificateData = {
    title: "AWS Solutions Architect",
    description: "Professional certification for cloud architecture.",
    mediaUrl: "https://cdn.example.com/certs/aws-sa.pdf",
    organization: "Amazon Web Services",
  };

  it("validates a well-formed certificate document", () => {
    const cert = new Certificate(validCertificateData);
    const error = cert.validateSync();
    expect(error).toBeUndefined();
  });

  it("has correct field values after construction", () => {
    const cert = new Certificate(validCertificateData);
    expect(cert.title).toBe("AWS Solutions Architect");
    expect(cert.description).toBe(validCertificateData.description);
    expect(cert.mediaUrl).toBe(validCertificateData.mediaUrl);
    expect(cert.organization).toBe("Amazon Web Services");
    expect(cert.weight).toBe(0);
    expect(cert.link).toBeUndefined();
  });

  it("accepts optional link field", () => {
    const cert = new Certificate({
      ...validCertificateData,
      link: "https://aws.amazon.com/verify/12345",
    });
    expect(cert.link).toBe("https://aws.amazon.com/verify/12345");
    expect(cert.validateSync()).toBeUndefined();
  });

  it("fails validation when title is missing", () => {
    const { title: _t, ...noTitle } = validCertificateData;
    const doc = new Certificate(noTitle);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.title).toBeDefined();
  });

  it("fails validation when description is missing", () => {
    const { description: _d, ...noDesc } = validCertificateData;
    const doc = new Certificate(noDesc);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.description).toBeDefined();
  });

  it("fails validation when mediaUrl is missing", () => {
    const { mediaUrl: _m, ...noMedia } = validCertificateData;
    const doc = new Certificate(noMedia);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.mediaUrl).toBeDefined();
  });

  it("fails validation when organization is missing", () => {
    const { organization: _o, ...noOrg } = validCertificateData;
    const doc = new Certificate(noOrg);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.organization).toBeDefined();
  });

  it("defaults weight to 0", () => {
    const cert = new Certificate(validCertificateData);
    expect(cert.weight).toBe(0);
  });

  it("trims title and organization", () => {
    const cert = new Certificate({
      ...validCertificateData,
      title: "  Trimmed Title  ",
      organization: "  Trimmed Org  ",
    });
    expect(cert.title).toBe("Trimmed Title");
    expect(cert.organization).toBe("Trimmed Org");
  });

  it("sets the correct model name", () => {
    expect(Certificate.modelName).toBe("Certificate");
  });
});

// ─── Project Model (skills addition) ────────────────────────────────────────

describe("Project Model - Skills Reference", () => {
  it("accepts skills ObjectId references in construction", () => {
    const skillId1 = new mongoose.Types.ObjectId();
    const skillId2 = new mongoose.Types.ObjectId();

    const project = new Project({
      title: "Portfolio Website",
      slug: "portfolio-website",
      category: "web",
      description: "A personal portfolio website.",
      image: "https://cdn.example.com/portfolio.png",
      startDate: new Date("2024-01-01"),
      skills: [skillId1, skillId2],
    });

    expect(project.skills).toHaveLength(2);
    expect(project.skills[0].toString()).toBe(skillId1.toString());
    expect(project.skills[1].toString()).toBe(skillId2.toString());
    expect(project.validateSync()).toBeUndefined();
  });

  it("defaults to an empty skills array", () => {
    const project = new Project({
      title: "Another Project",
      slug: "another-project",
      category: "mobile",
      description: "A mobile app.",
      image: "https://cdn.example.com/app.png",
      startDate: new Date("2024-06-01"),
    });

    expect(project.skills).toBeDefined();
    expect(project.skills).toHaveLength(0);
  });

  it("has the skills schema path defined with ObjectId ref", () => {
    const skillsPath = Project.schema.path("skills");
    expect(skillsPath).toBeDefined();
    // Verify it's an array path containing ObjectId refs
    const schemaType = (skillsPath as mongoose.Schema.Types.Array).caster;
    expect(schemaType).toBeDefined();
    expect((schemaType as unknown as { options: { ref: string } }).options.ref).toBe("Skill");
  });
});

// ─── SiteConfig Model ────────────────────────────────────────────────────────

describe("SiteConfig Model", () => {
  const validConfigData = {
    name: "Shibraj Das",
    jobTitles: ["Full-Stack Developer", "Low-Level Developer", "Game Developer"],
    resumeDriveUrl: "https://drive.google.com/resume",
    statusMessage: "Building systems...",
    bioSummary: "Full stack engineer specializing in distributed systems.",
  };

  it("validates a well-formed site config document with all required fields", () => {
    const config = new SiteConfig(validConfigData);
    const error = config.validateSync();
    expect(error).toBeUndefined();
    expect(config.name).toBe("Shibraj Das");
    expect(config.jobTitles).toEqual([
      "Full-Stack Developer",
      "Low-Level Developer",
      "Game Developer",
    ]);
    expect(config.resumeDriveUrl).toBe("https://drive.google.com/resume");
    expect(config.statusMessage).toBe("Building systems...");
    expect(config.bioSummary).toBe("Full stack engineer specializing in distributed systems.");
    expect(config.pfpUrl).toBeUndefined();
    expect(config.pfpPublicId).toBeUndefined();
  });

  it("accepts optional pfpUrl and pfpPublicId", () => {
    const config = new SiteConfig({
      ...validConfigData,
      pfpUrl: "https://res.cloudinary.com/demo/image/upload/pfp.png",
      pfpPublicId: "portfolio/site_config/pfp_123456",
    });

    expect(config.validateSync()).toBeUndefined();
    expect(config.pfpUrl).toBe("https://res.cloudinary.com/demo/image/upload/pfp.png");
    expect(config.pfpPublicId).toBe("portfolio/site_config/pfp_123456");
  });

  it("defaults pfpHistory to an empty array", () => {
    const config = new SiteConfig(validConfigData);
    expect(config.pfpHistory).toBeDefined();
    expect(config.pfpHistory).toEqual([]);
  });

  it("accepts valid pfpHistory items", () => {
    const uploadedAt = new Date("2026-01-01T00:00:00.000Z");
    const config = new SiteConfig({
      ...validConfigData,
      pfpHistory: [
        {
          url: "https://res.cloudinary.com/demo/image/upload/pfp1.png",
          publicId: "portfolio/site_config/pfp_1",
          uploadedAt,
        },
      ],
    });

    expect(config.validateSync()).toBeUndefined();
    expect(config.pfpHistory).toHaveLength(1);
    expect(config.pfpHistory![0].publicId).toBe("portfolio/site_config/pfp_1");
    expect(config.pfpHistory![0].url).toBe("https://res.cloudinary.com/demo/image/upload/pfp1.png");
  });


  it("fails validation on empty document without injecting schema defaults", () => {
    const doc = new SiteConfig({});
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.name).toBeDefined();
    expect(error!.errors.jobTitles).toBeDefined();
    expect(error!.errors.resumeDriveUrl).toBeDefined();
    expect(error!.errors.statusMessage).toBeDefined();
    expect(error!.errors.bioSummary).toBeDefined();
  });

  it("fails validation when name is missing", () => {
    const { name: _n, ...noName } = validConfigData;
    const doc = new SiteConfig(noName);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.name).toBeDefined();
  });

  it("fails validation when jobTitles is missing", () => {
    const { jobTitles: _j, ...noJobTitles } = validConfigData;
    const doc = new SiteConfig(noJobTitles);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.jobTitles).toBeDefined();
  });

  it("fails validation when resumeDriveUrl is missing", () => {
    const { resumeDriveUrl: _r, ...noResume } = validConfigData;
    const doc = new SiteConfig(noResume);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.resumeDriveUrl).toBeDefined();
  });

  it("fails validation when statusMessage is missing", () => {
    const { statusMessage: _s, ...noStatus } = validConfigData;
    const doc = new SiteConfig(noStatus);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.statusMessage).toBeDefined();
  });

  it("fails validation when bioSummary is missing", () => {
    const { bioSummary: _b, ...noBio } = validConfigData;
    const doc = new SiteConfig(noBio);
    const error = doc.validateSync();
    expect(error).toBeDefined();
    expect(error!.errors.bioSummary).toBeDefined();
  });

  it("sets the correct model name", () => {
    expect(SiteConfig.modelName).toBe("SiteConfig");
  });
});


// ─── Barrel Export ───────────────────────────────────────────────────────────


describe("Models barrel export (src/models/index.ts)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const barrel = require("@/models/index");

  it("exports Project model", () => {
    expect(barrel.Project).toBeDefined();
    expect(barrel.Project.modelName).toBe("Project");
  });

  it("exports Skill model", () => {
    expect(barrel.Skill).toBeDefined();
    expect(barrel.Skill.modelName).toBe("Skill");
  });

  it("exports Achievement model", () => {
    expect(barrel.Achievement).toBeDefined();
    expect(barrel.Achievement.modelName).toBe("Achievement");
  });

  it("exports Experience model", () => {
    expect(barrel.Experience).toBeDefined();
    expect(barrel.Experience.modelName).toBe("Experience");
  });

  it("exports Certificate model", () => {
    expect(barrel.Certificate).toBeDefined();
    expect(barrel.Certificate.modelName).toBe("Certificate");
  });

  it("exports SiteConfig model", () => {
    expect(barrel.SiteConfig).toBeDefined();
    expect(barrel.SiteConfig.modelName).toBe("SiteConfig");
  });

  it("exports LogEntry model", () => {
    expect(barrel.LogEntry).toBeDefined();
    expect(barrel.LogEntry.modelName).toBe("LogEntry");
  });
});
