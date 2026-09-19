import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface RepoRef {
  owner: string;
  name: string;
  branch: string;
  private: boolean;
}

export interface Session {
  githubLogin: string;
  accessToken: string;
  repo: RepoRef | null;
  sharingRepo?: RepoRef | null;
}

export const SESSION_COOKIE = "session";
export const OAUTH_STATE_COOKIE = "oauth_state";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSession(session: Session, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSession(token: string, secret: string): Session | null {
  try {
    const [ivPart, tagPart, dataPart] = token.split(".");
    if (!ivPart || !tagPart || !dataPart) return null;
    const key = deriveKey(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString("utf-8"));
    if (typeof parsed.githubLogin !== "string" || typeof parsed.accessToken !== "string") return null;
    if (parsed.repo !== null && typeof parsed.repo !== "object") return null;
    if (parsed.sharingRepo !== undefined && parsed.sharingRepo !== null && typeof parsed.sharingRepo !== "object") return null;
    return parsed as Session;
  } catch {
    return null;
  }
}
