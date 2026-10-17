// SPDX-License-Identifier: GPL-3.0-or-later
import { installInputBehavior } from "./input-behavior.mjs";
import { advancedAction, selectedDie } from "../core/advanced-input.mjs";
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
  checkerUndoRoutes,
  undoDieDraft,
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

import { releaseStatus } from "./release-status.mjs";
import { TouchMoves } from "./touch-moves.mjs";
import { installDialogBehavior } from "./dialog-behavior.mjs";
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
// Buttons are kit buttons (.btn plus a variant) unless they draw themselves:
// list rows, ranked moves, tree toggles and theme swatches keep their own class.
const KIT_VARIANTS = { primary: "btn--primary", ghost: "btn--ghost", danger: "btn--danger" };
const CUSTOM_CONTROLS = new Set([
  "list-row", "review-move", "review-cube-choice", "feedback-review",
  "history-evaluation", "history-node-toggle", "theme-preset",
]);
export function buttonClasses(cls = "") {
  const tokens = String(cls).split(/\s+/).filter(Boolean);
  if (tokens.some((t) => CUSTOM_CONTROLS.has(t))) return tokens.join(" ");
  return ["btn", ...tokens.map((t) => KIT_VARIANTS[t]).filter(Boolean), ...tokens].join(" ");
}
export const button = (text, action, cls = "", attrs = {}) => {
  const { class: override, ...rest } = attrs;
  return el(
    "button",
    {
      type: "button",
      class: buttonClasses(override ?? cls),
      onClick: () => Promise.resolve().then(action).catch(showError),
      ...rest,
    },
    text,
  );
};
// In-dialog tab bars (Settings, decision review, history tree): a real
// tablist with aria-selected, a roving tabindex and arrow/Home/End keys.
// `panels` is one panel per tab (in order), or a single region whose content
// follows the selected tab; tabs and panels get ids so each names the other.
let tabSerial = 0;
export function tabBar(list, label, panels) {
  list.setAttribute("role", "tablist");
  if (label) list.setAttribute("aria-label", label);
  const tabs = () => [...list.querySelectorAll('[role="tab"]')];
  const panelOf = (tab) => Array.isArray(panels) ? panels[tabs().indexOf(tab)] : panels;
  for (const tab of tabs()) tab.id ||= `bg-tab-${++tabSerial}`;
  for (const tab of tabs()) {
    const panel = panelOf(tab);
    if (!panel) continue;
    panel.setAttribute("role", "tabpanel");
    panel.id ||= `bg-tabpanel-${++tabSerial}`;
    tab.setAttribute("aria-controls", panel.id);
    if (Array.isArray(panels)) panel.setAttribute("aria-labelledby", tab.id);
  }
  list.addEventListener("keydown", (e) => {
    const enabled = tabs().filter((t) => !t.disabled), i = enabled.indexOf(e.target);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: enabled.length - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault();
    const next = enabled[(to + enabled.length) % enabled.length];
    next.focus();
    next.click();
  });
  return (selected) => {
    for (const tab of tabs()) {
      tab.setAttribute("aria-selected", String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
    }
    if (panels && !Array.isArray(panels)) panels.setAttribute("aria-labelledby", selected.id);
  };
}
const CLOSE_ICON =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
export function field(label, input) {
  input.setAttribute("aria-label", String(label));
  // A button group has several controls; wrapping it in a label would activate
  // its first button when the user taps the heading.
  return el(input.getAttribute("role") === "group" ? "div" : "label", { class: "field" }, label, input);
}
export function select(options, value, change) {
  const node = el("select", { onChange: (e) => change?.(e.target.value) });
  for (const [v, t] of options) node.append(el("option", { value: v }, t));
  node.value = value;
  return node;
}
// One toast: a polite status by default, the assertive alert variant for
// errors. It pauses while hovered or focused and has a dismiss control.
let toastTimer, toastPaused = false;
export function toast(text, { alert = false, duration = 5000 } = {}) {
  const node = $("toast");
  if (!node) return;
  (node.querySelector(".toast-text") || node).textContent = text;
  node.classList.toggle("toast--alert", alert);
  node.setAttribute("role", alert ? "alert" : "status");
  node.setAttribute("aria-live", alert ? "assertive" : "polite");
  node.hidden = false;
  clearTimeout(toastTimer);
  const hide = () => {
    if (toastPaused) { toastTimer = setTimeout(hide, 1000); return; }
    node.hidden = true;
  };
  toastTimer = setTimeout(hide, duration);
}
function installToast(node) {
  node.querySelector(".toast-close").addEventListener("click", () => {
    clearTimeout(toastTimer);
    node.hidden = true;
  });
  const pause = () => { toastPaused = true; };
  const resume = () => { toastPaused = false; };
  node.addEventListener("mouseenter", pause);
  node.addEventListener("mouseleave", resume);
  node.addEventListener("focusin", pause);
  node.addEventListener("focusout", resume);
}
// Errors raised while a dialog is open render inside it, where the user is
// looking; otherwise they go to the alert toast.
export function showError(e) {
  const message = e?.message || String(e);
  const open = [...document.querySelectorAll("dialog.bg-dialog[open]")].at(-1);
  const slot = open?.querySelector(":scope > .dialog-body > .dialog-error");
  if (slot) {
    slot.textContent = message;
    slot.scrollIntoView?.({ block: "nearest" });
  } else toast(message, { alert: true });
  console.error(e);
}
// The one dialog component: kit markup (.dialog-head, a scrolling .dialog-body
// with an error slot, a footer of actions) plus the older .dialog-header,
// .drawer and .close hooks. options.sheet opens it as a bottom sheet on phones.
export function dialog(title, content, actions = [], options = {}) {
  const d = el("dialog", {
      class: `dialog bg-dialog${options.sheet ? " dialog--sheet drawer" : ""}${options.wide ? " dialog--wide" : ""}`,
      "aria-label": title,
    }),
    close = button("", () => d.close(), "ghost close btn--icon", { "aria-label": "Close" });
  close.innerHTML = CLOSE_ICON;
  installDialogBehavior(d, { dismissible: options.sheet || options.dismissible });
  d.append(
    el("div", { class: "dialog-head dialog-header" }, el("h2", {}, title), close),
    el("div", { class: "dialog-body" }, el("div", { class: "dialog-error", role: "alert" }), content),
    el("footer", { class: "dialog-foot" }, ...actions),
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
// Confirms take a verb ("Delete", "Replace", "Leave") and a danger variant;
// the generic "Continue" remains for non-destructive choices.
export function confirmDialog(title, text, action, { verb = "Continue", danger = false } = {}) {
  let d;
  d = dialog(title, el("p", {}, text), [
    button("Cancel", () => d.close(), "ghost"),
    button(
      verb,
      async () => {
        await action();
        d.close();
      },
      danger ? "danger" : "primary",
    ),
  ]);
  return d;
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
  installInputBehavior();
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
  const label = page[0].toUpperCase() + page.slice(1);
  const navLinks = [["play", "Play"], ["trainer", "Trainer"], ["solver", "Solver"], ["library", "Library"], ["controls", "Docs"]]
    .map(([p, text]) => `<a href="/backgammon/${p}/"${p === page ? ' aria-current="page"' : ""}>${text}</a>`)
    .join("");
  document.body.innerHTML = `<a class="skip-link" href="#main">Skip to content</a><div class="app"><header class="topbar"><nav class="crumbs" aria-label="Breadcrumb"><a class="site-link" href="/"><span class="mark" aria-hidden="true">MS</span><span class="sr-only">All projects</span></a><span class="crumb-sep" aria-hidden="true">/</span><a class="brand" href="/backgammon/">Backgammon</a><span class="crumb-sep" aria-hidden="true">/</span><span class="crumb-current" aria-current="page">${label}</span></nav><nav class="nav tool-nav" aria-label="Backgammon tools">${navLinks}</nav><div class="header-tools topbar-actions"><button id="preferences" class="btn btn--ghost" type="button"><svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h9M15 6h2M3 14h2M8 14h9"/><circle cx="13" cy="6" r="2"/><circle cx="6" cy="14" r="2"/></svg><span class="topbar-label">Settings</span></button></div></header><div class="tool-head"><div><h1 id="page-title"></h1><p class="subtitle" id="subtitle"></p></div><div class="toolbar-actions" id="toolbar"><button id="panel-toggle" class="btn panel-toggle" type="button">Details</button></div></div><main class="app-main" id="main" tabindex="-1"><div class="workspace" id="workspace"><section class="stage" aria-label="Game workspace"><div id="opponent" class="player-strip"></div><div id="board" class="board-slot board-frame"></div><div id="player" class="player-strip"></div><div class="action-area"><div id="message" class="action-message" role="status" aria-live="polite"></div><div class="action-main"><div id="actions" class="action-buttons"></div></div><div id="draft-line" class="draft-line"></div></div></section><aside class="inspector panel" id="inspector" aria-label="Details"><div class="panel-body" id="panel"></div></aside></div></main></div><div class="toast-stack"><div class="toast" id="toast" role="status" aria-live="polite" hidden><span class="toast-text"></span><button type="button" class="btn btn--ghost btn--icon toast-close" aria-label="Dismiss">${CLOSE_ICON}</button></div></div>`;
  installToast($("toast"));
  $("page-title").textContent = title;
  const mute = button(
    "",
    () => {
      changeSound({ enabled: !soundPreferences().enabled });
    },
    "ghost sound-toggle btn--icon",
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
  const trigger = button("Tools", () => {
    if (document.querySelector(".tool-menu-dialog")) return;
    const controls = [...toolbar.children].filter(n => n !== trigger && n.id !== "panel-toggle");
    const anchors = controls.map(n => {
      const anchor = document.createComment("tool control");
      n.before(anchor);
      return anchor;
    });
    const menu = el("div", { class: "mobile-tool-list" }, ...controls);
    const d = dialog(`${page[0].toUpperCase() + page.slice(1)} tools`, menu, [], { sheet: true });
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
  const d = dialog("Details", body, [], { sheet: true });
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
      ["0", "White home at bottom right"],
      ["1", "Black home at bottom right"],
    ],
    s.orientation,
    (v) => saveSettings({ orientation: Number(v) }),
  );
  const numbers = el("input", {
    type: "checkbox",
    checked: s.numbers,
    onChange: (e) => saveSettings({ numbers: e.target.checked }),
  });
  const interaction = select([
    ["advanced", "Advanced · one click per die"],
    ["beginner", "Beginner · select, then choose destination"],
  ], s.interactionMode, value => {
    saveSettings({ interactionMode: value });
    dispatchEvent(new Event("bg-settings"));
  });
  interaction.id = "interaction-mode";
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
    field("Playing style", interaction),
    el("p", { class: "muted small" }, "Advanced: click a checker to play the selected die, or a destination to move there. Direct moves take priority over combined dice. S switches dice before moving; after a move, S undoes one draft step. Beginner: select a checker, then choose from highlighted destinations. Dragging works in either mode."),
    field("Board orientation", orient),
    el("label", { class: "check" }, numbers, "Show point numbers"),
    el("label", { class: "check" }, moveHints, "Show legal-move hints in beginner mode"),
    el("p", { class: "muted small" },
      "Turn off checker rings and destination highlights. Your selected checker stays marked; taps, dragging and keyboard moves still work."),
    el("label", {class:"check"}, el("input", {type:"checkbox", checked:s.equityBar,
      onChange: e => { saveSettings({equityBar:e.target.checked}); dispatchEvent(new Event("bg-settings")); }}), "Show equity bar against the computer"),
    el("label", {class:"check"}, el("input", {type:"checkbox", checked:s.moveFeedback,
      onChange: e => saveSettings({moveFeedback:e.target.checked})}), "Show move feedback by default in new computer games"),
    el("label", {class:"check"}, el("input", {type:"checkbox", checked:s.analysisAhead,
      onChange: e => { saveSettings({analysisAhead:e.target.checked}); dispatchEvent(new Event("bg-settings")); }}), "Analyze ahead in computer games"),
    el("p", {class:"muted small"}, "Prepare feedback while you choose, then explore likely replies using spare engine time. Future work is limited to 24 positions or 20 seconds between decisions and pauses when this tab is hidden. Uses more battery; never predicts or changes your actual dice."),
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
  colors.hidden = true;
  const tabs = el("div", { class: "segmented settings-tabs" });
  const sections = [colors, display, keys];
  let selectTab;
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
        selectTab(tab);
        d.querySelector(".dialog-body").scrollTop = 0;
      },
      "",
      { role: "tab", "aria-label": label },
    );
    tab.replaceChildren(
      el("span", { class: "settings-tab-wide", "aria-hidden": true }, label),
      el("span", { class: "settings-tab-short", "aria-hidden": true }, shortLabel),
    );
    tabs.append(tab);
  }
  selectTab = tabBar(tabs, "Settings sections", sections);
  selectTab(tabs.children[1]);
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
    [],
    { dismissible: true },
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
        "GNUbg Core 955555c · web binding bg6. Neural-network evaluation with Kazaross–XG2 match equity and bearoff databases. Evaluation is an estimate, not an exact solution. Browser-supported SIMD acceleration and the scalar fallback use the same weights and analysis settings.",
      ),
      el(
        "p",
        {},
        "Quick: 0 ply. Standard: 1 ply. Deep: 2 ply. Cubeful when the cube is enabled, deterministic, pruning enabled, no noise. Live Quick, Standard and Deep searches evaluate every legal resulting position at the selected depth.",
      ),
      el("p", {}, "Jacoby money games with beavers/raccoons disabled use a precomputed bg5 3-ply book: all 15 opening rolls, all replies to 34 near-best openings, and all rolls at 1,298 third-turn positions after evaluated replies within 0.040 equity of best. Replies use a documented candidate filter; 32 fourth-turn positions have partial coverage. Book entries retain their original engine provenance and override Quick through Expert and Auto; Research and rollouts remain live. Other rules, match scores and unlisted moves use live analysis."),
      el(
        "p",
        {},
        "Gammon probabilities include backgammons. Money equity is in units of the current cube; match winning chance is a probability. Small differences are not certainty.",
      ),
      el(
        "p",
        {},
        "Auto (the default for computer play, hints and reviews) completes at least 2 ply and normally continues to 3, up to 4, unless the next stage is estimated above 5 seconds or the leader has a substantial stable advantage. Full 0–2 ply searches remain available. Resumable GNUbg rollouts use 0-ply play and ordinary cube rules; beavers/raccoons remain tree-analysis only. GNU IDs and proprietary binary imports are unsupported.",
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
        { href: "/backgammon/engine/source/gnubg-core-955555c-bg6.tar.gz" },
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
export function players(s, names = ["White", "Black"]) {
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
          { backgroundColor: "color-mix(in oklab, var(--accent) 18%, transparent)" },
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
        el("strong", { title: names[p] }, names[p]),
        active ? el("span", { class: "player-status badge badge--accent badge--plain" },
          s.phase === "roll" ? "To roll" : s.phase === "move" ? "To move" : "To reply") : null,
      ),
      el(
        "span",
        { class: "muted player-stats" },
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
    board.onSwitchDice = () => this.switchDice();
    board.onDieTap = (index, value) => this.tapDie(index, value);
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
      this.dragging = false;
      this.selected = null;
      this.hint = "Selection cleared. Choose a ringed checker.";
      this.render();
    };
    addEventListener("bg-settings", () => this.render());
  }
  set(s, paths, enabled = true) {
    this.board.endDrag();
    this.dragging = false;
    this.state = s;
    this.paths = paths;
    this.draft = [];
    this.minDraft = 0;
    this.selected = null;
    this.hint = "";
    this.preferred = null;
    this.enabled = enabled;
    this.preview = null;
    if (enabled && !this.advanced && s.bar[s.turn] && this.candidates().length)
      this.selected = "bar";
    this.render();
  }
  cached(name, calculate) {
    const key = JSON.stringify([this.draft, this.minDraft]);
    if (this.memo?.state !== this.state || this.memo.paths !== this.paths || this.memo.key !== key)
      this.memo = { state: this.state, paths: this.paths, key, values: new Map() };
    if (!this.memo.values.has(name)) this.memo.values.set(name, calculate());
    return this.memo.values.get(name);
  }
  current() {
    return this.cached("current", () => this.draft.reduce((s, step) => applyStep(s, step), this.state));
  }
  candidates() {
    return this.cached("candidates", () => nextSteps(this.paths, this.draft));
  }
  complete() {
    return this.cached("complete", () => matchingPaths(this.paths, this.draft).some(
      (p) => p.steps.length === this.draft.length,
    ));
  }
  progressMessage(idle, ready = "Ready to confirm") {
    if (!this.draft.length) return document.createTextNode(idle);
    // Count playable steps, not merely unused dice: a blocked die and winning
    // partway through a roll must not leave a misleading "move left" label.
    const left = Math.max(0, ...matchingPaths(this.paths, this.draft)
      .map(path => path.steps.length - this.draft.length));
    return el("span", { class: "draft-progress", "data-complete": String(left === 0) },
      el("span", { class: "draft-progress-moves" },
        el("span", { class: "sr-only" }, "Draft: "),
        notation(this.draft, this.state.turn)),
      el("span", { class: "draft-progress-status" },
        left ? `${left} move${left === 1 ? "" : "s"} left` : ready),
    );
  }
  reverseMoves() {
    return this.cached("reverseMoves", () => originalReturnRoutes(
      this.state, this.paths, this.draft, this.minDraft,
    ));
  }
  checkerUndos() {
    return this.cached("checkerUndos", () => checkerUndoRoutes(
      this.state, this.paths, this.draft, this.minDraft,
    ));
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
  get advanced() { return settings().interactionMode === "advanced"; }
  activeDie() { return selectedDie(this.candidates(), this.preferred, this.state.dice); }
  switchDice() {
    if (!this.enabled || this.preview) return;
    if (this.draft.length > this.minDraft) return this.undo();
    const current = this.activeDie();
    const next = this.candidates().find(step => step.die !== current)?.die;
    if (next) this.preferDie(next);
  }
  tapDie(index, value) {
    if (!this.enabled || this.preview || this.board.playbackTimer) return;
    if (this.draft.length > this.minDraft) return this.undoDie(index ?? this.draft.length - 1);
    // Forced steps cannot be undone. With no editable draft, retain die choice.
    if (index !== null) return;
    if (value !== (this.advanced ? this.activeDie() : this.preferred)) this.preferDie(value);
    else this.switchDice();
  }
  point(raw, options = {}) {
    if (!this.enabled || this.preview || this.board.playbackTimer) return;
    if (this.advanced && options.activation !== false) {
      const point = this.normalize(raw);
      if (point === null) return this.clearSelection();
      const checker = options.checkerTap || (!options.quick && this.sources().includes(point));
      const action = advancedAction({ point, checker, candidates: this.candidates(),
        returns: this.reverseMoves(), checkerReturns: this.checkerUndos(), routes: checker ? [] : nearestRoutes(this.paths, this.draft, point, this.state.turn), preferred: this.preferred, dice: this.state.dice, turn: this.state.turn });
      if (action?.type === "move") this.move(action.step);
      else if (action?.type === "undo") this.moveRoute(action.route);
      else if (action?.type === "routes") this.chooseRoutes(action.routes);
      else this.clearSelection();
      return action?.type || "unavailable";
    }
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
    if (destinationTap && returning.length &&
        (this.selected === null || returning.some(r => r.from === this.selected))) {
      this.chooseRoutes((this.selected === null ? returning : returning.filter(r => r.from === this.selected))
        .sort((a,b) => a.die - b.die).slice(0,1));
      return 'undo';
    }
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
    if (this.chooseRoutes(routes, sourceTap)) return;
    if (!selectable) return "unavailable";
    this.selected = p;
    this.hint = "";
    sound.play("select");
    this.render();
    return "selected";
  }
  routeChoices(routes) {
    const current = this.current();
    // Equivalent paths with the same resulting position and consumed dice need
    // no extra confirmation. Combined shortcuts prefer hits; distinct hitting
    // outcomes and different die use remain choices.
    const distinct = new Map();
    for (const route of [...routes].sort(
      (a, b) =>
        Number(b.steps[0].die === selectedDie(this.candidates(), this.preferred, this.state.dice)) -
        Number(a.steps[0].die === selectedDie(this.candidates(), this.preferred, this.state.dice)),
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
    return preferHittingRoutes(current, [...distinct.values()]);
  }
  preferredRoute(choices) {
    return choices.find(route => !route.undo && !route.switchDie &&
      route.steps[0].die === selectedDie(this.candidates(), this.preferred, this.state.dice)) || choices[0] || null;
  }

  dropPreview(raw) {
    const point = this.normalize(raw);
    if (point === this.selected) {
      const state = this.current();
      return { point, count: typeof point === 'number' ? Math.abs(state.points[point]) : state[point][state.turn], undo: false };
    }
    const choices = this.routeChoices(this.routes().filter(route => route.to === point));
    const route = this.preferredRoute(choices) || choices[0];
    if (!route) return null;
    // Revisions/returns replay the replacement draft, never reverse-apply a
    // forward step. All paths for this dragged checker share its landing point.
    const steps = route.undo || route.switchDie ? route.remaining : [...this.draft, ...route.steps];
    const after = steps.reduce((s, step) => applyStep(s, step), this.state);
    return { point, count: typeof point === "number" ? Math.abs(after.points[point]) : after[point][after.turn], undo: !!route.undo };
  }
  chooseRoutes(routes, sourceTap = false) {
    const choices = this.routeChoices(routes);
    if (choices.length && (!sourceTap || choices.length === 1)) {
      this.moveRoute(this.preferredRoute(choices));
      return true;
    }
    return false;
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
    this.dragging = true;
    this.selected = source;
    sound.play("select");
    this.hint =
      "Release to place the checker; nearby misses snap to its closest legal destination.";
    this.render();
    return true;
  }
  drop(raw) {
    this.dragging = false;
    const dest = this.normalize(raw);
    if (dest === this.selected || !this.routes().some((st) => st.to === dest)) {
      this.hint = "";
      const source = this.selected;
      this.selected = null;
      this.render();
      this.board.returnDragged(source);
      return;
    }
    this.point(raw, { activation: false });
  }
  preferDie(die) {
    sound.play("select");
    this.preferred = this.advanced ? die : this.preferred === die ? null : die;
    this.hint = this.advanced ? `Die ${die} selected.` : this.preferred
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
    // Finishing/revising an entry returns to the overview, including multi-die
    // entries. The remaining legal paths still enforce priority for the bar.
    const entered = !route.undo && route.steps.some((step) => step.from === "bar");
    this.selected =
      this.advanced ? null : entered
        ? null
        : route.switchDie && !this.current().bar[this.state.turn]
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
    return this.undoTo(this.draft.length - 1);
  }
  undoDie(index) {
    if (!this.enabled || this.preview) return;
    const remaining = undoDieDraft(this.state, this.paths, this.draft, index, this.minDraft);
    if (!remaining) return;
    const before = this.current(), step = this.draft[index],
      count = this.draft.length - remaining.length,
      exact = JSON.stringify(remaining) === JSON.stringify(this.draft.filter((_, i) => i !== index));
    this.draft = remaining;
    if (this.advanced) this.preferred = step.die;
    this.selected = null;
    this.hint = count === 1 ? "Move undone." : "Move and dependent continuation undone.";
    this.render();
    if (exact) this.board.animateMove(before, this.current(), step, true);
    else this.board.animateRestore(before, this.current(), "undo");
    this.onChange({ kind: "undo" });
  }
  undoTo(index) {
    if (!this.enabled || this.preview || !Number.isInteger(index) ||
        index < this.minDraft || index >= this.draft.length) return;
    const before = this.current(),
      step = this.draft[index], count = this.draft.length - index;
    this.preview = null;
    this.draft = this.draft.slice(0, index);
    if (this.advanced) this.preferred = step.die;
    this.selected = null;
    this.hint = count === 1 ? "Move undone." : `${count} moves undone.`;
    this.render();
    if (count === 1) this.board.animateMove(before, this.current(), step, true);
    else this.board.animateRestore(before, this.current(), "undo");
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
    // While holding a checker, show all its legal landing/return targets in
    // either input mode. Releasing restores the user's normal hint preference.
    display.moveHints = this.dragging || (display.moveHints && !this.advanced);
    const moves = this.enabled && !this.preview ? this.routes() : [];
    this.touchMoves?.update({
      enabled: this.enabled && !this.preview && !this.advanced && this.state.phase === "move",
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
      // Match the actual checker-disc action, not merely the existence of a
      // reversible journey. A checker able to play either die still moves.
      undoSources: this.enabled && !this.preview && this.advanced
        ? this.checkerUndos().filter(route => !this.candidates().some(step => step.from === route.from)).map(route => route.from)
        : [],
      revisionTargets:
        this.enabled && !this.preview
          ? (this.selected === null
              ? this.entrySwitches()
              : moves.filter((r) => r.switchDie)
            ).map((r) => r.to)
          : [],
      moves,
      dropPreview: (point) => this.dropPreview(point),
      interactive: this.enabled && !this.preview,
      preview: !!this.preview,
      usedDice: this.draft.map((st) => st.die),
      lockedDice: this.minDraft,
      forcedDice: this.draft.filter((st, index) => index < this.minDraft || nextSteps(this.paths, this.draft.slice(0, index)).length === 1).map(st => st.die),
      playableDice: this.enabled && !this.preview ? this.candidates().map(st => st.die) : null,
      boardShortcuts: this.shortcutsEnabled && display.keyboardEnabled ? display.shortcuts : null,
      advanced: this.advanced,
      chooseDie:
        this.enabled && !this.preview ? (die) => this.preferDie(die) : null,
      preferredDie: this.advanced ? this.activeDie() : this.preferred,
      hideDice: !!this.hideDice,
      lastMove: this.preview
        ? this.previewTrace?.state === this.preview ? this.previewTrace.trace : null
        : this.lastMove,
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
            ? this.advanced && !this.complete()
              ? `Click a checker or destination · using die ${this.activeDie() ?? "–"}.`
              : this.complete()
              ? this.draft.length
                ? "Ready to confirm. Tap a used die to undo its move."
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
