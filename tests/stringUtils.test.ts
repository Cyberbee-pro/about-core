import { escapeRegex } from "@/utils/stringUtils";

describe("stringUtils - escapeRegex", () => {
  it("escapes special regex characters correctly", () => {
    const raw = "C++ & C# [2024] (v1.0.0) {special} ^start $end *all ?maybe |or \\slash";
    const escaped = escapeRegex(raw);

    // Verify all special characters are prefixed with backslash
    expect(escaped).toBe(
      "C\\+\\+ & C# \\[2024\\] \\(v1\\.0\\.0\\) \\{special\\} \\^start \\$end \\*all \\?maybe \\|or \\\\slash"
    );

    // Verify it creates a valid RegExp without throwing SyntaxError
    expect(() => new RegExp(`^${escaped}$`, "i")).not.toThrow();

    // Verify it matches the original string literally
    const regex = new RegExp(`^${escaped}$`, "i");
    expect(regex.test(raw)).toBe(true);
    expect(regex.test("C-- & C# [2024] (v1.0.0) {special} ^start $end *all ?maybe |or \\slash")).toBe(false);
  });

  it("handles strings with no special characters unchanged", () => {
    const normal = "Tech Corp";
    expect(escapeRegex(normal)).toBe("Tech Corp");
    const regex = new RegExp(`^${escapeRegex(normal)}$`, "i");
    expect(regex.test("tech corp")).toBe(true);
    expect(regex.test("TECH CORP")).toBe(true);
  });

  it("safely handles tricky inputs like dots and plus signs (e.g., Node.js, C++)", () => {
    const nodeJs = "Node.js";
    const escapedNode = escapeRegex(nodeJs);
    expect(escapedNode).toBe("Node\\.js");
    const nodeRegex = new RegExp(`^${escapedNode}$`, "i");
    expect(nodeRegex.test("Node.js")).toBe(true);
    // Crucial: A raw unescaped dot would match "Nodexjs", but escaped dot must not
    expect(nodeRegex.test("Nodexjs")).toBe(false);

    const cpp = "C++";
    const escapedCpp = escapeRegex(cpp);
    expect(escapedCpp).toBe("C\\+\\+");
    const cppRegex = new RegExp(`^${escapedCpp}$`, "i");
    expect(cppRegex.test("c++")).toBe(true);
    // Crucial: Raw "C++" has quantifier "+", matching "C", "CC", "CCC", but escaped must only match "c++"
    expect(cppRegex.test("C")).toBe(false);
  });
});
