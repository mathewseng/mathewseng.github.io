// SPDX-License-Identifier: GPL-3.0-or-later
import {
  SHORTCUTS,
  DEFAULT_SHORTCUTS,
  canonicalKey,
  shortcutErrors,
  shortcutAction,
  keyForEvent,
  visiblePoint,
} from "../core/shortcuts.mjs";
import { settings, saveSettings } from "../core/storage.mjs";
import { el, button, field, toast } from "./shell.mjs";
export function shortcutControls() {
  const root = el("div", { class: "stack" }),
    inputs = new Map(),
    error = el("p", { class: "error", role: "alert" });
  const enabled = el("input", {
    type: "checkbox",
    checked: settings().keyboardEnabled,
    onChange: () => saveSettings({ keyboardEnabled: enabled.checked }),
  });
  root.append(
    el("label", { class: "check" }, enabled, "Enable game shortcuts"),
    el(
      "p",
      { class: "muted small" },
      "Point keys follow the visible rows, left to right. Shift + point moves the nearest legal checker. D doubles before rolling and drops a cube offer. Shortcuts pause in forms and dialogs. Tab, arrows, Enter and Escape still operate ordinary controls.",
    ),
  );
  for (const [label, defs] of [
    ["Top row", SHORTCUTS.slice(0, 12)],
    ["Bottom row", SHORTCUTS.slice(12, 24)],
    ["Actions", SHORTCUTS.slice(24)],
  ]) {
    const grid = el("div", {
      class: label === "Actions" ? "shortcut-actions" : "shortcut-points",
    });
    for (const def of defs) {
      const input = el("input", {
        value: settings().shortcuts[def.id].join(", "),
        maxlength: 40,
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": `${def.label} shortcut`,
      });
      inputs.set(def.id, input);
      grid.append(field(def.label, input));
    }
    root.append(el("h3", {}, label), grid);
  }
  root.append(
    error,
    el(
      "div",
      { class: "row" },
      button(
        "Save shortcuts",
        () => {
          const bindings = Object.fromEntries(
            [...inputs].map(([id, input]) => [
              id,
              input.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
                .map(canonicalKey),
            ]),
          );
          const errors = shortcutErrors(bindings);
          error.textContent = errors.join(" ");
          if (errors.length) return;
          saveSettings({ shortcuts: bindings });
          toast("Keyboard shortcuts saved.");
        },
        "primary",
        { id: "save-shortcuts" },
      ),
      button("Restore default shortcuts", () => {
        saveSettings({ shortcuts: DEFAULT_SHORTCUTS });
        for (const [id, input] of inputs)
          input.value = DEFAULT_SHORTCUTS[id].join(", ");
        error.textContent = "";
      }),
    ),
  );
  return root;
}
export function installPlayShortcuts({ phase, point, run }) {
  const handler = (e) => {
    if (
      e.repeat ||
      e.isComposing ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      document.querySelector("dialog[open]")
    )
      return;
    if (
      e.target.closest?.(
        'input,textarea,select,[contenteditable="true"],[role="textbox"]',
      )
    )
      return;
    const prefs = settings();
    if (!prefs.keyboardEnabled) return;
    const key = keyForEvent(e),
      action = shortcutAction(prefs.shortcuts, key, phase());
    if (!action) return;
    if (
      ["Space", "Enter"].includes(key) &&
      e.target.closest?.("button,a,input")
    )
      return;
    let handled;
    if (/^(top|bottom)/.test(action))
      handled = point(visiblePoint(action, prefs.orientation), e.shiftKey);
    else handled = run(action);
    if (handled !== false) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("keydown", handler, true);
  return () => document.removeEventListener("keydown", handler, true);
}
