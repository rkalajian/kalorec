import { getStore } from "@netlify/blobs";

const STORE_NAME = "kalorec-login-users";

function loginStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

/** GitHub's numeric user ID stays stable when a login name changes. */
export async function recordLogin(githubUserId: number): Promise<void> {
  if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) {
    throw new Error("Invalid GitHub user ID");
  }
  await loginStore().set(String(githubUserId), "1");
}

export async function getUniqueLoginCount(): Promise<number | null> {
  try {
    const { blobs } = await loginStore().list();
    return blobs.length;
  } catch (error) {
    console.error("Unable to load login count", error);
    return null;
  }
}
