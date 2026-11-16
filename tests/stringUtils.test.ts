import {
  escapeRegex,
  isValidHttpUrl,
  isHttpUrl,
  normalizeHttpUrl,
} from "@/utils/stringUtils";

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

describe("stringUtils - isValidHttpUrl & normalizeHttpUrl", () => {
  it("accepts valid https and http URLs", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://example.com")).toBe(true);
    expect(isValidHttpUrl("https://example.com/path/to/resource.png?v=1&q=test#hash")).toBe(true);
    expect(isValidHttpUrl("http://localhost:3000/api")).toBe(true);
    expect(isHttpUrl("https://example.com")).toBe(true);
  });

  it("accepts valid URLs with surrounding whitespace after trimming", () => {
    expect(isValidHttpUrl("   https://example.com/pic.png   ")).toBe(true);
    expect(normalizeHttpUrl("   https://example.com/pic.png   ")).toBe("https://example.com/pic.png");
  });

  it("rejects javascript:, data:, vbscript:, file:, ftp: URLs", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("data:text/html,x")).toBe(false);
    expect(isValidHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
  });

  it("rejects protocol-relative, relative, and non-URL strings", () => {
    expect(isValidHttpUrl("//example.com/x.png")).toBe(false);
    expect(isValidHttpUrl("/relative/path")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl("   ")).toBe(false);
  });

  it("rejects URLs with embedded whitespace or control characters", () => {
    expect(isValidHttpUrl("https://example. com")).toBe(false);
    expect(isValidHttpUrl("https://example.com/foo bar.jpg")).toBe(false);
    expect(isValidHttpUrl("https://example.com\x00/test")).toBe(false);
    expect(isValidHttpUrl("https://example.com\x1f/test")).toBe(false);
    expect(isValidHttpUrl("https://example.com\x7f/test")).toBe(false);
  });

  it("rejects non-string inputs safely", () => {
    expect(isValidHttpUrl(null)).toBe(false);
    expect(isValidHttpUrl(undefined)).toBe(false);
    expect(isValidHttpUrl(12345)).toBe(false);
    expect(isValidHttpUrl({})).toBe(false);
    expect(isValidHttpUrl([])).toBe(false);
  });

  it("normalizeHttpUrl returns trimmed string on valid URL and null on invalid", () => {
    expect(normalizeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeHttpUrl("  https://example.com  ")).toBe("https://example.com");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("not a url")).toBeNull();
    expect(normalizeHttpUrl(null)).toBeNull();
  });
});
