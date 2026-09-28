import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeElement extends EventTarget {
  hidden = true;
  disabled = false;
  textContent = "";
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  click() {
    this.dispatchEvent(new Event("click"));
  }
}

class FakeDialog extends FakeElement {
  open = false;
  steps = [new FakeElement(), new FakeElement()];

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }

  querySelectorAll() {
    return this.steps;
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  elements = new Map<string, FakeElement>();

  querySelector(selector: string) {
    return this.elements.get(selector) ?? null;
  }
}

class FakeWakeLock extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const setup = async (withCookMode = true, supported = true) => {
  const document = new FakeDocument();
  const window = new EventTarget();
  const toggle = new FakeElement();
  const pageStatus = new FakeElement();
  document.elements.set("#recipe-wake-toggle", toggle);
  document.elements.set("#recipe-wake-status", pageStatus);

  const dialog = new FakeDialog();
  const start = new FakeElement();
  const close = new FakeElement();
  if (withCookMode) {
    document.elements.set("#cook-start", start);
    document.elements.set("#cook-mode", dialog);
    document.elements.set("#cook-close", close);
    document.elements.set("#cook-prev", new FakeElement());
    document.elements.set("#cook-next", new FakeElement());
    document.elements.set("#cook-counter", new FakeElement());
    document.elements.set("#cook-wake-status", new FakeElement());
  }

  const locks: FakeWakeLock[] = [];
  const request = vi.fn(async () => {
    const lock = new FakeWakeLock();
    locks.push(lock);
    return lock;
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", supported ? { wakeLock: { request } } : {});
  await import("../../src/scripts/cook-mode");
  return { document, window, toggle, pageStatus, dialog, start, close, locks, request };
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("recipe screen wake option", () => {
  it("keeps the page lock after Cook Mode closes, then releases it when switched off", async () => {
    const { toggle, start, close, locks, request } = await setup();
    toggle.click();
    await tick();
    expect(toggle.attributes.get("aria-pressed")).toBe("true");
    expect(request).toHaveBeenCalledTimes(1);

    start.click();
    close.click();
    await tick();
    expect(locks[0].released).toBe(false);

    toggle.click();
    await tick();
    expect(toggle.attributes.get("aria-pressed")).toBe("false");
    expect(locks[0].release).toHaveBeenCalledTimes(1);
  });

  it("releases on tab hide and reacquires on return while the page option remains on", async () => {
    const { document, toggle, locks, request } = await setup();
    toggle.click();
    await tick();
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(locks[0].released).toBe(true);
    expect(toggle.attributes.get("aria-pressed")).toBe("true");

    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(request).toHaveBeenCalledTimes(2);
    expect(locks[1].released).toBe(false);
  });

  it("works without Cook Mode and reports unsupported wake lock", async () => {
    const { toggle, pageStatus } = await setup(false, false);
    toggle.click();
    await tick();
    expect(toggle.attributes.get("aria-pressed")).toBe("false");
    expect(pageStatus.textContent).toMatch(/unavailable/);
  });

  it("reacquires after a page restored from browser history", async () => {
    const { window, toggle, locks, request } = await setup();
    toggle.click();
    await tick();
    window.dispatchEvent(new Event("pagehide"));
    await tick();
    expect(locks[0].released).toBe(true);
    window.dispatchEvent(new Event("pageshow"));
    await tick();
    expect(request).toHaveBeenCalledTimes(2);
    expect(locks[1].released).toBe(false);
  });

  it("keeps the lock for Cook Mode when the page option is switched off", async () => {
    const { toggle, start, close, locks } = await setup();
    toggle.click();
    await tick();
    start.click();
    toggle.click();
    await tick();
    expect(locks[0].released).toBe(false);
    close.click();
    await tick();
    expect(locks[0].released).toBe(true);
  });
});
