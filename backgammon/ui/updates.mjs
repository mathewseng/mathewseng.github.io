// SPDX-License-Identifier: GPL-3.0-or-later
// Keep a complete offline release together. Never reload an occupied tool.
let started = false;
export function startUpdates({ hub = false, onStatus = () => {} } = {}) {
  if (started || !("serviceWorker" in navigator)) return;
  started = true;
  let touched = false,
    leaving = false,
    applying = false,
    checking = false,
    connecting = false,
    lastCheck = 0,
    registration;
  const watched = new WeakSet();
  const status = (state, message) => onStatus({ state, message });
  const safe = () =>
    !touched &&
    !leaving &&
    document.visibilityState === "visible" &&
    !document.querySelector("dialog[open]");
  for (const type of ["pointerdown", "keydown", "input", "change", "click"])
    addEventListener(
      type,
      () => {
        touched = true;
      },
      { capture: true },
    );
  addEventListener("pagehide", () => {
    leaving = true;
  });

  async function applyWaiting() {
    const worker = registration?.waiting;
    if (!worker || !registration.active || applying) return;
    status(
      "waiting",
      "Update downloaded. Finish your session, then return to the hub.",
    );
    if (!safe()) return;
    applying = true;
    // The shell is already downloaded. Lock input only for the activation
    // handshake, so starting a game cannot race a reload. No work is discarded.
    const notice = document.createElement("dialog");
    notice.className = "app-update-dialog";
    notice.setAttribute("aria-label", "Updating Backgammon");
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.textContent = "Updating app files… Your saved data stays here.";
    notice.append(message);
    notice.addEventListener("cancel", (event) => event.preventDefault());
    document.body.append(notice);
    notice.showModal();
    status("applying", "Updating app files…");
    const channel = new MessageChannel();
    const deadline = Date.now() + 5000;
    let timer, activated;
    try {
      const result = await new Promise((resolve, reject) => {
        activated = () => {
          if (worker.state === "activated") resolve({ status: "ready" });
          else if (worker.state === "redundant")
            reject(new Error("Update interrupted."));
        };
        worker.addEventListener("statechange", activated);
        channel.port1.onmessage = ({ data }) => {
          if (data?.status !== "ready") resolve(data);
          else activated();
        };
        // The worker refuses expired requests. Allow time for activation after
        // that deadline, but always release the UI if the browser fails.
        timer = setTimeout(() => reject(new Error("Update timed out.")), 12000);
        worker.postMessage({ type: "BACKGAMMON_UPDATE", deadline }, [
          channel.port2,
        ]);
        activated();
      });
      if (result?.status === "ready") {
        // Activation changes the controller for the next navigation. Reload
        // once, without claiming other clients or clearing any user storage.
        leaving = true;
        location.reload();
        return;
      }
      status(
        "waiting",
        result?.message || "Update ready. Return to the hub when finished.",
      );
    } catch {
      status(
        "error",
        "Update paused. Your saved data is safe. Try Refresh app below.",
      );
    } finally {
      clearTimeout(timer);
      worker.removeEventListener("statechange", activated);
      channel.port1.close();
      notice.close();
      notice.remove();
      applying = false;
    }
  }

  function watch(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    const changed = () => {
      if (worker.state === "installed") applyWaiting();
      else if (worker.state === "redundant")
        status(
          "error",
          "Update unavailable. Your existing app is still usable; try again when online.",
        );
    };
    worker.addEventListener("statechange", changed);
    changed();
  }

  async function check(force = false) {
    if (!registration || leaving || checking) return;
    checking = true;
    try {
      // Reconsider a staged update even inside the network-check throttle.
      // Hold the guard across awaits: pageshow/focus/online can arrive together.
      await applyWaiting();
      if (applying || leaving || (!force && Date.now() - lastCheck < 60000))
        return;
      if (registration.installing) {
        watch(registration.installing);
        return;
      }
      lastCheck = Date.now();
      await registration.update();
      watch(registration.installing);
      if (registration.waiting) await applyWaiting();
      else if (!registration.installing)
        status("current", "App files update automatically.");
    } catch {
      status(
        "offline",
        "Couldn’t check for updates. Saved tools remain available offline.",
      );
    } finally {
      checking = false;
    }
  }

  function foreground(force = false) {
    if (document.visibilityState !== "visible") return;
    // A hub has no editable state. Tools retain their activity guard, including
    // after BFCache restoration, for games, drafts, dialogs and engine jobs.
    if (hub) touched = false;
    if (registration) check(force);
    else connect();
  }
  document.addEventListener("visibilitychange", () => foreground());
  addEventListener("focus", () => foreground());
  addEventListener("online", () => foreground(true));
  addEventListener("pageshow", (event) => {
    leaving = false;
    if (event.persisted && !hub) touched = true;
    foreground(event.persisted);
  });

  async function connect() {
    if (connecting) return;
    connecting = true;
    try {
      registration = await navigator.serviceWorker.register(
        "/backgammon/sw.js",
        {
          scope: "/backgammon/",
          updateViaCache: "none",
        },
      );
    } catch {
      // A cached page can open offline. Retain its installed registration so
      // coming back online works without requiring another page load.
      registration = await navigator.serviceWorker
        .getRegistration("/backgammon/")
        .catch(() => null);
    } finally {
      connecting = false;
    }
    if (registration) {
      registration.addEventListener("updatefound", () =>
        watch(registration.installing),
      );
      watch(registration.installing);
      check(true);
    } else {
      status(
        "offline",
        "Couldn’t check for updates. We’ll try again when you’re online.",
      );
    }
  }
  connect();
}
