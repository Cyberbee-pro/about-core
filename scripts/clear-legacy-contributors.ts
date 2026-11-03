import dotenv from "dotenv";
dotenv.config();

import { connectDB, disconnectDB } from "../src/config/db";
import { Project } from "../src/models/Project";

export interface ClearLegacyResult {
  affectedProjects: Array<{
    slug: string;
    legacyProjectContributors: string[];
    keptProjectContributors?: number;
    versions: Array<{
      versionTag: string;
      legacyContributors: string[];
      keptContributors?: number;
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
    let keptProjectContributors = 0;

    if (Array.isArray(project.contributors)) {
      for (const c of project.contributors as unknown as Array<Record<string, unknown>>) {
        if (!c.contributor && (c.name || c.profilePicUrl)) {
          legacyProjectContributors.push(String(c.name || "Unnamed"));
        } else if (c.contributor) {
          keptProjectContributors++;
        }
      }
    }

    const affectedVersions: Array<{
      versionTag: string;
      legacyContributors: string[];
      keptContributors?: number;
    }> = [];

    if (Array.isArray(project.versions)) {
      for (const v of project.versions as unknown as Array<Record<string, unknown>>) {
        const legacyVerNames: string[] = [];
        let keptVerCount = 0;
        if (Array.isArray(v.contributors)) {
          for (const c of v.contributors as Array<Record<string, unknown>>) {
            if (!c.contributor && (c.name || c.profilePicUrl)) {
              legacyVerNames.push(String(c.name || "Unnamed"));
            } else if (c.contributor) {
              keptVerCount++;
            }
          }
        }
        if (legacyVerNames.length > 0) {
          affectedVersions.push({
            versionTag: String(v.versionTag || "unknown"),
            legacyContributors: legacyVerNames,
            keptContributors: keptVerCount,
          });
          if (isApply) {
            v.contributors = (v.contributors as Array<Record<string, unknown>>).filter(
              (c) => Boolean(c && c.contributor)
            );
            projectModified = true;
          }
        }
      }
    }

    if (legacyProjectContributors.length > 0) {
      if (isApply) {
        project.contributors = (project.contributors as Array<Record<string, unknown>>).filter(
          (c) => Boolean(c && c.contributor)
        );
        projectModified = true;
      }
    }

    if (legacyProjectContributors.length > 0 || affectedVersions.length > 0) {
      affectedProjects.push({
        slug: project.slug,
        legacyProjectContributors,
        keptProjectContributors,
        versions: affectedVersions,
      });

      if (!isApply) {
        if (legacyProjectContributors.length > 0) {
          console.log(
            `[DRY RUN] Would clear ${legacyProjectContributors.length} legacy contributor(s) (keeping ${keptProjectContributors} valid) from project "${project.slug}": ${legacyProjectContributors.join(", ")}`
          );
        }
        for (const ver of affectedVersions) {
          console.log(
            `[DRY RUN] Would clear ${ver.legacyContributors.length} legacy contributor(s) (keeping ${ver.keptContributors ?? 0} valid) from project "${project.slug}" version "${ver.versionTag}": ${ver.legacyContributors.join(", ")}`
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
