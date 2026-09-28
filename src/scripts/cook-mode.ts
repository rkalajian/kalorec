export {};

const start = document.querySelector<HTMLButtonElement>("#cook-start");
const dialog = document.querySelector<HTMLDialogElement>("#cook-mode");
const close = document.querySelector<HTMLButtonElement>("#cook-close");
const previous = document.querySelector<HTMLButtonElement>("#cook-prev");
const next = document.querySelector<HTMLButtonElement>("#cook-next");
const counter = document.querySelector<HTMLElement>("#cook-counter");
const wakeStatus = document.querySelector<HTMLElement>("#cook-wake-status");

if (start && dialog && close && previous && next && counter && wakeStatus) {
  const steps = Array.from(dialog.querySelectorAll<HTMLElement>("[data-cook-step]"));
  let stepIndex = 0;
  let wakeLock: WakeLockSentinel | null = null;
  let wakeRequest = 0;

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

  const releaseWakeLock = () => {
    wakeRequest += 1;
    const heldLock = wakeLock;
    wakeLock = null;
    if (heldLock) void heldLock.release().catch(() => {});
  };

  const requestWakeLock = async () => {
    if (!dialog.open || document.visibilityState !== "visible") return;
    if (!("wakeLock" in navigator)) {
      wakeStatus.textContent = "Screen stay-awake is unavailable in this browser. Keep your device awake manually.";
      return;
    }
    if (wakeLock && !wakeLock.released) return;

    const request = ++wakeRequest;
    wakeStatus.textContent = "Keeping screen awake…";
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (request !== wakeRequest || !dialog.open || document.visibilityState !== "visible") {
        await lock.release();
        return;
      }
      wakeLock = lock;
      wakeStatus.textContent = "Screen will stay awake while Cook Mode is open.";
      lock.addEventListener("release", () => {
        if (wakeLock !== lock) return;
        wakeLock = null;
        if (dialog.open) {
          wakeStatus.textContent = "Screen stay-awake paused. Keep your device awake manually.";
        }
      });
    } catch {
      if (request === wakeRequest && dialog.open) {
        wakeStatus.textContent = "Screen stay-awake could not be enabled. Keep your device awake manually.";
      }
    }
  };

  start.addEventListener("click", () => {
    stepIndex = 0;
    showStep();
    wakeStatus.textContent = "Checking screen wake support…";
    dialog.showModal();
    void requestWakeLock();
  });

  close.addEventListener("click", () => {
    releaseWakeLock();
    dialog.close();
  });
  dialog.addEventListener("cancel", releaseWakeLock);
  dialog.addEventListener("close", releaseWakeLock);
  previous.addEventListener("click", () => {
    if (stepIndex > 0) stepIndex -= 1;
    showStep();
  });
  next.addEventListener("click", () => {
    if (stepIndex < steps.length - 1) stepIndex += 1;
    showStep();
  });
  document.addEventListener("visibilitychange", () => {
    if (!dialog.open) return;
    if (document.visibilityState === "visible") void requestWakeLock();
    else releaseWakeLock();
  });
  window.addEventListener("pagehide", releaseWakeLock);

  showStep();
  start.hidden = false;
}
