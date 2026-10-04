// SPDX-License-Identifier: GPL-3.0-or-later
import { settings, saveSettings, put, itemRecord } from "../core/storage.mjs";
import {
  playerName,
  pipCount,
  notation,
  matchingPaths,
  nextSteps,
  applyStep,
  clone,
} from "../core/rules.mjs";
import { Board } from "./board.mjs";
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
    else if (v !== false && v !== null) n.setAttribute(k, v === true ? "" : v);
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
    tags = el("input", { placeholder: "Comma-separated tags", maxlength: 400 });
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
export function shell(page, title, subtitle = "") {
  document.documentElement.dataset.motion = settings().motion;
  document.body.innerHTML = `<div class="app"><header class="topbar"><a class="brand" href="/backgammon/"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>Backgammon</a><nav class="nav" aria-label="Backgammon tools">${["play", "trainer", "solver", "library"].map((p) => `<a href="/backgammon/${p}/" ${p === page ? 'aria-current="page"' : ""}>${p[0].toUpperCase() + p.slice(1)}</a>`).join("")}</nav><div class="header-tools"><a class="site-link" href="/">All projects</a><button id="preferences" class="ghost" type="button">Settings</button></div></header><div class="tool-head"><div><h1 id="page-title"></h1><p class="subtitle" id="subtitle"></p></div><div class="toolbar-actions" id="toolbar"><button id="panel-toggle" class="panel-toggle" type="button">Details</button></div></div><main class="workspace" id="workspace"><section class="stage" aria-label="Game workspace"><div id="opponent" class="player-strip"></div><div id="board" class="board-slot"></div><div id="player" class="player-strip"></div><div class="action-area"><div id="message" class="action-message" role="status" aria-live="polite"></div><div class="action-main"><div id="dice" class="dice"></div><div id="actions" class="action-buttons"></div></div><div id="draft-line" class="draft-line"></div></div></section><aside class="inspector" id="inspector" aria-label="Details"><div class="panel-body" id="panel"></div></aside></main></div><div class="toast" id="toast" role="status" hidden></div>`;
  $("page-title").textContent = title;
  $("subtitle").textContent = subtitle;
  $("panel-toggle").onclick = () => openPanel();
  $("preferences").onclick = () => preferences();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/backgammon/sw.js", { scope: "/backgammon/" })
      .catch(() => {});
  return { board: new Board($("board")), panel: $("panel") };
}
export function openPanel() {
  const body = $("panel"),
    home = $("inspector");
  const d = dialog("Details", body);
  d.classList.add("drawer");
  d.addEventListener("close", () => home.append(body));
}
export function preferences() {
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
    },
  );
  const body = el(
    "div",
    { class: "stack" },
    field("Board orientation", orient),
    el("label", { class: "check" }, numbers, "Show point numbers"),
    field("Motion", motion),
    el(
      "p",
      { class: "muted small" },
      "Dark appearance · settings apply across all four tools.",
    ),
    button("About, engine & licenses", about),
  );
  const d = dialog("Settings", body);
  d.addEventListener("close", () => dispatchEvent(new Event("bg-settings")));
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
        "GNUbg Core 955555c · web binding bg1. Neural-network evaluation with Kazaross–XG2 match equity and bearoff databases. Evaluation is an estimate, not an exact solution.",
      ),
      el(
        "p",
        {},
        "Quick: 0 ply. Standard: 1 ply. Deep: 2 ply. Cubeful, deterministic, pruning enabled, no noise. Every legal resulting position is evaluated at the selected depth.",
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
        { href: "/backgammon/engine/source/gnubg-core-955555c-bg1.tar.gz" },
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
    row.classList.toggle("active", s.turn === p && s.phase !== "over");
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
export function diceView(dice, used = []) {
  const parent = $("dice");
  parent.replaceChildren();
  const positions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const rest = [...used];
  for (const die of dice.length && dice[0] === dice[1]
    ? Array(4).fill(dice[0])
    : dice) {
    const consumed = rest.includes(die);
    if (consumed) rest.splice(rest.indexOf(die), 1);
    const d = el("span", {
      class: `die${consumed ? " used" : ""}`,
      role: "img",
      "aria-label": `${die}${consumed ? ", used" : ""}`,
    });
    for (let i = 0; i < 9; i++)
      d.append(
        el("i", {
          style: positions[die].includes(i) ? "" : "visibility:hidden",
        }),
      );
    parent.append(d);
  }
}
export class DraftBoard {
  constructor(board, onChange = () => {}) {
    this.board = board;
    this.onChange = onChange;
    this.draft = [];
    this.selected = null;
    this.paths = [];
    this.preferred = null;
    board.onPoint = (p) => this.point(p);
    addEventListener("bg-settings", () => this.render());
  }
  set(s, paths, enabled = true) {
    this.state = s;
    this.paths = paths;
    this.draft = [];
    this.selected = null;
    this.enabled = enabled;
    this.preview = null;
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
  point(raw) {
    if (!this.enabled || this.preview) return;
    let p = raw;
    if (String(raw).startsWith("bar")) p = "bar";
    if (String(raw).startsWith("off")) p = "off";
    if (
      typeof raw === "string" &&
      /[01]$/.test(raw) &&
      Number(raw.at(-1)) !== this.state.turn
    )
      return;
    const options = this.candidates();
    const dest = options.filter(
      (st) => st.from === this.selected && st.to === p,
    );
    if (dest.length > 1) {
      const chosen = dest.find((st) => st.die === this.preferred);
      if (chosen) this.move(chosen);
      else {
        let d;
        d = dialog(
          "Choose a die",
          el(
            "p",
            {},
            "Both dice reach this destination. Choose which die to use.",
          ),
          dest.map((st) =>
            button(
              `Use ${st.die}`,
              () => {
                d.close();
                this.move(st);
              },
              "primary",
            ),
          ),
        );
      }
      return;
    }
    if (dest.length) {
      this.move(dest[0]);
      return;
    }
    this.selected = options.some((st) => st.from === p) ? p : null;
    this.render();
  }
  move(step) {
    this.draft.push(step);
    this.selected = null;
    this.render();
    this.onChange();
  }
  undo() {
    this.preview = null;
    this.draft.pop();
    this.selected = null;
    this.render();
    this.onChange();
  }
  reset() {
    this.preview = null;
    this.draft = [];
    this.selected = null;
    this.render();
    this.onChange();
  }
  render() {
    if (!this.state) return;
    const s = this.preview || this.current();
    this.board.render(s, {
      ...settings(),
      selected: this.selected,
      destinations:
        this.enabled && !this.preview
          ? this.candidates()
              .filter((st) => st.from === this.selected)
              .map((st) => st.to)
          : [],
      interactive: this.enabled && !this.preview,
      preview: !!this.preview,
    });
    players(s, this.names);
    diceView(
      this.state.dice,
      this.draft.map((st) => st.die),
    );
    $("draft-line").textContent = this.preview
      ? "Preview only · original position is unchanged"
      : this.draft.length
        ? notation(this.draft, this.state.turn)
        : this.state.phase === "move"
          ? "Select a checker, then a destination."
          : "";
  }
  picker() {
    const options = this.candidates();
    return select(
      [
        ["", "Choose a legal step…"],
        ...options.map((st, i) => [
          String(i),
          `${notation([st], this.state.turn)} · die ${st.die}`,
        ]),
      ],
      "",
      (v) => {
        if (v !== "") this.move(options[Number(v)]);
      },
    );
  }
}
