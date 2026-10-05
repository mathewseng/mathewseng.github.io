// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dieFace } from "./shell.mjs";
import { Board } from "./board.mjs";
import { initialState, legalPaths, nextSteps } from "../core/rules.mjs";
import { settings, saveSettings } from "../core/storage.mjs";
import {
  BOARD_PRESETS,
  COLOR_GROUPS,
  COLOR_LABELS,
  normalizeHex,
  normalizeBoardTheme,
  boardPalette,
  applyBoardTheme,
  paletteWarnings,
} from "../core/appearance.mjs";

// Only this isolated sample has a selection. Editing colors never touches a game,
// its draft, history, engine requests or an opponent's appearance preferences.
export function appearanceControls() {
  let theme = settings().boardTheme;
  const history = [],
    fields = new Map(),
    presets = new Map();
  const title = el("strong", { id: "theme-name" });
  const saved = el("span", {
    class: "muted small",
    role: "status",
    "aria-live": "polite",
  });
  const sample = el("div", {
    class: "theme-sample",
    "aria-label": "Board color preview",
  });
  const sampleBoard = new Board(sample);
  const position = initialState({
    phase: "move",
    dice: [3, 1],
    matchLength: 0,
  });
  position.points[12] = 7;
  position.points[5] = 3;
  position.points[11] = -7;
  position.points[18] = -3;
  const steps = nextSteps(legalPaths(position), []);
  sampleBoard.render(position, {
    ...settings(),
    interactive: false,
    selected: 7,
    sources: [...new Set(steps.map((m) => m.from))],
    destinations: [
      ...new Set(steps.filter((m) => m.from === 7).map((m) => m.to)),
    ],
    moves: steps.filter((m) => m.from === 7),
  });
  sampleBoard.svg.setAttribute("inert", "");
  sampleBoard.svg.setAttribute("aria-hidden", "true");
  const warningList = el("ul", { class: "theme-warnings" });
  const warnings = el(
    "div",
    { class: "theme-contrast", hidden: true },
    el("strong", {}, "Check readability"),
    warningList,
  );
  const preview = el(
    "section",
    { class: "theme-preview", "aria-label": "Live theme preview" },
    el("div", { class: "theme-preview-heading" }, title, saved),
    sample,
    el(
      "div",
      { class: "theme-dice-samples" },
      el("span", {}, dieFace(3, { player: 0 }), "Ivory"),
      el("span", {}, dieFace(5, { player: 1 }), "Teal"),
    ),
    el(
      "p",
      { class: "muted small theme-preview-note" },
      "Live preview · colors save automatically in this browser.",
    ),
  );
  const grid = el("div", {
    class: "theme-presets",
    "aria-label": "Board presets",
  });
  for (const preset of BOARD_PRESETS) {
    const swatch = el("div", { class: "theme-swatch", "aria-hidden": "true" });
    applyBoardTheme({ version: 1, preset: preset.id, colors: {} }, swatch);
    const miniature = new Board(swatch);
    miniature.render(initialState(), { interactive: false, numbers: false });
    miniature.svg.setAttribute("aria-hidden", "true");
    miniature.svg.setAttribute("inert", "");
    const choice = button(
      "",
      () => change({ version: 1, preset: preset.id, colors: {} }),
      "theme-preset",
      {
        "aria-label": `${preset.name}: ${preset.description}`,
        "aria-pressed": false,
        "data-preset": preset.id,
        title: preset.description,
      },
    );
    choice.append(swatch, el("span", {}, preset.name));
    presets.set(preset.id, choice);
    grid.append(choice);
  }
  const undo = button(
    "Undo color change",
    () => {
      const previous = history.pop();
      if (previous) change(previous, false);
    },
    "ghost",
    { disabled: true, id: "undo-theme" },
  );
  const reset = button(
    "Reset colors",
    () => change({ version: 1, preset: theme.preset, colors: {} }),
    "ghost",
    {
      id: "reset-theme",
      title: "Restore the selected preset's original colors",
    },
  );
  const controls = el(
    "div",
    { class: "theme-controls" },
    el("h3", {}, "Presets"),
    grid,
    el("div", { class: "row spread theme-reset" }, reset, undo),
    el(
      "p",
      { class: "muted small" },
      "Fine-tune any element with a hex value or color picker. Ivory and Teal remain the same player sides.",
    ),
    warnings,
  );
  for (const group of COLOR_GROUPS) {
    const details = el(
      "details",
      { class: "color-group" },
      el("summary", {}, group.name),
    );
    const body = el("div", { class: "color-fields" });
    for (const key of group.keys) {
      const label = COLOR_LABELS[key],
        inputId = `color-${key}`,
        errorId = `${inputId}-error`;
      const hex = el("input", {
        id: inputId,
        class: "hex-input",
        type: "text",
        spellcheck: "false",
        autocapitalize: "characters",
        autocomplete: "off",
        maxlength: 7,
        inputmode: "text",
        "aria-label": `${label} hex`,
        "aria-describedby": errorId,
      });
      const picker = el("input", {
        class: "color-picker",
        type: "color",
        "aria-label": `${label} color picker`,
      });
      const error = el(
        "span",
        { id: errorId, class: "color-error", hidden: true },
        "Use #RGB or #RRGGBB.",
      );
      const restore = button(
        "↺",
        () => {
          const colors = { ...theme.colors };
          delete colors[key];
          change({ ...theme, colors });
        },
        "ghost color-restore",
        { title: `Reset ${label}`, "aria-label": `Reset ${label}` },
      );
      const write = (color, refresh = true) =>
        change(
          { ...theme, colors: { ...theme.colors, [key]: color } },
          true,
          refresh,
        );
      hex.addEventListener("input", () => {
        const color = normalizeHex(hex.value);
        hex.setAttribute("aria-invalid", String(!color));
        error.hidden = !!color;
        if (!color) restore.disabled = false;
        if (color) {
          picker.value = color;
          write(color, false);
        }
      });
      hex.addEventListener("blur", () => {
        const color = normalizeHex(hex.value);
        if (color) hex.value = color;
      });
      picker.addEventListener("input", () => write(picker.value));
      body.append(
        el(
          "div",
          { class: "color-field" },
          el("label", { for: inputId }, label),
          picker,
          hex,
          restore,
          error,
        ),
      );
      fields.set(key, { hex, picker, error, restore });
    }
    details.append(body);
    controls.append(details);
  }
  function refresh(updateInputs = true) {
    const preset = BOARD_PRESETS.find((p) => p.id === theme.preset),
      palette = boardPalette(theme);
    const custom = Object.keys(theme.colors).length;
    title.textContent = (custom ? "Custom · " : "") + preset.name;
    reset.disabled = !custom;
    undo.disabled = !history.length;
    for (const [id, node] of presets)
      node.setAttribute("aria-pressed", String(id === theme.preset));
    for (const [key, input] of fields) {
      input.restore.disabled = !theme.colors[key];
      if (updateInputs) {
        input.hex.value = palette[key];
        input.picker.value = palette[key];
        input.hex.setAttribute("aria-invalid", "false");
        input.error.hidden = true;
      }
    }
    const problems = paletteWarnings(palette);
    warnings.hidden = !problems.length;
    warningList.replaceChildren(...problems.map((p) => el("li", {}, p)));
  }
  function change(value, remember = true, updateInputs = true) {
    const next = normalizeBoardTheme(value);
    if (JSON.stringify(next) !== JSON.stringify(theme)) {
      if (remember) {
        history.push(theme);
        if (history.length > 40) history.shift();
      }
      theme = next;
      applyBoardTheme(theme);
      try {
        saveSettings({ boardTheme: theme });
        saved.textContent = "Saved";
      } catch {
        saved.textContent = "Preview only · storage unavailable";
      }
    }
    refresh(updateInputs);
  }
  refresh();
  return el("div", { class: "theme-layout" }, preview, controls);
}
