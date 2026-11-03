import { clearLegacyContributors } from "../scripts/clear-legacy-contributors";
import { Project } from "@/models/Project";

jest.mock("@/models/Project", () => ({
  Project: {
    find: jest.fn(),
  },
}));

jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

describe("Clear Legacy Contributors Script Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dry run identifies legacy contributors and does not save any changes", async () => {
    const mockSave1 = jest.fn();
    const mockSave2 = jest.fn();

    const mockProjects = [
      {
        slug: "proj-with-legacy",
        contributors: [
          { name: "Legacy Dev 1", profilePicUrl: "https://example.com/1.png" },
          { name: "Legacy Dev 2", profilePicUrl: "https://example.com/2.png" },
        ],
        versions: [
          {
            versionTag: "v1.0.0",
            contributors: [{ name: "Legacy Version Dev", profilePicUrl: "https://example.com/3.png" }],
          },
        ],
        save: mockSave1,
      },
      {
        slug: "clean-project",
        contributors: [{ contributor: "60c72b2f9b1d8b2bad000001", role: "lead" }],
        versions: [
          {
            versionTag: "v1.0.0",
            contributors: [],
          },
        ],
        save: mockSave2,
      },
    ];

    (Project.find as jest.Mock).mockResolvedValue(mockProjects);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await clearLegacyContributors({ apply: false });

    expect(result.affectedProjects).toHaveLength(1);
    expect(result.affectedProjects[0].slug).toBe("proj-with-legacy");
    expect(result.affectedProjects[0].legacyProjectContributors).toEqual(["Legacy Dev 1", "Legacy Dev 2"]);
    expect(result.affectedProjects[0].versions[0].legacyContributors).toEqual(["Legacy Version Dev"]);
    expect(mockSave1).not.toHaveBeenCalled();
    expect(mockSave2).not.toHaveBeenCalled();

    // Data was not modified in dry run
    expect(mockProjects[0].contributors).toHaveLength(2);

    logSpy.mockRestore();
  });

  it("--apply clears legacy contributors and saves affected projects", async () => {
    const mockSave = jest.fn().mockResolvedValue(true);

    const mockProject = {
      slug: "proj-to-clean",
      contributors: [
        { name: "Legacy Dev", profilePicUrl: "https://example.com/1.png" },
      ],
      versions: [
        {
          versionTag: "v2.0.0",
          contributors: [{ name: "Legacy Ver Dev", profilePicUrl: "https://example.com/2.png" }],
        },
      ],
      save: mockSave,
    };

    (Project.find as jest.Mock).mockResolvedValue([mockProject]);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await clearLegacyContributors({ apply: true });

    expect(result.applied).toBe(true);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockProject.contributors).toEqual([]);
    expect(mockProject.versions[0].contributors).toEqual([]);

    logSpy.mockRestore();
  });
});
