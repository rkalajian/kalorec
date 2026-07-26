import { describe, it, expect } from "vitest";
import { encryptSession, decryptSession, type Session } from "../../src/lib/session";

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
