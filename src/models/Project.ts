import { Schema, model, Document, Types } from "mongoose";

export interface ISocialLink { platform: string; url: string; }
export interface IProjectContributor {
  contributor?: Types.ObjectId;
  role?: string;
}
export type IContributor = IProjectContributor;
export interface IGalleryImage {
  _id?: Types.ObjectId;
  url: string;
  tags: string[];
  caption: string;
}
export interface IProjectVersion {
  _id?: Types.ObjectId;
  versionTag: string;
  releaseDate: Date;
  changelog: string[];
  image?: string;
  videoDemo?: string;
  demoUrl?: string;
  threeDFileUrl?: string;
  isLatest: boolean;
  gallery: IGalleryImage[];
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  deployedLink?: string;
  githubLink?: string;
  contributors?: IProjectContributor[];
  socialLinks?: ISocialLink[];
  host?: "self" | "people";
  hostedBy?: Types.ObjectId[];
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
  contributors: IProjectContributor[];
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
  gallery: IGalleryImage[];
  host: "self" | "people";
  hostedBy: Types.ObjectId[];
  forkedFrom: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectContributorSchema = new Schema<IProjectContributor>(
  {
    contributor: { type: Schema.Types.ObjectId, ref: "Person" },
    role: { type: String, trim: true, maxlength: 40 },
  },
  { _id: false, strict: false }
);

const SocialLinkSchema = new Schema<ISocialLink>(
  {
    platform: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const GalleryImageSchema = new Schema<IGalleryImage>({
  url: { type: String, required: true },
  tags: { type: [String], default: [] },
  caption: { type: String, default: "" },
});

const VersionSchema = new Schema<IProjectVersion>(
  {
    versionTag: { type: String, required: true },
    releaseDate: { type: Date, default: Date.now },
    changelog: [{ type: String }],
    image: { type: String },
    videoDemo: { type: String },
    demoUrl: { type: String },
    threeDFileUrl: { type: String },
    isLatest: { type: Boolean, default: false },
    gallery: { type: [GalleryImageSchema], default: [] },
    status: {
      type: String,
      enum: ["invisible", "planning", "work_in_progress", "delay_hold", "active"],
    },
    startDate: { type: Date },
    endDate: { type: Date },
    deployedLink: { type: String },
    githubLink: { type: String },
    contributors: { type: [ProjectContributorSchema], default: undefined },
    socialLinks: { type: [SocialLinkSchema], default: undefined },
    host: { type: String, enum: ["self", "people"], default: undefined },
    hostedBy: { type: [{ type: Schema.Types.ObjectId, ref: "Person" }], default: undefined },
  },
  { strict: false }
);

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
  contributors: { type: [ProjectContributorSchema], default: [] },
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
  gallery: { type: [GalleryImageSchema], default: [] },
  host: { type: String, enum: ["self", "people"], default: "self" },
  hostedBy: [{ type: Schema.Types.ObjectId, ref: "Person" }],
  forkedFrom: { type: String, default: null },
}, { timestamps: true, strict: false });

export const Project = model<IProject>("Project", ProjectSchema);
