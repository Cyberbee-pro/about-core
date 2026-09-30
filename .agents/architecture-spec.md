```markdown
# Database Schemas & API Specification
**Context:** Headless CMS Backend (`about-core`) for Vercel deployment.

## 1. Mongoose Models (`src/models/`)

### `Project.ts`
```typescript
import { Schema, model, Document } from "mongoose";

export interface ISocialLink { platform: string; url: string; }
export interface IContributor { name: string; profilePicUrl: string; profileLink?: string; }
export interface IProjectVersion {
  versionTag: string;
  releaseDate: Date;
  changelog: string[];
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

### `SiteConfig.ts`

```typescript
import { Schema, model, Document } from "mongoose";

export interface ISiteConfig extends Document {
  resumeDriveUrl: string;
  statusMessage: string;
  bioSummary: string;
}

const SiteConfigSchema = new Schema<ISiteConfig>({
  resumeDriveUrl: { type: String, required: true },
  statusMessage: { type: String, default: "Building systems..." },
  bioSummary: { type: String, required: true },
}, { timestamps: true });

export const SiteConfig = model<ISiteConfig>("SiteConfig", SiteConfigSchema);

```

### `LogEntry.ts`

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
  metadata?: any;
  stack?: string;
}

const LogEntrySchema = new Schema<ILogEntry>({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, enum: ["INFO", "WARN", "ERROR"], required: true },
  method: { type: String, required: true },
  endpoint: { type: String, required: true },
  statusCode: { type: Number, required: true },
  ip: { type: String, default: "unknown" },
  message: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  stack: { type: String },
}, { timestamps: false });

export const LogEntry = model<ILogEntry>("LogEntry", LogEntrySchema);

```

## 2. API Endpoints (`src/routes/`)

| Method | Route | Auth | Payload / Params | Purpose |
| --- | --- | --- | --- | --- |
| **GET** | `/api/v1/projects` | No | `?category=iot` | Fetch public projects (`status !== "invisible"`). |
| **GET** | `/api/v1/projects/categories` | No | None | Fetch unique categories (`Project.distinct("category")`). |
| **GET** | `/api/v1/projects/:slug` | No | Params: `slug` | Fetch specific project details. |
| **POST** | `/api/v1/projects` | Yes | `multipart/form-data` | Create project (handles Cloudinary media mapping). |
| **PUT** | `/api/v1/projects/:id` | Yes | `multipart/form-data` | Update project metadata or media. |
| **DELETE** | `/api/v1/projects/:id` | Yes | Params: `id` | Delete project document. |
| **POST** | `/api/v1/projects/:id/versions` | Yes | JSON: `IProjectVersion` | Push a new version to the `versions` array. |
| **GET** | `/api/v1/config` | No | None | Fetch global configuration (resume, bio). |
| **PUT** | `/api/v1/config` | Yes | JSON: `ISiteConfig` | Update global configuration. |
| **GET** | `/api/v1/admin/logs` | Yes | `?date=` or `?month=` | Query MongoDB `LogEntry` records by date range. |

