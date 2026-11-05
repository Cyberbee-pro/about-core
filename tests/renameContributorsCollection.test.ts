import mongoose from "mongoose";
import { renameContributorsCollection } from "../scripts/rename-contributors-collection";

jest.mock("@/config/db", () => ({
  connectDB: jest.fn().mockResolvedValue({}),
  disconnectDB: jest.fn().mockResolvedValue(undefined),
}));

describe("renameContributorsCollection Script Tests", () => {
  let mockListCollections: jest.Mock;
  let mockContributorsCollection: { countDocuments: jest.Mock; rename: jest.Mock };
  let mockPeopleCollection: { countDocuments: jest.Mock };
  let mockDb: {
    listCollections: jest.Mock;
    collection: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockContributorsCollection = {
      countDocuments: jest.fn().mockResolvedValue(5),
      rename: jest.fn().mockResolvedValue({}),
    };
    mockPeopleCollection = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    mockListCollections = jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { name: "contributors" },
        { name: "projects" },
      ]),
    });

    mockDb = {
      listCollections: mockListCollections,
      collection: jest.fn().mockImplementation((name: string) => {
        if (name === "contributors") return mockContributorsCollection;
        if (name === "people") return mockPeopleCollection;
        return { countDocuments: jest.fn().mockResolvedValue(0) };
      }),
    };

    Object.defineProperty(mongoose.connection, "db", {
      value: mockDb,
      configurable: true,
      writable: true,
    });
  });

  it("dry run prints counts and does not rename collection", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await renameContributorsCollection({ apply: false });

    expect(result.applied).toBe(false);
    expect(result.renamed).toBe(false);
    expect(result.contributorsCount).toBe(5);
    expect(result.peopleCount).toBe(0);
    expect(mockContributorsCollection.rename).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[DRY RUN] Found 5 document(s) in 'contributors' and 0 document(s) in 'people'")
    );

    logSpy.mockRestore();
  });

  it("--apply renames 'contributors' collection to 'people'", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await renameContributorsCollection({ apply: true });

    expect(result.applied).toBe(true);
    expect(result.renamed).toBe(true);
    expect(result.contributorsCount).toBe(5);
    expect(mockContributorsCollection.rename).toHaveBeenCalledWith("people");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[APPLIED] Successfully renamed 'contributors' (5 document(s)) to 'people'")
    );

    logSpy.mockRestore();
  });

  it("refuses to run if 'people' collection already exists and has documents", async () => {
    mockListCollections.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { name: "contributors" },
        { name: "people" },
      ]),
    });
    mockPeopleCollection.countDocuments.mockResolvedValue(3);

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(renameContributorsCollection({ apply: true })).rejects.toThrow(
      /Refusing to rename: 'people' collection already exists and contains 3 document\(s\)/
    );

    expect(mockContributorsCollection.rename).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
