import { Schema, model, Document } from "mongoose";
import { isValidHttpUrl } from "../utils/stringUtils";

export interface IPerson {
  name: string;
  profilePicUrl: string;
  profileLink?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPersonDocument extends Document {
  name: string;
  profilePicUrl: string;
  profileLink?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PersonSchema = new Schema<IPersonDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    profilePicUrl: { type: String, required: true },
    profileLink: {
      type: String,
      default: null,
      validate: {
        validator: (val: string | null | undefined) => !val || isValidHttpUrl(val),
        message: "profileLink must be a valid http or https URL",
      },
    },
  },
  { timestamps: true }
);

export const Person = model<IPersonDocument>("Person", PersonSchema);
