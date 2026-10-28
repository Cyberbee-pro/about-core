# Architecture & Database Specification

**Context:** Headless CMS Backend (`about-core`) for Vercel Serverless & Node.js Deployment.

---

## 1. Mongoose Models (`src/models/`)

### 1.1 `Project.ts`
```typescript
import { Schema, model, Document, Types } from "mongoose";

export interface ISocialLink { platform: string; url: string; }
export interface IContributor { name: string; profilePicUrl: string; profileLink?: string; }
export interface IProjectVersion {
  versionTag: string;
  releaseDate: Date;
  changelog: string[];
  image?: string;
  videoDemo?: string;
  demoUrl?: string;
  threeDFileUrl?: string;
  isLatest: boolean;
}

export type ProjectStatus = "invisible" | "planning" | "work_in_progress" | "delay_hold" | "active";

export interface IProject extends Document {
  title: string;
  slug: string;
  category: string;
  description: string;
  featured: boolean;
  tags: string[];
  skills: Types.ObjectId[];
  startDate: Date;
  endDate?: Date;
  contributors: IContributor[];
  status: ProjectStatus;
  image: string;
  videoDemo?: string;
  threeDModel?: {
    fileUrl: string;
    initialRotation?: [number, number, number];
    enableExplodedView: boolean;
  };
  deployedLink?: string;
  githubLink?: string;
  socialLinks: ISocialLink[];
  versions: IProjectVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const ContributorSchema = new Schema<IContributor>({
  name: { type: String, required: true },
  profilePicUrl: { type: String, required: true },
  profileLink: { type: String },
});

const VersionSchema = new Schema<IProjectVersion>({
  versionTag: { type: String, required: true },
  releaseDate: { type: Date, default: Date.now },
  changelog: [{ type: String }],
  image: { type: String },
  videoDemo: { type: String },
  demoUrl: { type: String },
  threeDFileUrl: { type: String },
  isLatest: { type: Boolean, default: false },
});

const ProjectSchema = new Schema<IProject>({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  category: { type: String, required: true, lowercase: true, trim: true },
  description: { type: String, required: true },
  featured: { type: Boolean, default: false },
  tags: [{ type: String, trim: true }],
  skills: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  contributors: [ContributorSchema],
  status: {
    type: String,
    enum: ["invisible", "planning", "work_in_progress", "delay_hold", "active"],
    default: "planning",
  },
  image: { type: String, required: true },
  videoDemo: { type: String, default: null },
  socialLinks: [{ platform: { type: String, required: true }, url: { type: String, required: true } }],
  threeDModel: {
    fileUrl: { type: String, default: null },
    initialRotation: { type: [Number], default: [0, 0, 0] },
    enableExplodedView: { type: Boolean, default: false },
  },
  deployedLink: { type: String, default: null },
  githubLink: { type: String, default: null },
  versions: [VersionSchema],
}, { timestamps: true });

export const Project = model<IProject>("Project", ProjectSchema);
```

### 1.2 `SiteConfig.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export interface IPfpItem {
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface ISiteConfig extends Document {
  name: string;
  pfpUrl?: string;
  pfpPublicId?: string;
  pfpHistory?: IPfpItem[];
  jobTitles: string[];
  resumeUrl: string;
  resumePublicId?: string;
  statusMessage: string;
  bioSummary: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PfpItemSchema = new Schema<IPfpItem>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SiteConfigSchema = new Schema<ISiteConfig>(
  {
    name: { type: String, required: true },
    pfpUrl: { type: String },
    pfpPublicId: { type: String },
    pfpHistory: { type: [PfpItemSchema], default: [] },
    jobTitles: {
      type: [String],
      required: true,
      default: undefined,
      validate: {
        validator: (val: string[]) => Array.isArray(val) && val.length > 0,
        message: "jobTitles must have at least one entry",
      },
    },
    resumeUrl: { type: String, required: true },
    resumePublicId: { type: String },
    statusMessage: { type: String, required: true },
    bioSummary: { type: String, required: true },
  },
  { timestamps: true }
);

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);
```

### 1.3 `Skill.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export type SkillType = "tool" | "language" | "framework";
export const SKILL_TYPES: SkillType[] = ["tool", "language", "framework"];

export interface ISkill extends Document {
  name: string;
  type: SkillType;
  logoUrl: string; // Cloudinary path: portfolio/skills/{skill_name}/{skill_name}.jpg
  featured: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: {
        values: SKILL_TYPES,
        message: "Invalid skill type: `{VALUE}` is not supported. Allowed values: tool, language, framework",
      },
      default: "tool",
      required: true,
      trim: true,
      lowercase: true,
    },
    logoUrl: { type: String, required: true },
    featured: { type: Boolean, default: false },
    weight: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Skill = model<ISkill>("Skill", SkillSchema);
```

### 1.4 `Certificate.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export interface ICertificate extends Document {
  title: string;
  description: string;
  link?: string;
  mediaUrl: string; // Cloudinary path: portfolio/certificate/{org_title_year}.jpg
  organization: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  link: { type: String },
  mediaUrl: { type: String, required: true },
  organization: { type: String, required: true, trim: true },
  weight: { type: Number, default: 0 },
}, { timestamps: true });

export const Certificate = model<ICertificate>("Certificate", CertificateSchema);
```

### 1.5 `Achievement.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export interface IAchievement extends Document {
  title: string;
  date: string; // e.g. "Month Year"
  detail: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema = new Schema<IAchievement>({
  title: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  detail: { type: String, required: true },
  weight: { type: Number, default: 0 },
}, { timestamps: true });

export const Achievement = model<IAchievement>("Achievement", AchievementSchema);
```

### 1.6 `Experience.ts`
```typescript
import { Schema, model, Document, Types } from "mongoose";

export interface IExperiencePosition {
  position: string; // e.g., "Technical Lead", "Senior Developer"
  description: string;
  startDate: Date;
  endDate?: Date;
  mediaUrls?: string[]; // Cloudinary media assets
  certificateUrls?: string[]; // Cloudinary certificate assets
  isCurrent: boolean;
}

export type ExperienceTag = "focus" | "extracurricular";
export type ExperienceType =
  | "internship"
  | "contract"
  | "freelance"
  | "full_time"
  | "part_time"
  | "club"
  | "volunteering";

export interface IExperience extends Document {
  organization: string;
  tag: ExperienceTag;
  type: ExperienceType;
  iconUrl: string; // Cloudinary icon path
  skills: Types.ObjectId[]; // Ref to Skill model
  weight: number;
  positions: IExperiencePosition[]; // Promotion tiers & history
  createdAt: Date;
  updatedAt: Date;
}

const ExperiencePositionSchema = new Schema<IExperiencePosition>({
  position: { type: String, required: true },
  description: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  mediaUrls: [{ type: String }],
  certificateUrls: [{ type: String }],
  isCurrent: { type: Boolean, default: false },
});

const ExperienceSchema = new Schema<IExperience>({
  organization: { type: String, required: true, trim: true },
  tag: { type: String, enum: ["focus", "extracurricular"], required: true },
  type: {
    type: String,
    enum: [
      "internship",
      "contract",
      "freelance",
      "full_time",
      "part_time",
      "club",
      "volunteering",
    ],
    required: true,
  },
  iconUrl: { type: String, required: true },
  skills: [{ type: Schema.Types.ObjectId, ref: "Skill" }],
  weight: { type: Number, default: 0 },
  positions: [ExperiencePositionSchema],
}, { timestamps: true });

export const Experience = model<IExperience>("Experience", ExperienceSchema);
```

### 1.7 `LogEntry.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ILogEntry extends Document {
  timestamp: Date;
  level: LogLevel;
  method: string;
  endpoint: string;
  statusCode: number;
  ip: string;
  message: string;
  metadata?: Record<string, unknown>;
  stack?: string;
}

const LogEntrySchema = new Schema<ILogEntry>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    level: { type: String, enum: ["INFO", "WARN", "ERROR"], required: true },
    method: { type: String, required: true },
    endpoint: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ip: { type: String, default: "unknown" },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    stack: { type: String },
  },
  { timestamps: false }
);

export const LogEntry = model<ILogEntry>("LogEntry", LogEntrySchema);
```

---

## 2. API Endpoints Specification

### 2.1 Health & Dashboard
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/` or `/index.html` | No | None | Serves static Evangelion / MAGI System EVA-0 dashboard from `public/`. |
| **GET** | `/health` | No | None | Basic service liveness check (`{ status, uptime, timestamp }`). |
| **GET** | `/api/v1/health` | No | None | JSON API telemetry: DB connection status, memory, version, and env. |

### 2.2 Projects (`/api/v1/projects`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/projects` | No | Query: `category`, `featured`, `tag` | Fetch public projects (`status !== "invisible"`). |
| **GET** | `/api/v1/projects/categories` | No | None | Fetch unique categories (`Project.distinct("category")`). |
| **GET** | `/api/v1/projects/:slug` | Optional* | Params: `slug` | Fetch project details. Drafts visible only with `ADMIN_SECRET`. |
| **POST** | `/api/v1/projects` | Yes | Multipart / JSON: `IProject` | Create project (Multer streams `image`, `videoDemo`, `threeDModel`). |
| **PUT** | `/api/v1/projects/:id` | Yes | Multipart / JSON: `Partial<IProject>` | Update project metadata or media by ObjectId. |
| **DELETE** | `/api/v1/projects/:id` | Yes | Params: `id` | Delete project document (preserves Cloudinary assets). |
| **POST** | `/api/v1/projects/:slug/versions` | Yes | Multipart / JSON: `IProjectVersion` | Push new release version to `versions` array (single-truth `isLatest`). |
| **GET** | `/api/v1/admin/projects` | Yes | Query: `status`, `category`, `featured`, `tag` | Fetch all projects from database without status restrictions (including invisible/draft). |

### 2.3 Skills (`/api/v1/skills`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/skills` | No | Query: `type` (optional) | Fetch all skills sorted by `{ weight: 1, name: 1 }`, optionally filtered by type. |
| **GET** | `/api/v1/skills/:id` | No | Params: `id` | Fetch single skill by ObjectId. |
| **POST** | `/api/v1/skills` | Yes | Multipart / JSON: `name`, `type`, `logoUrl`, `weight` | Create skill with unique name validation and logo upload. |
| **PUT** | `/api/v1/skills/:id` | Yes | Multipart / JSON: partial fields (`name`, `type`, `logoUrl`, `featured`, `weight`) | Update skill by ObjectId. |
| **DELETE** | `/api/v1/skills/:id` | Yes | Params: `id` | Delete skill by ObjectId. |

### 2.4 Certificates (`/api/v1/certificates`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/certificates` | No | None | Fetch all certificates sorted by `{ weight: 1, title: 1 }`. |
| **GET** | `/api/v1/certificates/:id` | No | Params: `id` | Fetch single certificate by ObjectId. |
| **POST** | `/api/v1/certificates` | Yes | Multipart / JSON: `title`, `organization`, `mediaUrl` | Create certificate with unique title validation and media upload. |
| **PUT** | `/api/v1/certificates/:id` | Yes | Multipart / JSON: partial fields | Update certificate by ObjectId. |
| **DELETE** | `/api/v1/certificates/:id` | Yes | Params: `id` | Delete certificate by ObjectId. |

### 2.5 Achievements (`/api/v1/achievements`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/achievements` | No | None | Fetch all achievements sorted by `{ weight: 1, title: 1 }`. |
| **GET** | `/api/v1/achievements/:id` | No | Params: `id` | Fetch single achievement by ObjectId. |
| **POST** | `/api/v1/achievements` | Yes | JSON: `title`, `date`, `detail`, `weight` | Create achievement with unique title validation. |
| **PUT** | `/api/v1/achievements/:id` | Yes | JSON: partial fields | Update achievement by ObjectId. |
| **DELETE** | `/api/v1/achievements/:id` | Yes | Params: `id` | Delete achievement by ObjectId. |

### 2.6 Experiences (`/api/v1/experiences`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/experiences` | No | None | Fetch experiences sorted by `{ weight: 1, organization: 1 }`. |
| **GET** | `/api/v1/experiences/:id` | No | Params: `id` | Fetch single experience by ObjectId. |
| **POST** | `/api/v1/experiences` | Yes | Multipart / JSON | Create experience organization with icon, media, and certificate uploads. |
| **POST** | `/api/v1/experiences/:organization/positions` | Yes | Multipart / JSON: position payload | Append promotion/role to organization with single-truth `isCurrent`. |
| **PUT** | `/api/v1/experiences/:id` | Yes | Multipart / JSON: partial fields | Update experience by ObjectId. |
| **DELETE** | `/api/v1/experiences/:id` | Yes | Params: `id` | Delete experience by ObjectId. |

### 2.7 Site Configuration (`/api/v1/config`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/config` | No | None | Fetch global configuration (avatar, history, job titles, bio, resume). |
| **POST** | `/api/v1/config` | Yes | Multipart / JSON | Create initial config (409 if already exists). |
| **PUT** | `/api/v1/config` | Yes | Multipart / JSON | Update or upsert site config. Handles new avatar upload, resume PDF upload (`resume_date_{num}.pdf`), or history rollback. |
| **POST** | `/api/v1/config/resume` | Yes | Multipart: `resume` | Dedicated resume PDF upload endpoint saving `resumeUrl` directly to MongoDB. |

### 2.8 Admin Logs (`/api/v1/admin/logs`)
| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/admin/logs` | Yes | Query: `date`, `month`, `year`, `level`, `page`, `limit` | Query MongoDB `LogEntry` records with pagination. |

---

## 3. Middleware Architecture & Execution Sequence

Requests processed by `src/server.ts` follow this deterministic sequence:

```
Request
  │
  ├── 1. cors()                   ── Dynamic multi-origin validation against CLIENT_ORIGIN
  ├── 2. express.json()           ── Body parser for application/json payloads
  ├── 3. express.urlencoded()     ── Body parser for URL-encoded form data
  ├── 4. express.static('public') ── Edge CDN local mirror serving MAGI EVA-0 dashboard
  ├── 5. dbLoggerMiddleware       ── Intercepts res.finish and records LogEntry in MongoDB
  ├── 6. /health & /api/v1/health ── Health check routes
  ├── 7. Feature Routes           ── /api/v1/{projects, skills, certificates, achievements, experiences, config, admin/logs, admin/projects}
  │       ├── authMiddleware      ── Verifies ADMIN_SECRET (Bearer / x-admin-token)
  │       └── uploadMiddleware    ── Multer memoryStorage + Cloudinary streaming
  ├── 8. notFoundMiddleware       ── Generates 404 JSON for unmatched routes
  └── 9. errorMiddleware          ── Centralized handler mapping errors to 400, 403, 404, 409, 500
```

---

## 4. Cloudinary Media Storage Hierarchy

All media assets are buffered in memory and streamed directly to Cloudinary. Complete directory layout, sequential numbering (`<base>_1`), and Search API caching rules are detailed in [`cloudinary.md`](../cloudinary.md).

```
portfolio/
├── projects/<slug>/{images, videos, models}/
│   └── <versionTag>/{images, videos, models}/
├── skills/<skill-name>/
├── certificate/
├── experiences/<tag>/<org-slug>/{icons, media, certificates}/
├── site_config/
│   ├── pfp_<timestamp>
│   └── resume/resume_date_{num}.pdf
└── profile/ (Fallback)
```

---

## 5. Serverless & Database Design

- **Stateless Runtime**: No files are created or modified on the host runtime. All logs go to MongoDB; all media files stream directly to Cloudinary.
- **Connection Caching**: `src/config/db.ts` reuses the established Mongoose connection (`readyState === 1`) across serverless invocations, mitigating connection spikes on MongoDB Atlas.
- **Strict Query Sanitization**: User-supplied strings in regular expressions are strictly escaped via `escapeRegex()` in `src/utils/stringUtils.ts` to prevent ReDoS attacks.
