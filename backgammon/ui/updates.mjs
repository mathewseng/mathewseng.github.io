// SPDX-License-Identifier: GPL-3.0-or-later
// A page-load gate: a known update must finish before the tool starts. Active
// games may download the next release, but are only replaced on navigation.
let started, reloading = false;
export const isUpdateReload = () => reloading;
const resumeKey = "backgammon.update-resume";
export function resumedAfterUpdate() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(resumeKey) || "null");
    sessionStorage.removeItem(resumeKey);
    return saved?.url === location.href && Date.now() - saved.at < 120000;
  } catch {
    return false;
  }
}
function reloadPage() {
  try {
    sessionStorage.setItem(resumeKey, JSON.stringify({url:location.href, at:Date.now()}));
  } catch {}
  reloading = true;
  location.reload();
}
export function startUpdates({ onStatus = () => {} } = {}) {
  if (started) return started;
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  started = new Promise((resolve) => {
    let registration,
      gate = true,
      checking = false,
      applying = false,
      lastCheck = 0,
      notice;
    const watched = new WeakSet();
    const status = (state, message) => onStatus({ state, message });
    function screen(message, completed, total) {
      if (!notice) {
        notice = document.createElement("dialog");
        notice.className = "app-update-dialog";
        notice.setAttribute("aria-labelledby", "update-title");
        notice.innerHTML =
          '<h2 id="update-title">Updating Backgammon</h2><p class="update-message" role="status"></p><progress aria-label="App files downloaded"></progress><p class="update-count"></p><p class="update-note">Your game, draft and saved study stay in this browser.</p><button type="button" hidden>Retry update</button>';
        notice.addEventListener("cancel", (e) => e.preventDefault());
        notice.querySelector("button").onclick = () => {
          notice.querySelector("button").hidden = true;
          check(true);
        };
        document.body.append(notice);
        notice.showModal();
      }
      notice.querySelector(".update-message").textContent = message;
      const progress = notice.querySelector("progress");
      progress.hidden = false;
      if (Number.isFinite(total) && total > 0) {
        progress.max = total;
        progress.value = completed;
      } else progress.removeAttribute("value");
      notice.querySelector(".update-count").textContent = total
        ? `${completed} of ${total} files`
        : "";
    }
    function finish() {
      if (!gate) return;
      gate = false;
      notice?.close();
      notice?.remove();
      notice = null;
      resolve();
    }
    function failed(message) {
      status("error", message);
      if (gate) {
        screen(message);
        notice.querySelector("progress").hidden = true;
        notice.querySelector("button").hidden = false;
      }
    }
    navigator.serviceWorker.addEventListener("message", ({ data, source }) => {
      if (source !== registration?.installing || applying) return;
      if (data?.type === "BACKGAMMON_DOWNLOAD" && gate && registration?.active)
        screen("Downloading the latest app…", data.completed, data.total);
    });
    async function applyWaiting() {
      const worker = registration?.waiting;
      if (!worker || !registration.active || applying) return;
      status(
        "waiting",
        "Update ready. It will install automatically the next time this page opens.",
      );
      if (!gate) return;
      applying = true;
      screen("Download complete. Installing update…");
      const channel = new MessageChannel();
      let timer, activated;
      try {
        const result = await new Promise((accept, reject) => {
          activated = () => {
            if (worker.state === "activated") accept({ status: "ready" });
            else if (worker.state === "redundant")
              reject(new Error("Update interrupted. Retry to continue."));
          };
          worker.addEventListener("statechange", activated);
          channel.port1.onmessage = ({ data }) =>
            data?.status === "ready" ? activated() : accept(data);
          timer = setTimeout(
            () => reject(new Error("The update timed out. Retry to continue.")),
            15000,
          );
          worker.postMessage(
            { type: "BACKGAMMON_UPDATE", deadline: Date.now() + 9000 },
            [channel.port2],
          );
          activated();
        });
        if (result?.status !== "ready") {
          failed(
            result?.message || "The update is waiting. Retry to continue.",
          );
          return;
        }
        screen("Update installed. Restoring your page…");
        reloadPage(); // The gate stays closed until the coherent release loads.
      } catch (e) {
        failed(e.message);
      } finally {
        clearTimeout(timer);
        worker.removeEventListener("statechange", activated);
        channel.port1.close();
        applying = false;
      }
    }
    function watch(worker) {
      if (!worker || watched.has(worker)) return;
      watched.add(worker);
      if (gate && registration.active) screen("Downloading the latest app…");
      const changed = () => {
        if (worker.state === "installed") {
          if (registration.active) applyWaiting();
          else {
            status("current", "App files update automatically.");
            finish();
          }
        } else if (worker.state === "redundant")
          failed(
            "The download was interrupted. Your saved data is safe. Retry to continue.",
          );
      };
      worker.addEventListener("statechange", changed);
      changed();
    }
    async function check(force = false) {
      if (
        checking ||
        applying ||
        (!force &&
          registration &&
          !registration.waiting &&
          !registration.installing &&
          Date.now() - lastCheck < 60000)
      )
        return;
      checking = true;
      status("checking", "Checking for app updates…");
      try {
        if (!registration) {
          // Inspect an already-staged release before register() can start a
          // redundant update job. WebKit can defer that job during navigation.
          registration = await navigator.serviceWorker.getRegistration("/backgammon/");
          if (registration && new URL(registration.scope).pathname !== "/backgammon/") registration = null;
          if (!registration) {
            registration = await navigator.serviceWorker.register(
              "/backgammon/sw.js",
              { scope: "/backgammon/", updateViaCache: "none" },
            );
          }
          registration.addEventListener("updatefound", () =>
            watch(registration.installing),
          );
        }
        if (registration.waiting) {
          await applyWaiting();
          return;
        }
        if (registration.installing) {
          watch(registration.installing);
          if (!registration.active) finish();
          return;
        }
        lastCheck = Date.now();
        // WebKit can resolve update() before exposing its installing worker.
        // Compare the published worker revision as well, so this race cannot
        // release the load gate and strand the update until another visit.
        let publishedUpdate = false;
        if (gate && registration.active) {
          const installedURL = document.querySelector(
            '[src*="?bgv="], [href*="?bgv="]',
          );
          const installed = new URL(
            installedURL?.src || installedURL?.href || location.href,
          ).searchParams.get("bgv");
          const response = await fetch(
            `/backgammon/sw.js?update-check=${Date.now()}`,
            { cache: "no-store", signal: AbortSignal.timeout(7000) },
          );
          if (!response.ok) throw new Error("Update check unavailable");
          const published = (await response.text()).match(
            /offline-manifest\.js\?v=([a-z0-9]+)/,
          )?.[1];
          publishedUpdate =
            !!installed && !!published && installed !== published;
          if (publishedUpdate) screen("Downloading the latest app…");
        }
        await registration.update();
        if (registration.installing) watch(registration.installing);
        else if (registration.waiting) await applyWaiting();
        else if (publishedUpdate) {
          setTimeout(() => {
            if (
              gate &&
              !registration.installing &&
              !registration.waiting &&
              !applying
            )
              failed("The update has not started yet. Retry to continue.");
          }, 15000);
        } else {
          status("current", "App files update automatically.");
          finish();
        }
      } catch {
        status(
          "offline",
          "Couldn’t check for updates. Your saved tools remain available offline.",
        );
        // No confirmed update: offline play is still available. A known failed
        // install stays gated with Retry instead of silently running old code.
        if (!notice) finish();
        else
          failed(
            "Check your connection and retry the update. Your saved data is safe.",
          );
      } finally {
        checking = false;
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) check();
    });
    addEventListener("focus", () => check());
    addEventListener("online", () => check(true));
    addEventListener("pageshow", (e) => {
      // A restored BFCache page contains live in-memory work. Save through its
      // normal pagehide checkpoint, then run the load gate on a real navigation.
      if (e.persisted) reloadPage();
    });
    // A stalled network must not leave a blank page forever. Only a confirmed
    // update is mandatory; an unconfirmed check can fall back to the saved app.
    setTimeout(() => {
      if (gate && !notice) {
        status("offline", "Update check timed out. Saved tools are available.");
        finish();
      }
    }, 8000);
    check(true);
  });
  return started;
}
