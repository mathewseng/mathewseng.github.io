// SPDX-License-Identifier: GPL-3.0-or-later
import { EquityBar } from "./equity-bar.mjs";
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
  originalReturnRoutes,
  dieSwitchRoutes,
  preferHittingRoutes,
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
import { TouchMoves } from "./touch-moves.mjs";
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
    else if (k.startsWith("aria-") && v !== null)
      n.setAttribute(k, String(v));
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
  // Safari's on-screen keyboard can shrink the visual viewport without
  // changing dvh. Keep form actions inside that visible region; pinch zoom
  // remains browser-controlled rather than triggering a layout change.
  const viewport = window.visualViewport;
  const fitViewport = () => {
    if (!viewport || viewport.scale !== 1) return;
    d.style.setProperty("--dialog-visible-height", `${viewport.height}px`);
    d.style.setProperty("--dialog-visible-top", `${viewport.offsetTop}px`);
    d.toggleAttribute("data-keyboard", innerHeight - viewport.height > 100);
  };
  viewport?.addEventListener("resize", fitViewport);
  viewport?.addEventListener("scroll", fitViewport);
  fitViewport();
  d.addEventListener("close", () => {
    viewport?.removeEventListener("resize", fitViewport);
    viewport?.removeEventListener("scroll", fitViewport);
    d.remove();
  });
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
let activeBoard, activeEquity;
export function shell(page, title, subtitle = "") {
  activeEquity?.destroy();
  activeEquity = null;
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
  installMobileTools(page);
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
  if (["play", "trainer", "solver"].includes(page)) {
    const equityToggle = button("Equity bar", () => {}, "ghost", {
      id: "equity-toggle", "aria-pressed": "false",
    });
    $("toolbar").prepend(equityToggle);
    activeEquity = new EquityBar(activeBoard, equityToggle);
  }
  return { board: activeBoard, panel: $("panel"), equityBar: activeEquity };
}

// Move the real controls into the phone sheet: no duplicate IDs, handlers or
// toggle state. Anchors preserve their desktop order when the sheet closes.
function installMobileTools(page) {
  document.querySelector(".app").dataset.page = page;
  const toolbar = $("toolbar");
  const trigger = button("More", () => {
    if (document.querySelector(".tool-menu-dialog")) return;
    const controls = [...toolbar.children].filter(n => n !== trigger && n.id !== "panel-toggle");
    const anchors = controls.map(n => {
      const anchor = document.createComment("tool control");
      n.before(anchor);
      return anchor;
    });
    const menu = el("div", { class: "mobile-tool-list" }, ...controls);
    const d = dialog(`${page[0].toUpperCase() + page.slice(1)} tools`, menu);
    d.classList.add("drawer", "tool-menu-dialog");
    trigger.setAttribute("aria-expanded", "true");
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      controls.forEach((node, i) => anchors[i].replaceWith(node));
      trigger.setAttribute("aria-expanded", "false");
    };
    // Restore before an action rerenders or opens another dialog.
    menu.addEventListener("click", event => {
      if (event.target.closest("button:not(:disabled), a")) {
        restore();
        d.close();
      }
    }, { capture: true });
    d.addEventListener("close", restore, { once: true });
  }, "ghost mobile-tools-toggle", {
    id: "mobile-tools", "aria-haspopup": "dialog", "aria-expanded": "false",
    "aria-label": `${page[0].toUpperCase() + page.slice(1)} tools`,
  });
  toolbar.append(trigger);
}
export function openPanel() {
  const existing = document.getElementById("details-dialog");
  if (existing?.open) { existing.querySelector(".close").focus(); return; }
  const body = $("panel"),
    home = $("inspector");
  const d = dialog("Details", body);
  d.id = "details-dialog";
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
  const moveHints = el("input", {
    id: "move-hints",
    type: "checkbox",
    checked: s.moveHints,
    onChange: (e) => {
      saveSettings({ moveHints: e.target.checked });
      dispatchEvent(new Event("bg-settings"));
    },
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
    { class: "stack settings-display" },
    field("Board orientation", orient),
    el("label", { class: "check" }, numbers, "Show point numbers"),
    el("label", { class: "check" }, moveHints, "Show legal-move hints"),
    el("p", { class: "muted small" },
      "Turn off checker rings and destination highlights. Your selected checker stays marked; taps, dragging and keyboard moves still work."),
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
    el("a", { href: "/" }, "All projects"),
    el("a", { href: "/backgammon/controls/", target: "_blank", rel: "noopener" }, "Clicks & highlights guide"),
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
  for (const [label, shortLabel, section] of [
    ["Board colors", "Board", colors],
    ["Display & controls", "Display", display],
    ["Keyboard", "Keyboard", keys],
  ]) {
    const tab = button(
      label,
      () => {
        colors.hidden = section !== colors;
        display.hidden = section !== display;
        keys.hidden = section !== keys;
        for (const t of tabs.children)
          t.setAttribute("aria-pressed", String(t === tab));
        d.querySelector(".dialog-body").scrollTop = 0;
      },
      "",
      { "aria-pressed": section === colors, "aria-label": label },
    );
    tab.replaceChildren(
      el("span", { class: "settings-tab-wide", "aria-hidden": true }, label),
      el("span", { class: "settings-tab-short", "aria-hidden": true }, shortLabel),
    );
    tabs.append(tab);
  }
  const release = releaseStatus();
  display.append(el("details", { class: "settings-updates" },
    el("summary", {}, "App version & updates"), release));
  const d = dialog(
    "Settings",
    el(
      "div",
      { class: "settings-content" },
      colors,
      display,
      keys,
    ),
  );
  d.classList.add("settings-dialog");
  // Keep navigation outside the scrolling editor: tabs and Close must always
  // remain reachable on a phone, including with its software keyboard open.
  d.querySelector(".dialog-header").after(tabs);
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
        "GNUbg Core 955555c · web binding bg5. Neural-network evaluation with Kazaross–XG2 match equity and bearoff databases. Evaluation is an estimate, not an exact solution. Browser-supported SIMD acceleration and the scalar fallback use the same weights and analysis settings.",
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
        "Solver supports 0–4 ply evaluation and resumable GNUbg rollouts with sampling error. Rollouts use 0-ply play and ordinary cube rules; beavers/raccoons remain tree-analysis only. GNU IDs and proprietary binary imports are unsupported.",
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
        { href: "/backgammon/engine/source/gnubg-core-955555c-bg5.tar.gz" },
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
// Input semantics depend on the visible state and hit region, never click speed.
export class DraftBoard {
  constructor(board, onChange = () => {}) {
    this.board = board;
    this.onChange = onChange;
    this.draft = [];
    this.minDraft = 0;
    this.selected = null;
    this.paths = [];
    this.preferred = null;
    const actionArea = board.container.closest(".stage")?.querySelector(".action-area");
    if (actionArea)
      this.touchMoves = new TouchMoves(actionArea, {
        selectSource: (point) => point === null
          ? this.clearSelection()
          : this.point(point, { checkerTap: true }),
        selectDestination: (point) => this.point(point, { activation: false }),
      });
    board.onPoint = (p, options) => this.point(p, options);
    board.onBackground = () => this.clearSelection();
    const outsideBackground = (target) =>
      board.container.isConnected && !board.svg.contains(target) &&
      !target.closest?.(
        'button,a,input,select,textarea,label,summary,dialog,[role="button"],[contenteditable]',
      );
    document.addEventListener("click", (e) => {
      if (outsideBackground(e.target) &&
          performance.now() >= (board.suppressClickUntil || 0))
        this.clearSelection();
    });
    // Mobile Safari may omit click events on plain text. Treat only a stationary
    // background tap as dismissal; a scroll, cancelled pointer or drag is not one.
    let backgroundTap = null;
    document.addEventListener("pointerdown", (e) => {
      backgroundTap = e.isPrimary && e.button === 0 && outsideBackground(e.target)
        ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    });
    document.addEventListener("pointermove", (e) => {
      if (backgroundTap?.id === e.pointerId &&
          Math.hypot(e.clientX - backgroundTap.x, e.clientY - backgroundTap.y) > 8)
        backgroundTap = null;
    });
    document.addEventListener("pointercancel", () => { backgroundTap = null; });
    document.addEventListener("pointerup", (e) => {
      const tap = backgroundTap;
      backgroundTap = null;
      if (tap?.id === e.pointerId && outsideBackground(e.target) &&
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 8 &&
          performance.now() >= (board.suppressClickUntil || 0))
        this.clearSelection();
    });
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
    return originalReturnRoutes(
      this.state, this.paths, this.draft, this.minDraft,
    );
  }
  entrySwitches() {
    const key = JSON.stringify([this.draft, this.minDraft]);
    if (
      this.revisionCache?.state !== this.state ||
      this.revisionCache.paths !== this.paths ||
      this.revisionCache.key !== key
    )
      this.revisionCache = {
        state: this.state,
        paths: this.paths,
        key,
        routes: dieSwitchRoutes(
          this.state, this.paths, this.draft, this.minDraft,
        ),
      };
    return this.revisionCache.routes;
  }

  sources() {
    return [
      ...new Set(
        [
          ...this.candidates(), ...this.reverseMoves(), ...this.entrySwitches(),
        ].map((st) => st.from),
      ),
    ];
  }
  arrivals(point) {
    const forward = nearestRoutes(
      this.paths, this.draft, point, this.state.turn,
    );
    return forward.length
      ? forward
      : this.entrySwitches().filter((r) => r.to === point);
  }
  routes() {
    if (this.selected === null) return [];
    return [
      ...checkerRoutes(this.paths, this.draft, this.selected),
      ...this.reverseMoves().filter((st) => st.from === this.selected),
      ...this.entrySwitches().filter((st) => st.from === this.selected),
    ];
  }
  point(raw, options = {}) {
    if (!this.enabled || this.preview) return;
    const result = this.resolvePoint(raw, options);
    if (result === "unavailable" && options.activation !== false)
      this.clearSelection();
    return result;
  }
  clearSelection() {
    if (!this.enabled || this.preview || this.selected === null) return;
    this.selected = null;
    this.hint = "";
    this.render();
  }
  resolvePoint(
    raw,
    {
      activation = true,
      quick = false,
      checkerTap = false,
    } = {},
  ) {
    const p = this.normalize(raw);
    const destinationTap = activation && quick && !checkerTap;
    const selectable = this.sources().includes(p) ||
      this.entrySwitches().some((route) => route.from === p);
    const toggleSelection = () => {
      const deselected = this.selected === p;
      if (!deselected && !selectable) return "unavailable";
      this.selected = deselected ? null : p;
      this.hint = deselected
        ? "Selection cleared. Choose a checker or a highlighted destination."
        : "";
      if (!deselected) sound.play("select");
      this.render();
      return deselected ? "deselected" : "selected";
    };
    const selectedRoutes = this.routes().filter((st) => st.to === p);
    const returning = this.reverseMoves().filter((r) => r.to === p);
    const incoming = destinationTap || checkerTap
      ? this.arrivals(p)
      : [];
    const highlightedTarget = selectedRoutes.length ||
      (this.selected === null && (incoming.length || returning.length));
    // A movable physical disc is selection input, even over a destination.
    // An immovable resident must not swallow its point's advertised action.
    // Keyboard activation toggles an existing selection; Shift requests a destination.
    if (
      activation &&
      ((checkerTap && (selectable || this.selected === p || !highlightedTarget)) ||
        (!destinationTap && this.selected !== null && p === this.selected))
    )
      return toggleSelection();
    const current = this.current();
    // The visible selection is a promise: ordinary destination input can only
    // play its advertised routes. Changing source remains a single click.
    if (this.selected !== null && !selectedRoutes.length) {
      if (selectable || p === this.selected) {
        if (!destinationTap && !checkerTap && p !== this.selected) {
          const backs = this.reverseMoves().filter((r) => r.from === p);
          const alternatives = [
            ...checkerRoutes(this.paths, this.draft, p),
            ...this.entrySwitches().filter((r) => r.from === p),
          ];
          if (!alternatives.length && backs.length === 1) {
            this.moveRoute(backs[0]);
            return;
          }
        }
        return toggleSelection();
      }
      return "unavailable";
    }
    const ownPoint =
      typeof p === "number" &&
      current.points[p] * (this.state.turn ? -1 : 1) > 0;
    // Point-space shortcuts select the resident only after all advertised
    // arrivals (including amber draft returns) have been considered.
    if (
      destinationTap && !selectedRoutes.length && !incoming.length && !returning.length &&
      (ownPoint || (p === "bar" && current.bar[this.state.turn]))
    )
      return toggleSelection();
    // A selected checker's legal destination wins even over an occupied point.
    // Without that route, point-space taps request the
    // nearest incoming checker. Ordinary keys select an owned source.
    const sourceTap =
      !incoming.length &&
      !selectedRoutes.length &&
      (!returning.length || (!destinationTap && selectable)) &&
      ((ownPoint && activation && !current.bar[this.state.turn]) ||
        (p === "bar" &&
          current.bar[this.state.turn] &&
          !selectedRoutes.length));
    let routes;
    if (sourceTap) {
      const backs = this.reverseMoves().filter((r) => r.from === p);
      const alternatives = [
        ...checkerRoutes(this.paths, this.draft, p),
        ...this.entrySwitches().filter((r) => r.from === p),
      ];
      // Ordinary keys retain the undo-only shortcut. A different initial
      // die also counts as an alternative, even if continuing forward is blocked.
      routes = alternatives.length ? [] : backs;
    } else {
      routes = selectedRoutes.length ? selectedRoutes : incoming;
      if (!routes.length) {
        routes = this.arrivals(p);
        if (!routes.length) {
          const nearest = Math.min(...returning.map((r) => r.die));
          routes = returning.filter((r) => r.die === nearest);
        }
      }
    }
    // Equivalent paths with the same resulting position and consumed dice need
    // no extra confirmation. Combined shortcuts prefer hits; distinct hitting
    // outcomes and different die use remain choices.
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
    const choices = preferHittingRoutes(current, [...distinct.values()]);
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
                ? `Revise checker · ${notation(route.steps, this.state.turn)}`
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
    if (!selectable) return "unavailable";
    this.selected = p;
    this.hint = "";
    sound.play("select");
    this.render();
    return "selected";
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
      this.hint = "";
      this.render();
      this.board.returnDragged(this.selected);
      return;
    }
    this.point(raw, { activation: false });
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
      ? "Checker revised. Used and remaining dice updated."
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
          : !nextSources.length && !route.undo &&
              this.reverseMoves().some((r) => r.from === route.to)
            ? route.to
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
    this.onChange({
      kind: route.undo ? "undo" : route.switchDie ? "revision" : "move",
    });
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
    this.onChange({ kind: "undo" });
  }
  reset() {
    const before = this.current(),
      changed = this.draft.length > this.minDraft;
    this.preview = null;
    this.draft = this.draft.slice(0, this.minDraft);
    this.selected = null;
    this.hint = this.minDraft
      ? "Choices cleared. Forced steps are kept."
      : "Draft cleared. Your original position is restored.";
    this.render();
    if (changed) this.board.animateRestore(before, this.current());
    this.onChange({ kind: "reset" });
  }
  render() {
    if (!this.state) return;
    const s = this.preview || this.current();
    const display = settings();
    const moves = this.enabled && !this.preview ? this.routes() : [];
    this.touchMoves?.update({
      enabled: this.enabled && !this.preview && this.state.phase === "move",
      hints: display.moveHints,
      selected: this.selected,
      sources: this.enabled && !this.preview ? this.sources() : [],
      routes: moves,
      orientation: display.orientation,
    });
    this.board.render(s, {
      ...display,
      selected: this.enabled && !this.preview ? this.selected : null,
      destinations: moves.map((st) => st.to),
      reverseTargets:
        this.enabled && !this.preview
          ? (this.selected === null
              ? this.reverseMoves()
              : moves.filter((r) => r.undo)
            ).map((r) => r.to)
          : [],
      reachable:
        this.enabled && !this.preview
          ? (this.selected === null
              ? [
                  ...availableRoutes(this.paths, this.draft),
                  ...this.entrySwitches(),
                ]
              : moves.filter((r) => !r.undo)
            ).map((r) => r.to)
          : [],
      sources: this.enabled && !this.preview ? this.sources() : [],
      revisionTargets:
        this.enabled && !this.preview
          ? (this.selected === null
              ? this.entrySwitches()
              : moves.filter((r) => r.switchDie)
            ).map((r) => r.to)
          : [],
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
    const switchEntry = display.moveHints && moves.find((route) => route.switchDie);
    $("draft-line").textContent = this.preview
      ? "Preview only · original position is unchanged"
      : this.hint ||
        (switchEntry
          ? switchEntry.origin === "bar"
            ? "Tap ↔ to revise this checker’s entry. ↶ returns to the bar."
            : "Tap ↔ to revise this checker’s dice. ↶ returns to the starting point."
          : this.enabled && this.state.phase === "move"
            ? this.complete()
              ? this.draft.length
                ? "Ready to confirm. Move a checker back, Undo, or Reset to revise."
                : "All entries are blocked. Confirm to pass your turn."
              : this.selected !== null
                ? display.moveHints
                  ? "Tap or drag to a highlighted point. Arrow targets move back."
                  : "Tap a destination or drag the selected checker."
                : "Tap a checker to select; tap an open part of a point to play there."
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
          `Revise ${notation([{ from: route.origin, to: route.from }], this.state.turn)} → ${notation(route.steps, this.state.turn)}`,
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
