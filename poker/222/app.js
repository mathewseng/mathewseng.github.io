// Entry: tabs, dialog, shared worker pool, and the five views.
import { Pool } from "./pool.js";
import { $ } from "./ui.js";
import { initSimulator } from "./simulator.js";
import { initSpot } from "./spot.js";
import { initTrainer } from "./trainer.js";
import { initOnline } from "./online.js";
import { initReports } from "./reports.js";

const pool = new Pool();
window.__pool = pool; // console access for timing experiments
const views = ["sim", "spot", "trainer", "online", "reports"];
const listeners = new Map();
function showTab(name) {
  document.querySelectorAll(".tabs > button").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  for (const v of views) $(`view-${v}`).hidden = v !== name;
  if (location.hash.replace("#", "").split("/")[0] !== name) history.replaceState(null, "", `#${name}`);
  listeners.get(name)?.();
}
document.querySelectorAll(".tabs > button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("rules-button").addEventListener("click", () => $("rules-dialog").showModal());
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
const hash = location.hash.replace("#", "");
const first = hash.split("/")[0];
if (/^[A-Z2-9]{4,6}$/.test(first)) {
  showTab("online");
  online.prefillCode(first);
} else showTab(views.includes(first) ? first : "sim");
