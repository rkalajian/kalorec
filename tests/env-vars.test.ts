import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const filesUsingCustomEnvVars = [
  "../src/middleware.ts",
  "../src/pages/api/auth/login.ts",
  "../src/pages/api/auth/callback.ts",
  "../src/pages/api/settings/repo.ts",
];

describe("custom env var references", () => {
  it("never reference a bare import.meta.env — only per-key import.meta.env.KEY", () => {
    const bareUsage = /import\.meta\.env(?!\s*\.\s*\w)/g;
    for (const relativePath of filesUsingCustomEnvVars) {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
      expect(source.match(bareUsage), relativePath).toBeNull();
    }
  });

  it("explicitly references each required custom env key by literal name somewhere in the codebase", () => {
    const allSource = filesUsingCustomEnvVars
      .map((p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf-8"))
      .join("\n");
    expect(allSource).toContain("import.meta.env.SESSION_SECRET");
    expect(allSource).toContain("import.meta.env.GITHUB_CLIENT_ID");
    expect(allSource).toContain("import.meta.env.GITHUB_CLIENT_SECRET");
  });
});
