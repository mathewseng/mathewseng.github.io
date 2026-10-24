// SPDX-License-Identifier: GPL-3.0-or-later
import { fitDialogViewport } from "./dialog-viewport.mjs";
// A page-load gate: a known update must finish before the tool starts. Active
// games may download the next release, but are only replaced on navigation.
let started, reloading = false;
export const isUpdateReload = () => reloading;
const resumeKey = "backgammon.update-resume";
const attemptKey = "backgammon.update-attempt";
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
function bounded(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("The update check timed out.")), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
// An update can activate between navigation and boot (or in another tab).
// The active worker, not the existence of a waiting worker, identifies the
// installed release. Older workers don't implement this read-only protocol.
async function workerVersion(worker) {
  if (!worker) return null;
  const channel = new MessageChannel();
  try {
    return await bounded(new Promise((resolve) => {
      channel.port1.onmessage = ({data}) => {
        if (data?.type === "BACKGAMMON_VERSION") resolve(data.version);
      };
      worker.postMessage({type:"BACKGAMMON_VERSION"}, [channel.port2]);
    }), 1200);
  } catch { return null; }
  finally { channel.port1.close(); channel.port2.close(); }
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
      retries = 0,
      retryTimer,
      stallTimer,
      notice, releaseViewport;
    const watched = new WeakSet();
    const status = (state, message) => onStatus({ state, message });
    function screen(message, completed, total) {
      if (!notice) {
        notice = document.createElement("dialog");
        notice.className = "dialog bg-dialog app-update-dialog";
        notice.setAttribute("aria-labelledby", "update-title");
        // The failed state is not a dead end: Retry stays first (tests select
        // the dialog's first button), then "Continue with the installed
        // version" releases the gate, and the refresh page is one link away.
        notice.innerHTML =
          '<div class="dialog-body"><h2 id="update-title">Updating Backgammon</h2><p class="update-message" role="status"></p><progress aria-label="App files downloaded"></progress><p class="update-count"></p><p class="update-note">Your game, draft and saved study stay in this browser.</p><div class="update-actions" hidden><button type="button" class="btn btn--primary">Retry update</button><button type="button" class="btn update-continue">Continue with the installed version</button><a class="update-refresh-link" href="/backgammon/refresh/">Reinstall the app</a></div></div>';
        notice.addEventListener("cancel", (e) => e.preventDefault());
        notice.querySelector("button").onclick = () => {
          retries = 0;
          try { sessionStorage.removeItem(attemptKey); } catch {}
          notice.querySelector("button").hidden = true;
          check(true);
        };
        notice.querySelector(".update-continue").onclick = () => {
          status("offline", "Running the installed version. The update is retried on the next visit.");
          finish();
        };
        document.body.append(notice);
        releaseViewport = fitDialogViewport(notice);
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
      clearTimeout(retryTimer);
      clearTimeout(stallTimer);
      releaseViewport?.();
      releaseViewport = null;
      notice?.close();
      notice?.remove();
      notice = null;
      resolve();
    }
    function failed(message) {
      status("error", message);
      if (gate) {
        // Transient download/activation failures heal without a manual refresh.
        // Bound retries to avoid a battery/network loop while offline.
        if (!retryTimer && retries < 3 && !document.hidden) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (!document.hidden) check(true);
          }, [1000, 3000, 10000][retries++]);
        }
        screen(message + (retryTimer ? " Retrying automatically…" : ""));
        notice.querySelector("progress").hidden = true;
        notice.querySelector("button").hidden = false;
        notice.querySelector(".update-actions").hidden = false;
      }
    }
    async function reloadIfInstalled(version) {
      if (!gate || !version) return false;
      const active = registration.active;
      const installed = await workerVersion(active);
      if (!gate || reloading || active !== registration.active || installed !== version) return false;
      // If a browser still supplies stale HTML after a successful reload, stop
      // rather than trapping the user in an infinite navigation loop.
      try {
        const previous = JSON.parse(sessionStorage.getItem(attemptKey) || "null");
        if (previous?.version === version && previous.url === location.href && Date.now() - previous.at < 60000) {
          retries = 3;
          failed("The browser is still showing an older page. Retry to load the installed update. Your saved data is safe.");
          return true;
        }
        sessionStorage.setItem(attemptKey, JSON.stringify({version, url:location.href, at:Date.now()}));
      } catch {}
      clearTimeout(retryTimer);
      clearTimeout(stallTimer);
      screen("Update installed. Restoring your page…");
      reloadPage();
      return true;
    }
    navigator.serviceWorker.addEventListener("message", ({ data, source }) => {
      // Download messages can arrive after the worker has failed. They must
      // not overwrite the error/retry state with stale progress (WebKit queues
      // these independently from the worker's statechange notification).
      if (source !== registration?.installing || source?.state !== "installing" || applying || retryTimer) return;
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
              reject(new Error("Update interrupted. Your saved data is safe."));
          };
          worker.addEventListener("statechange", activated);
          channel.port1.onmessage = ({ data }) =>
            data?.status === "ready" ? activated() : accept(data);
          timer = setTimeout(
            () => reject(new Error("The update timed out. Your saved data is safe.")),
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
        clearTimeout(retryTimer);
        clearTimeout(stallTimer);
        reloadPage(); // The gate stays closed until the coherent release loads.
      } catch (e) {
        failed(e.message);
      } finally {
        clearTimeout(timer);
        worker.removeEventListener("statechange", activated);
        channel.port1.close();
        channel.port2.close();
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
            "The download was interrupted. Your saved data is safe.",
          );
      };
      worker.addEventListener("statechange", changed);
      changed();
    }
    async function check(force = false) {
      if (
        checking ||
        applying ||
        reloading ||
        (!force &&
          !gate &&
          registration &&
          !registration.waiting &&
          !registration.installing &&
          Date.now() - lastCheck < 60000)
      )
        return;
      checking = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      clearTimeout(stallTimer);
      if (notice) {
        notice.querySelector("button").hidden = true;
        notice.querySelector(".update-actions").hidden = true;
      }
      status("checking", "Checking for app updates…");
      try {
        if (!registration) {
          // Inspect an already-staged release before register() can start a
          // redundant update job. WebKit can defer that job during navigation.
          registration = await bounded(navigator.serviceWorker.getRegistration("/backgammon/"), 7000);
          if (registration && new URL(registration.scope).pathname !== "/backgammon/") registration = null;
          if (!registration) {
            registration = await bounded(navigator.serviceWorker.register(
              "/backgammon/sw.js",
              { scope: "/backgammon/", updateViaCache: "none" },
            ), 7000);
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
        let publishedUpdate = false, published;
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
          published = (await response.text()).match(
            /offline-manifest\.js\?v=([a-z0-9]+)/,
          )?.[1];
          publishedUpdate =
            !!installed && !!published && installed !== published;
          if (publishedUpdate) screen("Downloading the latest app…");
        }
        if (publishedUpdate && await reloadIfInstalled(published)) return;
        await bounded(registration.update(), 10000);
        if (registration.installing) watch(registration.installing);
        else if (registration.waiting) await applyWaiting();
        else if (publishedUpdate) {
          if (await reloadIfInstalled(published)) return;
          stallTimer = setTimeout(() => {
            if (
              gate &&
              !registration.installing &&
              !registration.waiting &&
              !applying
            )
              failed("The update has not started yet. Your saved data is safe.");
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
            "Couldn’t complete the update check. Your saved data is safe.",
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
      // Safari can restore a live game from its page cache. Treat it like
      // foregrounding: stage updates without replacing the restored document.
      // Only a fresh navigation opens the mandatory update gate.
      if (e.persisted) check(true);
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
