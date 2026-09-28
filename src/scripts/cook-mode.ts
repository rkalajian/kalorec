export {};

const pageToggle = document.querySelector<HTMLButtonElement>("#recipe-wake-toggle");
const pageState = document.querySelector<HTMLElement>("#recipe-wake-state");
const pageStatus = document.querySelector<HTMLElement>("#recipe-wake-status");
const start = document.querySelector<HTMLButtonElement>("#cook-start");
const dialog = document.querySelector<HTMLDialogElement>("#cook-mode");
const close = document.querySelector<HTMLButtonElement>("#cook-close");
const previous = document.querySelector<HTMLButtonElement>("#cook-prev");
const next = document.querySelector<HTMLButtonElement>("#cook-next");
const counter = document.querySelector<HTMLElement>("#cook-counter");
const cookStatus = document.querySelector<HTMLElement>("#cook-wake-status");

let pageRequested = false;
let pageTouched = false;
let wakeLock: WakeLockSentinel | null = null;
let requestPending = false;
let requestVersion = 0;
let pageExited = false;
let wakeProblem: "unsupported" | "denied" | "paused" | null = null;

const wanted = () => pageRequested || Boolean(dialog?.open);
const awake = () => Boolean(wakeLock && !wakeLock.released);

const renderWakeState = () => {
  if (pageToggle) {
    pageToggle.hidden = false;
    if (pageState) pageState.textContent = pageRequested ? "· On" : "· Off";
    pageToggle.setAttribute("aria-pressed", String(pageRequested));
  }

  if (pageStatus && pageTouched) {
    pageStatus.textContent = pageRequested
      ? awake()
        ? "Screen will stay awake while this recipe is open."
        : requestPending
          ? "Turning screen stay-awake on…"
          : "Screen stay-awake paused. Keep your device awake manually."
      : wakeProblem === "unsupported"
        ? "Screen stay-awake is unavailable in this browser. Keep your device awake manually."
        : wakeProblem === "denied"
          ? "Screen stay-awake could not be enabled. Keep your device awake manually."
          : "Screen stay-awake is off.";
  }

  if (cookStatus && dialog?.open) {
    cookStatus.textContent = awake()
      ? "Screen will stay awake while Cook Mode is open."
      : wakeProblem === "unsupported"
        ? "Screen stay-awake is unavailable in this browser. Keep your device awake manually."
        : wakeProblem === "denied"
          ? "Screen stay-awake could not be enabled. Keep your device awake manually."
          : requestPending
            ? "Keeping screen awake…"
            : "Screen stay-awake paused. Keep your device awake manually.";
  }
};

const releaseHeldLock = () => {
  const heldLock = wakeLock;
  wakeLock = null;
  if (heldLock) void heldLock.release().catch(() => {});
};

const syncWakeLock = async () => {
  if (pageExited || !wanted() || document.visibilityState !== "visible") {
    requestVersion += 1;
    releaseHeldLock();
    renderWakeState();
    return;
  }

  if (!("wakeLock" in navigator)) {
    pageRequested = false;
    wakeProblem = "unsupported";
    renderWakeState();
    return;
  }

  if (awake() || requestPending || wakeProblem === "denied") {
    renderWakeState();
    return;
  }

  const version = ++requestVersion;
  requestPending = true;
  renderWakeState();
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (version !== requestVersion || pageExited || !wanted() || document.visibilityState !== "visible") {
      await lock.release();
      return;
    }
    wakeLock = lock;
    wakeProblem = null;
    lock.addEventListener("release", () => {
      if (wakeLock !== lock) return;
      wakeLock = null;
      if (wanted()) wakeProblem = "paused";
      renderWakeState();
    });
  } catch {
    if (version === requestVersion && wanted()) {
      pageRequested = false;
      wakeProblem = "denied";
    }
  } finally {
    requestPending = false;
    renderWakeState();
    if (version !== requestVersion && wanted() && !awake()) void syncWakeLock();
  }
};

pageToggle?.addEventListener("click", () => {
  pageTouched = true;
  pageRequested = !pageRequested;
  wakeProblem = null;
  void syncWakeLock();
});

if (start && dialog && close && previous && next && counter && cookStatus) {
  const steps = Array.from(dialog.querySelectorAll<HTMLElement>("[data-cook-step]"));
  let stepIndex = 0;

  const showStep = () => {
    steps.forEach((step, index) => {
      step.hidden = index !== stepIndex;
    });
    counter.textContent = steps.length ? `Step ${stepIndex + 1} of ${steps.length}` : "No instructions listed";
    previous.disabled = false;
    next.disabled = false;
    previous.setAttribute("aria-disabled", String(stepIndex === 0));
    next.setAttribute("aria-disabled", String(stepIndex >= steps.length - 1));
  };

  start.addEventListener("click", () => {
    stepIndex = 0;
    showStep();
    wakeProblem = null;
    dialog.showModal();
    void syncWakeLock();
  });

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => void syncWakeLock());
  previous.addEventListener("click", () => {
    if (stepIndex > 0) stepIndex -= 1;
    showStep();
  });
  next.addEventListener("click", () => {
    if (stepIndex < steps.length - 1) stepIndex += 1;
    showStep();
  });

  showStep();
  start.hidden = false;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") wakeProblem = null;
  void syncWakeLock();
});
window.addEventListener("pagehide", () => {
  pageExited = true;
  void syncWakeLock();
});
window.addEventListener("pageshow", () => {
  pageExited = false;
  void syncWakeLock();
});

renderWakeState();
