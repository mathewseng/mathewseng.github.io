// SPDX-License-Identifier: GPL-3.0-or-later
import {
  settings,
  saveSettings,
  put,
  itemRecord,
} from "../core/storage.mjs";
import {
  playerName,
  pipCount,
  notation,
  matchingPaths,
  nextSteps,
  applyStep,
  clone,
  boardKey,
  decisionPlayer,
} from "../core/rules.mjs";
import { Board } from "./board.mjs";
import {
  checkerRoutes,
  availableRoutes,
  nearestRoutes,
  reverseRoutes,
  entrySwitchRoutes,
} from "../core/draft.mjs";
import { applyBoardTheme } from "../core/appearance.mjs";
import {
  sound,
  installSound,
  soundPreferences,
  setSoundPreferences,
} from "./sound.mjs";
import { reducedMotion } from "./motion.mjs";
import { startUpdates } from "./updates.mjs";
import { releaseStatus } from "./release-status.mjs";
export const $ = (id) => document.getElementById(id);
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on"))
      n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "text") n.textContent = v;
    else if (k === "checked") n.checked = v;
    else if (k === "value") n.value = v;
    else if (v !== false && v !== null)
      n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...children.filter((x) => x !== null && x !== undefined));
  return n;
}
export const button = (text, action, cls = "", attrs = {}) =>
  el(
    "button",
    {
      type: "button",
      class: cls,
      onClick: () => Promise.resolve().then(action).catch(showError),
      ...attrs,
    },
    text,
  );
export function field(label, input) {
  input.setAttribute("aria-label", String(label));
  return el("label", { class: "field" }, label, input);
}
export function select(options, value, change) {
  const node = el("select", { onChange: (e) => change?.(e.target.value) });
  for (const [v, t] of options) node.append(el("option", { value: v }, t));
  node.value = value;
  return node;
}
let toastTimer;
export function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}
export function showError(e) {
  toast(e?.message || String(e));
  console.error(e);
}
export function dialog(title, content, actions = []) {
  const d = el("dialog", { class: "dialog", "aria-label": title }),
    close = button("Close", () => d.close(), "ghost close");
  d.append(
    el("div", { class: "dialog-header" }, el("h2", {}, title), close),
    el("div", { class: "dialog-body" }, content),
    el("footer", {}, ...actions),
  );
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
export function confirmDialog(title, text, action) {
  let d;
  d = dialog(title, el("p", {}, text), [
    button("Cancel", () => d.close()),
    button(
      "Continue",
      async () => {
        await action();
        d.close();
      },
      "primary",
    ),
  ]);
}
export function saveDialog(state, kind = "position", extra = {}) {
  const name = el("input", {
      value: extra.title || "Untitled position",
      maxlength: 160,
    }),
    notes = el("textarea", {
      maxlength: 12000,
      placeholder: "What would you like to remember?",
    }),
    tags = el("input", {
      placeholder: "Comma-separated tags",
      maxlength: 400,
      value: (extra.tags || []).join(", "),
    });
  let d;
  d = dialog(
    "Save to Library",
    el(
      "div",
      { class: "stack" },
      field("Name", name),
      field("Notes", notes),
      field("Tags", tags),
    ),
    [
      button(
        "Save",
        async () => {
          await put(
            "items",
            itemRecord(kind, {
              ...extra,
              state: clone(state),
              title: name.value.trim() || "Untitled position",
              notes: notes.value,
              tags: tags.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 20),
            }),
          );
          toast("Saved to your Library.");
          d.close();
        },
        "primary",
      ),
    ],
  );
}
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
  } catch {
    dialog("Copy link", el("textarea", { readonly: true, value: text }));
  }
}
function changeSound(value) {
  const saved = setSoundPreferences(value);
  dispatchEvent(new Event("bg-sound"));
  sound.unlock();
  if (!saved)
    toast(
      "Sound setting applies to this tab. Browser storage is unavailable.",
    );
}
let activeBoard;
export function shell(page, title, subtitle = "") {
  activeBoard?.destroy();
  document.documentElement.dataset.motion = settings().motion;
  installSound();
  addEventListener("storage", (e) => {
    if (e.key === "backgammon.v1.settings" || e.key === null) {
      applyBoardTheme(settings().boardTheme);
      document.documentElement.dataset.motion = settings().motion;
      dispatchEvent(new Event("bg-motion"));
    }
  });
  document.body.innerHTML = `<div class="app"><header class="topbar"><a class="brand" href="/backgammon/"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>Backgammon</a><nav class="nav" aria-label="Backgammon tools">${["play", "trainer", "solver", "library"].map((p) => `<a href="/backgammon/${p}/" ${p === page ? 'aria-current="page"' : ""}>${p[0].toUpperCase() + p.slice(1)}</a>`).join("")}</nav><div class="header-tools"><a class="site-link" href="/">All projects</a><button id="preferences" class="ghost" type="button">Settings</button></div></header><div class="tool-head"><div><h1 id="page-title"></h1><p class="subtitle" id="subtitle"></p></div><div class="toolbar-actions" id="toolbar"><button id="panel-toggle" class="panel-toggle" type="button">Details</button></div></div><main class="workspace" id="workspace"><section class="stage" aria-label="Game workspace"><div id="opponent" class="player-strip"></div><div id="board" class="board-slot"></div><div id="player" class="player-strip"></div><div class="action-area"><div id="message" class="action-message" role="status" aria-live="polite"></div><div class="action-main"><div id="actions" class="action-buttons"></div></div><div id="draft-line" class="draft-line"></div></div></section><aside class="inspector" id="inspector" aria-label="Details"><div class="panel-body" id="panel"></div></aside></main></div><div class="toast" id="toast" role="status" hidden></div>`;
  $("page-title").textContent = title;
  const mute = button(
    "",
    () => {
      changeSound({ enabled: !soundPreferences().enabled });
    },
    "ghost sound-toggle",
    { id: "sound-toggle", "aria-label": "Sound effects" },
  );
  mute.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5z"/><g class="sound-waves"><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></g><path class="sound-slash" d="m16 9 6 6m0-6-6 6"/></svg>';
  const updateMute = () => {
    mute.setAttribute("aria-pressed", String(soundPreferences().enabled));
    mute.title = soundPreferences().enabled
      ? "Mute sound effects"
      : "Enable sound effects";
  };
  updateMute();
  addEventListener("bg-sound", updateMute);
  $("preferences").before(mute);
  applyBoardTheme(settings().boardTheme);
  $("subtitle").textContent = subtitle;
  $("panel-toggle").onclick = () => openPanel();
  $("preferences").onclick = () => preferences().catch(showError);
  startUpdates({
    onStatus: ({ state }) => {
      const brand = document.querySelector(".brand");
      const waiting = state === "waiting";
      brand.toggleAttribute("data-update-ready", waiting);
      brand.title = waiting
        ? "Update ready. Finish your session, then return to the hub."
        : "Backgammon hub";
      brand.setAttribute("aria-label", brand.title);
    },
  });
  activeBoard = new Board($("board"));
  return { board: activeBoard, panel: $("panel") };
}
export function openPanel() {
  const body = $("panel"),
    home = $("inspector");
  const d = dialog("Details", body);
  d.classList.add("drawer");
  d.addEventListener("close", () => home.append(body));
}
export async function preferences() {
  const { appearanceControls } = await import("./appearance.mjs");
  if (document.querySelector(".settings-dialog")) return;
  const s = settings();
  const orient = select(
    [
      ["0", "Ivory home at bottom right"],
      ["1", "Teal home at bottom right"],
    ],
    s.orientation,
    (v) => saveSettings({ orientation: Number(v) }),
  );
  const numbers = el("input", {
    type: "checkbox",
    checked: s.numbers,
    onChange: (e) => saveSettings({ numbers: e.target.checked }),
  });
  const motion = select(
    [
      ["system", "Follow device"],
      ["reduce", "Reduce motion"],
    ],
    s.motion,
    (v) => {
      saveSettings({ motion: v });
      document.documentElement.dataset.motion = v;
      dispatchEvent(new Event("bg-motion"));
    },
  );
  const sounds = el("input", {
    type: "checkbox",
    checked: s.sound.enabled,
    onChange: (e) => changeSound({ enabled: e.target.checked }),
  });
  const volumeText = el("output", {}, `${s.sound.volume}%`);
  const volume = el("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 5,
    value: s.sound.volume,
    onInput: (e) => changeSound({ volume: Number(e.target.value) }),
  });
  const previewSound = button("Preview sounds", async () => {
    await sound.unlock();
    sound.play("roll");
  });
  const updateSounds = () => {
    const value = soundPreferences();
    sounds.checked = value.enabled;
    volume.value = value.volume;
    volumeText.textContent = `${value.volume}%`;
    volume.setAttribute("aria-valuetext", `${value.volume} percent`);
    previewSound.disabled = !value.enabled || value.volume === 0;
  };
  updateSounds();
  addEventListener("bg-sound", updateSounds);
  const display = el(
    "div",
    { class: "stack" },
    field("Board orientation", orient),
    el("label", { class: "check" }, numbers, "Show point numbers"),
    field("Motion", motion),
    el(
      "div",
      { class: "sound-settings stack" },
      el("label", { class: "check" }, sounds, "Sound effects"),
      field("Sound volume", volume),
      el("div", { class: "row spread" }, volumeText, previewSound),
      el(
        "p",
        { class: "muted small" },
        "Quiet checker, dice and cube sounds. Background tabs stay silent.",
      ),
    ),
    el(
      "p",
      { class: "muted small" },
      "Settings apply across all four tools.",
    ),
    el(
      "a",
      { href: "/backgammon/refresh/" },
      "Refresh app files · keep saved data",
    ),
    button("About, engine & licenses", about),
  );
  const { shortcutControls } = await import("./shortcuts.mjs");
  const keys = shortcutControls();
  keys.hidden = true;
  const colors = appearanceControls();
  display.hidden = true;
  const tabs = el("div", {
    class: "segmented settings-tabs",
    "aria-label": "Settings sections",
  });
  for (const [label, section] of [
    ["Board colors", colors],
    ["Display & controls", display],
    ["Keyboard", keys],
  ]) {
    const tab = button(
      label,
      () => {
        colors.hidden = section !== colors;
        display.hidden = section !== display;
        keys.hidden = section !== keys;
        for (const t of tabs.children)
          t.setAttribute("aria-pressed", String(t === tab));
      },
      "",
      { "aria-pressed": section === colors },
    );
    tabs.append(tab);
  }
  const release = releaseStatus();
  const d = dialog(
    "Settings",
    el(
      "div",
      { class: "settings-content" },
      release,
      tabs,
      colors,
      display,
      keys,
    ),
  );
  d.classList.add("settings-dialog");
  d.addEventListener("close", () =>
    dispatchEvent(new Event("bg-settings")),
  );
  d.addEventListener("close", () =>
    removeEventListener("bg-sound", updateSounds),
  );
  d.addEventListener("close", () => colors.dispose());
  d.addEventListener("close", () => release.dispose());
}
export function about() {
  dialog(
    "About Backgammon",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        {},
        "GNUbg Core 955555c · web binding bg2. Neural-network evaluation with Kazaross–XG2 match equity and bearoff databases. Evaluation is an estimate, not an exact solution.",
      ),
      el(
        "p",
        {},
        "Quick: 0 ply. Standard: 1 ply. Deep: 2 ply. Cubeful when the cube is enabled, deterministic, pruning enabled, no noise. Every legal resulting position is evaluated at the selected depth.",
      ),
      el(
        "p",
        {},
        "Gammon probabilities include backgammons. Money equity is in units of the current cube; match winning chance is a probability. Small differences are not certainty.",
      ),
      el(
        "p",
        {},
        "Rollouts, GNU IDs, and proprietary binary match files are not supported. This core retains rollout source, but its RNG configuration and event hooks are stubs; a validated rollout binding is not distributed.",
      ),
      el(
        "p",
        {},
        "Local data stays in this browser. Export a Library backup to move it between devices. Online rooms use PeerJS signaling and may fail on restricted networks. They are casual peer-to-peer games, not tournament security.",
      ),
      el(
        "a",
        { href: "/backgammon/licenses/GPL-3.0.txt", target: "_blank" },
        "GPL-3.0-or-later license",
      ),
      el(
        "a",
        { href: "/backgammon/engine/source/gnubg-core-955555c-bg2.tar.gz" },
        "Download corresponding engine source",
      ),
      el(
        "a",
        {
          href: "https://github.com/mathewseng/mathewseng.github.io/tree/main/backgammon",
          target: "_blank",
        },
        "Application source, build instructions & validation",
      ),
      el("a", { href: "/" }, "Back to all projects"),
    ),
  );
}
export function players(s, names = ["Ivory", "Teal"]) {
  const orientation = settings().orientation;
  for (const [id, p] of [
    ["opponent", 1 - orientation],
    ["player", orientation],
  ]) {
    const row = $(id);
    const active =
      decisionPlayer(s) === p && !["over", "opening"].includes(s.phase);
    if (
      active &&
      !row.classList.contains("active") &&
      !reducedMotion() &&
      !document.hidden
    )
      row.animate(
        [
          { backgroundColor: "#9bd6c928" },
          { backgroundColor: "transparent" },
        ],
        { duration: 420, easing: "ease-out" },
      );
    row.classList.toggle("active", active);
    row.replaceChildren(
      el(
        "span",
        { class: "player-name" },
        el("i", {
          class: `checker-dot${p ? " teal" : ""}`,
          "aria-hidden": true,
        }),
        el("strong", {}, names[p]),
      ),
      el(
        "span",
        { class: "muted" },
        `${s.scores[p]}${s.matchLength ? " / " + s.matchLength : ""} · ${pipCount(s, p)} pips`,
      ),
    );
  }
}
export function dieFace(
  die,
  {
    consumed = false,
    choose = null,
    preferred = false,
    player = null,
  } = {},
) {
  const positions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const d = el(choose ? "button" : "span", {
    class: `die${consumed ? " used" : ""}${preferred && choose ? " preferred" : ""}${player === 1 ? " teal-die" : ""}`,
    ...(choose
      ? { type: "button", onClick: choose, "aria-pressed": preferred }
      : { role: "img" }),
    "aria-label": `${choose ? "Prefer die " : ""}${die}${consumed ? ", used" : ""}`,
    ...(choose
      ? { title: "Prefer this die when either can reach the same point" }
      : {}),
  });
  for (let i = 0; i < 9; i++)
    d.append(
      el("i", {
        style: positions[die].includes(i) ? "" : "visibility:hidden",
      }),
    );
  return d;
}
export class DraftBoard {
  constructor(board, onChange = () => {}) {
    this.board = board;
    this.onChange = onChange;
    this.draft = [];
    this.minDraft = 0;
    this.autoCommit = false;
    this.selected = null;
    this.paths = [];
    this.preferred = null;
    board.onPoint = (p, options) => this.point(p, options);
    board.onDragStart = (p) => this.beginDrag(p);
    board.onDrop = (_, p) => this.drop(p);
    board.onCancel = () => {
      this.selected = null;
      this.hint = "Selection cleared. Choose a ringed checker.";
      this.render();
    };
    addEventListener("bg-settings", () => this.render());
  }
  set(s, paths, enabled = true) {
    this.board.endDrag();
    this.state = s;
    this.paths = paths;
    this.draft = [];
    this.minDraft = 0;
    this.autoCommit = false;
    this.selected = null;
    this.hint = "";
    this.preferred = null;
    this.enabled = enabled;
    this.preview = null;
    if (enabled && s.bar[s.turn] && this.candidates().length)
      this.selected = "bar";
    this.render();
  }
  current() {
    return this.draft.reduce((s, step) => applyStep(s, step), this.state);
  }
  candidates() {
    return nextSteps(this.paths, this.draft);
  }
  complete() {
    return matchingPaths(this.paths, this.draft).some(
      (p) => p.steps.length === this.draft.length,
    );
  }
  reverseMoves() {
    return reverseRoutes(this.state, this.paths, this.draft).filter(
      (r) => r.remaining.length >= this.minDraft,
    );
  }
  entrySwitches() {
    return entrySwitchRoutes(this.state, this.paths, this.draft).filter(
      (r) =>
        r.remaining
          .slice(0, this.minDraft)
          .every(
            (s, i) => JSON.stringify(s) === JSON.stringify(this.draft[i]),
          ),
    );
  }
  sources() {
    return [
      ...new Set(
        [...this.candidates(), ...this.reverseMoves()].map((st) => st.from),
      ),
    ];
  }
  routes() {
    if (this.selected === null) return [];
    return [
      ...checkerRoutes(this.paths, this.draft, this.selected),
      ...this.reverseMoves().filter((st) => st.from === this.selected),
      ...this.entrySwitches().filter((st) => st.from === this.selected),
    ];
  }
  point(raw, { quick = false, checkerTap = false } = {}) {
    if (!this.enabled || this.preview) return;
    this.board.cancelAnimations();
    const p = this.normalize(raw);
    this.hint = "";
    const selectedRoutes = this.routes().filter((st) => st.to === p);
    let routes = selectedRoutes;
    // Explicit selected destinations (especially undo/entry revisions) win.
    if (!routes.length && quick) {
      routes = nearestRoutes(this.paths, this.draft, p, this.state.turn);
      if (!routes.length) {
        const backs = this.reverseMoves().filter((r) => r.to === p);
        const nearest = Math.min(...backs.map((r) => r.die));
        routes = backs.filter((r) => r.die === nearest);
      }
    }
    const sourceTap =
      !routes.length && checkerTap && this.sources().includes(p);
    if (sourceTap)
      routes = [
        ...checkerRoutes(this.paths, this.draft, p).filter(
          (r) => r.steps.length === 1,
        ),
        ...this.reverseMoves().filter((r) => r.from === p),
        ...this.entrySwitches().filter((r) => r.from === p),
      ];
    // Equivalent paths with the same resulting position and consumed dice need
    // no extra confirmation. Distinct hits or different die use remain choices.
    const distinct = new Map();
    for (const route of routes.sort(
      (a, b) =>
        Number(b.steps[0].die === this.preferred) -
        Number(a.steps[0].die === this.preferred),
    )) {
      const next =
        route.undo || route.switchDie
          ? route.remaining
          : [...this.draft, ...route.steps];
      const result = next.reduce(
        (s, step) => applyStep(s, step),
        this.state,
      );
      const key =
        boardKey(result) +
        ":" +
        next
          .map((st) => st.die)
          .sort()
          .join();
      if (!distinct.has(key)) distinct.set(key, route);
    }
    const choices = [...distinct.values()];
    if (choices.length && (!sourceTap || choices.length === 1)) {
      const preferred = choices.filter(
        (st) =>
          !st.undo &&
          !st.switchDie &&
          st.steps.length === 1 &&
          st.steps[0].die === this.preferred,
      );
      if (choices.length === 1 || preferred.length === 1)
        this.moveRoute(preferred[0] || choices[0]);
      else {
        const state = this.state,
          signature = JSON.stringify(this.draft);
        const single = choices.every(
          (st) => !st.undo && !st.switchDie && st.steps.length === 1,
        );
        let d;
        d = dialog(
          single ? "Choose a die" : "Choose a route",
          el(
            "p",
            {},
            single
              ? "Both dice reach this destination. Choose which die to use."
              : "These legal paths use different dice or hit different checkers.",
          ),
          choices.map((route) =>
            button(
              route.switchDie
                ? `Change entry · use ${route.die} instead of ${route.replacedDie}`
                : route.undo
                  ? `Move back · restore ${route.steps.map((st) => st.die).join(" + ")}`
                  : single
                    ? `Use ${route.steps[0].die}`
                    : `${route.steps.map((st) => st.die).join(" → ")} · ${notation(route.steps, this.state.turn)}`,
              () => {
                d.close();
                if (
                  this.state === state &&
                  JSON.stringify(this.draft) === signature
                )
                  this.moveRoute(route);
              },
              "primary",
            ),
          ),
        );
      }
      return;
    }
    if (this.sources().includes(p)) {
      this.selected = this.selected === p ? null : p;
      if (this.selected !== null) sound.play("select");
    } else
      this.hint = this.complete()
        ? "Select a moved checker to move it back, use Undo or Reset, or confirm your turn."
        : this.current().bar[this.state.turn]
          ? "Enter your checker from the bar first."
          : typeof p === "number" &&
              this.current().points[p] * (this.state.turn ? -1 : 1) <= -2
            ? "That point is blocked. Choose a highlighted point."
            : "Select a highlighted checker, then tap a destination. You can also drag.";
    this.render();
  }
  normalize(raw) {
    if (raw === null) return null;
    if (typeof raw === "string" && /^(bar|off)[01]$/.test(raw))
      return Number(raw.at(-1)) === this.state.turn
        ? raw.slice(0, -1)
        : null;
    return raw;
  }
  beginDrag(raw) {
    if (!this.enabled || this.preview) return false;
    const source = this.normalize(raw);
    if (!this.sources().includes(source)) return false;
    this.selected = source;
    sound.play("select");
    this.hint =
      "Release on a highlighted point. Release elsewhere to cancel.";
    this.render();
    return true;
  }
  drop(raw) {
    const dest = this.normalize(raw);
    if (!this.routes().some((st) => st.to === dest)) {
      this.hint = "Move cancelled. Drop on a highlighted point, or tap it.";
      this.render();
      this.board.returnDragged(this.selected);
      return;
    }
    this.point(raw);
  }
  preferDie(die) {
    sound.play("select");
    this.preferred = this.preferred === die ? null : die;
    this.hint = this.preferred
      ? `Die ${die} preferred when either die can reach a destination.`
      : "Die preference cleared.";
    this.render();
  }
  move(step) {
    this.moveRoute({
      steps: [step],
      from: step.from,
      to: step.to,
      undo: false,
    });
  }
  moveRoute(route) {
    if (!this.enabled || this.preview) return;
    const next =
      route.undo || route.switchDie
        ? route.remaining
        : [...this.draft, ...route.steps];
    if (!matchingPaths(this.paths, next).length) return;
    const before = this.current();
    this.draft = [...next];
    this.hint = route.switchDie
      ? `Entry uses ${route.die} now. Die ${route.replacedDie} is available again.`
      : route.undo
        ? "Checker moved back. Its dice are available again."
        : "";
    const nextSources = [
      ...new Set(this.candidates().map((st) => st.from)),
    ];
    const entered =
      route.switchDie ||
      (!route.undo &&
        route.steps.length === 1 &&
        route.steps[0].from === "bar");
    this.selected =
      entered && !this.current().bar[this.state.turn]
        ? route.to
        : nextSources.length === 1
          ? nextSources[0]
          : null;
    this.render();
    if (route.switchDie)
      this.board.animateRestore(before, this.current(), "move");
    else if (!route.undo && route.steps.length > 1)
      this.board.animateMove(
        before,
        this.current(),
        { from: route.from, to: route.to },
        false,
        route.steps,
      );
    else if (!route.undo || route.steps.length === 1)
      this.board.animateMove(
        before,
        this.current(),
        route.undo ? { from: route.to, to: route.from } : route.steps[0],
        !!route.undo,
      );
    if (route.undo && route.steps.length > 1)
      this.board.animateRestore(before, this.current(), "undo");
    this.onChange();
  }
  undo() {
    if (this.draft.length <= this.minDraft) return;
    const before = this.current(),
      step = this.draft.at(-1);
    this.preview = null;
    this.draft.pop();
    this.selected = null;
    this.hint = "Move undone. Try another checker or destination.";
    this.render();
    if (step) this.board.animateMove(before, this.current(), step, true);
    this.onChange();
  }
  reset() {
    const before = this.current(),
      changed = this.draft.length > this.minDraft;
    this.preview = null;
    this.draft = this.draft.slice(0, this.minDraft);
    this.autoCommit = false;
    this.selected = null;
    this.hint = this.minDraft
      ? "Choices cleared. Forced steps are kept."
      : "Draft cleared. Your original position is restored.";
    this.render();
    if (changed) this.board.animateRestore(before, this.current());
    this.onChange();
  }
  render() {
    if (!this.state) return;
    const s = this.preview || this.current();
    const moves = this.enabled && !this.preview ? this.routes() : [];
    this.board.render(s, {
      ...settings(),
      selected: this.selected,
      destinations: moves.map((st) => st.to),
      reverseTargets:
        this.enabled && !this.preview
          ? this.reverseMoves().map((r) => r.to)
          : [],
      reachable:
        this.enabled && !this.preview
          ? availableRoutes(this.paths, this.draft).map((r) => r.to)
          : [],
      sources: this.enabled && !this.preview ? this.sources() : [],
      moves,
      interactive: this.enabled && !this.preview,
      preview: !!this.preview,
      usedDice: this.draft.map((st) => st.die),
      chooseDie:
        this.enabled && !this.preview ? (die) => this.preferDie(die) : null,
      preferredDie: this.preferred,
      hideDice: !!this.hideDice,
      lastMove: this.preview ? null : this.lastMove,
    });
    players(s, this.names);
    $("draft-line").setAttribute("role", "status");
    const switchEntry = moves.find((route) => route.switchDie);
    $("draft-line").textContent = this.preview
      ? "Preview only · original position is unchanged"
      : this.hint ||
        (switchEntry
          ? `Tap ↔${switchEntry.die} to change the entry die. ↶ returns to the bar.`
          : this.enabled && this.state.phase === "move"
            ? this.complete()
              ? this.draft.length
                ? "Ready to confirm. Move a checker back, Undo, or Reset to revise."
                : "All entries are blocked. Confirm to pass your turn."
              : this.selected !== null
                ? "Tap or drag to a highlighted point. Arrow targets move back."
                : "Tap a glowing point tip to move the nearest checker, or select and drag a checker."
            : this.draft.length
              ? notation(this.draft, this.state.turn)
              : this.lastMove
                ? `Last move${this.lastMove.dice?.length ? ` · rolled ${this.lastMove.dice.join("–")}` : ""} · ${notation(this.lastMove.steps, this.lastMove.player)}${this.lastMove.steps.length ? " · ghosts show previous locations" : ""}`
                : "");
  }
  picker() {
    const options = this.candidates(),
      switches = this.entrySwitches();
    return select(
      [
        ["", "Choose a legal step…"],
        ...options.map((st, i) => [
          String(i),
          `${notation([st], this.state.turn)} · die ${st.die}`,
        ]),
        ...switches.map((route, i) => [
          `switch-${i}`,
          `Change ${notation([{ from: "bar", to: route.from }], this.state.turn)} entry · use die ${route.die} instead of ${route.replacedDie}`,
        ]),
      ],
      "",
      (v) => {
        if (v.startsWith("switch-"))
          this.moveRoute(switches[Number(v.slice(7))]);
        else if (v !== "") this.move(options[Number(v)]);
      },
    );
  }
}
