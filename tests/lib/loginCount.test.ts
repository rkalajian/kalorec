import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUniqueLoginCount, recordLogin } from "../../src/lib/loginCount";

const blobs = vi.hoisted(() => new Map<string, string>());
const set = vi.hoisted(() => vi.fn(async (key: string, value: string) => { blobs.set(key, value); }));
const list = vi.hoisted(() => vi.fn(async () => ({ blobs: [...blobs.keys()].map((key) => ({ key })) })));

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({ set, list })),
}));

describe("unique login count", () => {
  beforeEach(() => {
    blobs.clear();
    set.mockClear();
    list.mockClear();
  });

  it("counts distinct numeric GitHub IDs across repeat logins", async () => {
    await recordLogin(42);
    await recordLogin(42);
    await recordLogin(73);

    expect(await getUniqueLoginCount()).toBe(2);
    expect(set).toHaveBeenCalledWith("42", "1");
    expect(set).toHaveBeenCalledWith("73", "1");
  });

  it("rejects invalid IDs before writing", async () => {
    await expect(recordLogin(0)).rejects.toThrow("Invalid GitHub user ID");
    await expect(recordLogin(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow("Invalid GitHub user ID");
    expect(set).not.toHaveBeenCalled();
  });

  it("hides the count when storage is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    list.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await getUniqueLoginCount()).toBeNull();
    log.mockRestore();
  });
});
