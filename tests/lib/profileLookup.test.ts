import { describe, it, expect } from "vitest";
import { parseProfilePath } from "../../src/lib/profileLookup";

describe("parseProfilePath", () => {
  it("parses plain owner/repo shorthand", () => {
    expect(parseProfilePath("rob/recipes")).toBe("/u/rob/recipes");
  });

  it("trims surrounding whitespace", () => {
    expect(parseProfilePath("  rob/recipes  ")).toBe("/u/rob/recipes");
  });

  it("parses a full share URL", () => {
    expect(parseProfilePath("https://kalorec.netlify.app/u/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("parses a share URL that points at a specific recipe, ignoring the slug", () => {
    expect(parseProfilePath("https://kalorec.netlify.app/u/rob/recipes/chili")).toBe("/u/rob/recipes");
  });

  it("parses a bare /u/owner/repo path", () => {
    expect(parseProfilePath("/u/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("strips a leading scheme and host when no /u/ marker is present", () => {
    expect(parseProfilePath("https://github.com/rob/recipes")).toBe("/u/rob/recipes");
  });

  it("ignores a trailing slash", () => {
    expect(parseProfilePath("rob/recipes/")).toBe("/u/rob/recipes");
  });

  it("returns null for empty input", () => {
    expect(parseProfilePath("")).toBeNull();
    expect(parseProfilePath("   ")).toBeNull();
  });

  it("returns null when only an owner is given, no repo", () => {
    expect(parseProfilePath("rob")).toBeNull();
  });

  it("strips a query string from the repo segment", () => {
    expect(parseProfilePath("https://kalorec.netlify.app/u/rob/recipes?ref=x")).toBe("/u/rob/recipes");
  });

  it("strips a fragment from the repo segment", () => {
    expect(parseProfilePath("rob/recipes#section")).toBe("/u/rob/recipes");
  });

  it("returns null for dot-segments instead of silently navigating home", () => {
    expect(parseProfilePath("../..")).toBeNull();
    expect(parseProfilePath("./.")).toBeNull();
  });

  it("returns null for a javascript: pseudo-protocol input", () => {
    expect(parseProfilePath("javascript:alert(1)")).toBeNull();
  });

  it("normalizes a protocol-relative input into a same-origin path (never off-site)", () => {
    expect(parseProfilePath("//evil.com/x")).toBe("/u/evil.com/x");
  });
});
