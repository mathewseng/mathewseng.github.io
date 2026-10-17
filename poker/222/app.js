// Entry: tabs, dialogs, shared worker pool, and the five views.
import { Pool } from "./pool.js";
import { $ } from "./ui.js";
import { initSimulator } from "./simulator.js";
import { initSpot } from "./spot.js";
import { initTrainer } from "./trainer.js";
import { initOnline } from "./online.js";
import { initReports } from "./reports.js";

const Tabs = window.Tabs;
const Sheet = window.Sheet;
const pool = new Pool();
window.__pool = pool; // console access for timing experiments
const views = ["sim", "spot", "trainer", "online", "reports"];
const listeners = new Map();
const ROOM_CODE = /^[A-Z2-9]{4,6}$/;
// The hash is read before the tablist initialises, because activating a tab
// rewrites it (#sim, #spot, …) unless it is a room code.
const bootHash = location.hash.replace("#", "");

// shared/tabs.js owns aria-selected, the .active class and the panels' hidden
// state; applyTab mirrors the view into the hash and wakes the view.
function applyTab(name) {
  if (location.hash.replace("#", "").split("/")[0] !== name) history.replaceState(null, "", `#${name}`);
  listeners.get(name)?.();
}
const tabs = Tabs.init($("view-tabs"), { onChange: applyTab });
function showTab(name) {
  if (tabs.current !== name) tabs.activate(name);
  else applyTab(name);
}
$("rules-button").addEventListener("click", () => Sheet.open($("rules-dialog"), { dismissible: true }));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => $(b.dataset.close).close()));

const sim = initSimulator({ pool });
const spot = initSpot({ pool, sim });
initTrainer({ pool });
const online = initOnline({ pool });
const reports = initReports();
listeners.set("reports", () => reports.load());
listeners.set("online", () => online.shown());
listeners.set("spot", () => spot.shown());

addEventListener("hashchange", () => {
  const name = location.hash.replace("#", "").split("/")[0];
  if (views.includes(name) && $(`view-${name}`).hidden) showTab(name);
});
const first = bootHash.split("/")[0];
if (ROOM_CODE.test(first)) {
  showTab("online");
  online.prefillCode(first);
} else showTab(views.includes(first) ? first : "sim");
