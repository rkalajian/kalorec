export function parseProfilePath(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  const marker = "/u/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex !== -1) {
    value = value.slice(markerIndex + marker.length);
  } else {
    value = value.replace(/^https?:\/\/[^/]+\/?/, "");
  }

  value = value.replace(/^\/+|\/+$/g, "");
  const parts = value.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts;
  return `/u/${owner}/${repo}`;
}
