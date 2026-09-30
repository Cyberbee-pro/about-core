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