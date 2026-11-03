import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from "../src/config/db";
import { Project } from "../src/models/Project";

export interface ClearLegacyResult {
  affectedProjects: Array<{
    slug: string;
    legacyProjectContributors: string[];
    versions: Array<{
      versionTag: string;
      legacyContributors: string[];
    }>;
  }>;
  applied: boolean;
}

export async function clearLegacyContributors(options: { apply?: boolean } = {}): Promise<ClearLegacyResult> {
  const isApply = Boolean(options.apply ?? process.argv.includes("--apply"));

  const projects = await Project.find();
  const affectedProjects: ClearLegacyResult["affectedProjects"] = [];

  for (const project of projects) {
    let projectModified = false;
    const legacyProjectContributors: string[] = [];

    if (Array.isArray(project.contributors)) {
      for (const c of project.contributors as unknown as Array<Record<string, unknown>>) {
        if (!c.contributor && (c.name || c.profilePicUrl)) {
          legacyProjectContributors.push(String(c.name || "Unnamed"));
        }
      }
    }

    const affectedVersions: Array<{ versionTag: string; legacyContributors: string[] }> = [];

    if (Array.isArray(project.versions)) {
      for (const v of project.versions as unknown as Array<Record<string, unknown>>) {
        const legacyVerNames: string[] = [];
        if (Array.isArray(v.contributors)) {
          for (const c of v.contributors as Array<Record<string, unknown>>) {
            if (!c.contributor && (c.name || c.profilePicUrl)) {
              legacyVerNames.push(String(c.name || "Unnamed"));
            }
          }
        }
        if (legacyVerNames.length > 0) {
          affectedVersions.push({
            versionTag: String(v.versionTag || "unknown"),
            legacyContributors: legacyVerNames,
          });
          if (isApply) {
            v.contributors = [];
            projectModified = true;
          }
        }
      }
    }

    if (legacyProjectContributors.length > 0) {
      if (isApply) {
        project.contributors = [];
        projectModified = true;
      }
    }

    if (legacyProjectContributors.length > 0 || affectedVersions.length > 0) {
      affectedProjects.push({
        slug: project.slug,
        legacyProjectContributors,
        versions: affectedVersions,
      });

      if (!isApply) {
        if (legacyProjectContributors.length > 0) {
          console.log(
            `[DRY RUN] Would clear ${legacyProjectContributors.length} legacy contributor(s) from project "${project.slug}": ${legacyProjectContributors.join(", ")}`
          );
        }
        for (const ver of affectedVersions) {
          console.log(
            `[DRY RUN] Would clear ${ver.legacyContributors.length} legacy contributor(s) from project "${project.slug}" version "${ver.versionTag}": ${ver.legacyContributors.join(", ")}`
          );
        }
      } else if (projectModified) {
        await project.save();
        console.log(`[APPLIED] Cleared legacy contributors from project "${project.slug}".`);
      }
    }
  }

  if (!isApply) {
    console.log(
      `\nDry run completed. ${affectedProjects.length} project(s) affected. To apply changes, re-run with --apply.`
    );
  } else {
    console.log(`\nApplied changes to ${affectedProjects.length} project(s).`);
  }

  return {
    affectedProjects,
    applied: isApply,
  };
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await clearLegacyContributors();
    } catch (err) {
      console.error("Failed to run clearLegacyContributors:", err);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  })();
}
