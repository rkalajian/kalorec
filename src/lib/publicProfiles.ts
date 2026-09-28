import { getStore } from "@netlify/blobs";
import { Octokit } from "@octokit/rest";
import type { RepoRef, Session } from "./session";

export interface PublicProfile {
  githubId: number;
  login: string;
  owner: string;
  repo: string;
}

const STORE_NAME = "kalorec-public-profiles";
const OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPO_PATTERN = /^[a-z\d._-]{1,100}$/i;

function profileStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function validId(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) > 0;
}

function validProfile(value: unknown): value is PublicProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return validId(profile.githubId) && typeof profile.login === "string" && OWNER_PATTERN.test(profile.login) &&
    typeof profile.owner === "string" && OWNER_PATTERN.test(profile.owner) &&
    typeof profile.repo === "string" && REPO_PATTERN.test(profile.repo);
}

export async function resolveGithubId(session: Session): Promise<number> {
  if (validId(session.githubId)) return session.githubId;
  // Existing encrypted sessions predate the numeric ID field.
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error("Unable to verify GitHub account ID");
  const user = await response.json();
  if (!validId(user?.id) || typeof user.login !== "string" ||
      user.login.toLowerCase() !== session.githubLogin.toLowerCase()) {
    throw new Error("GitHub account does not match session");
  }
  return user.id;
}

export async function savePublicProfile(githubId: number, login: string, sharingRepo: RepoRef): Promise<void> {
  const profile = { githubId, login, owner: sharingRepo.owner, repo: sharingRepo.name };
  if (!validProfile(profile) || sharingRepo.private !== false) {
    throw new Error("Invalid public profile");
  }
  await profileStore().set(String(githubId), JSON.stringify(profile));
}

export async function removePublicProfile(githubId: number): Promise<void> {
  if (!validId(githubId)) throw new Error("Invalid GitHub account ID");
  await profileStore().delete(String(githubId));
}

export async function listPublicProfiles(): Promise<PublicProfile[]> {
  const store = profileStore();
  const { blobs } = await store.list();
  const github = new Octokit();
  const profiles: PublicProfile[] = [];
  for (let index = 0; index < blobs.length; index += 5) {
    const batch = blobs.slice(index, index + 5);
    const visible = await Promise.all(batch.map(async ({ key }) => {
      if (!/^\d+$/.test(key)) return null;
      const raw = await store.get(key, { type: "text" });
      if (!raw) return null;
      let data: unknown;
      try { data = JSON.parse(raw); } catch { return null; }
      if (!validProfile(data) || String(data.githubId) !== key) return null;
      try {
        const repo = await github.repos.get({ owner: data.owner, repo: data.repo });
        return repo.data.private === false ? data : null;
      } catch (error: any) {
        if (error.status === 404) return null;
        throw error;
      }
    }));
    profiles.push(...visible.filter((profile): profile is PublicProfile => profile !== null));
  }
  return profiles.sort((a, b) => a.login.localeCompare(b.login) || a.githubId - b.githubId);
}
