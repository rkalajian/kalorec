import { describe, it, expect } from "vitest";
import {
  encryptSession,
  decryptSession,
  requireEnv,
  SESSION_COOKIE_OPTIONS,
  type Session,
} from "../../src/lib/session";

const secret = "test-secret-value";
const session: Session = {
  githubLogin: "rob",
  accessToken: "gho_abc123",
  repo: { owner: "rob", name: "recipes", branch: "main" },
};

describe("encryptSession / decryptSession", () => {
  it("round-trips a session through encryption", () => {
    const token = encryptSession(session, secret);
    expect(decryptSession(token, secret)).toEqual(session);
  });

  it("round-trips a session with no repo chosen yet", () => {
    const noRepo: Session = { githubLogin: "rob", accessToken: "gho_abc123", repo: null };
    const token = encryptSession(noRepo, secret);
    expect(decryptSession(token, secret)).toEqual(noRepo);
  });

  it("returns null for a tampered token", () => {
    const token = encryptSession(session, secret);
    const tampered = token.slice(0, -2) + "zz";
    expect(decryptSession(tampered, secret)).toBeNull();
  });

  it("returns null when decrypted with the wrong secret", () => {
    const token = encryptSession(session, secret);
    expect(decryptSession(token, "wrong-secret")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(decryptSession("not-a-real-token", secret)).toBeNull();
    expect(decryptSession("", secret)).toBeNull();
  });
});

describe("requireEnv", () => {
  it("throws naming the variable when the value is undefined", () => {
    expect(() => requireEnv("SESSION_SECRET", undefined)).toThrow(/SESSION_SECRET/);
    expect(() => requireEnv("SESSION_SECRET", undefined)).toThrow("Missing required env var SESSION_SECRET");
  });

  it("throws naming the variable when the value is an empty string", () => {
    // An empty secret would otherwise hash to the well-known SHA-256 of "",
    // making every session cookie forgeable.
    expect(() => requireEnv("SESSION_SECRET", "")).toThrow("Missing required env var SESSION_SECRET");
    expect(() => requireEnv("GITHUB_CLIENT_ID", "")).toThrow("Missing required env var GITHUB_CLIENT_ID");
  });

  it("returns the value unchanged when it is a non-empty string", () => {
    expect(requireEnv("SESSION_SECRET", "abc123")).toBe("abc123");
  });
});

describe("SESSION_COOKIE_OPTIONS", () => {
  it("locks down the session cookie", () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(60 * 60 * 24 * 30);
    expect(SESSION_COOKIE_OPTIONS).toHaveProperty("secure");
  });
});
