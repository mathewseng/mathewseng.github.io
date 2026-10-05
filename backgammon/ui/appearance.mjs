// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dieFace, field, select } from "./shell.mjs";
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
  PATTERN_ELEMENTS,
  PATTERN_KINDS,
  elementPattern,
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
    "Undo style change",
    () => {
      const previous = history.pop();
      if (previous) change(previous, false);
    },
    "ghost",
    { disabled: true, id: "undo-theme" },
  );
  const reset = button(
    "Reset colors",
    () => change({ ...theme, colors: {} }),
    "ghost",
    {
      id: "reset-theme",
      title: "Restore the selected preset's original colors",
    },
  );
  const palettePanel = el(
    "section",
    { "aria-label": "Theme presets" },
    el(
      "p",
      { class: "muted small" },
      "24 clean palettes. Choose a starting point, then make it yours.",
    ),
    grid,
  );
  const colorPanel = el(
    "section",
    { hidden: true, "aria-label": "Element colors" },
    el("div", { class: "row spread theme-reset" }, reset),
    el(
      "p",
      { class: "muted small" },
      "Fine-tune individual colors. Player sides stay Ivory and Teal.",
    ),
    warnings,
  );
  let patternKey = "surface";
  const element = select(
    Object.entries(PATTERN_ELEMENTS),
    patternKey,
    (key) => {
      patternKey = key;
      refreshPattern();
    },
  );
  element.id = "pattern-element";
  const kind = select(
    PATTERN_KINDS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]),
    "solid",
    () => writePattern(),
  );
  const ink = el("input", {
    class: "hex-input",
    type: "text",
    maxlength: 7,
    spellcheck: false,
    autocomplete: "off",
  });
  const size = el("input", { type: "range", min: 8, max: 40, step: 2 });
  const opacity = el("input", { type: "range", min: 5, max: 35, step: 1 });
  const angle = select(
    [0, 45, 90, 135].map((n) => [n, `${n}°`]),
    "45",
    () => writePattern(),
  );
  const patternNote = el("p", { class: "muted small", role: "status" });
  const patternReset = button(
    "Reset this pattern",
    () => {
      const patterns = { ...theme.patterns };
      delete patterns[patternKey];
      change({ ...theme, patterns });
    },
    "ghost",
  );
  const patternPanel = el(
    "section",
    { hidden: true, class: "pattern-panel", "aria-label": "Element patterns" },
    el(
      "p",
      { class: "muted small" },
      "Subtle patterns sit under labels, counts and pips. Each element can be customized independently.",
    ),
    field("Board element", element),
    field("Pattern", kind),
    field("Pattern ink hex", ink),
    field("Pattern spacing", size),
    field("Pattern strength", opacity),
    field("Pattern angle", angle),
    patternNote,
    patternReset,
  );
  function refreshPattern() {
    const p = elementPattern(theme, patternKey);
    kind.value = p.kind;
    if (document.activeElement !== ink) ink.value = p.ink;
    size.value = p.size;
    opacity.value = Math.round(p.opacity * 100);
    angle.value = p.angle;
    ink.setAttribute("aria-invalid", "false");
    patternNote.textContent = `${p.size} board units · ${Math.round(p.opacity * 100)}% strength`;
    patternReset.disabled = !theme.patterns?.[patternKey];
  }
  function writePattern() {
    const color = normalizeHex(ink.value);
    ink.setAttribute("aria-invalid", String(!color));
    if (!color) {
      patternNote.textContent = "Use #RGB or #RRGGBB for the pattern ink.";
      return;
    }
    change({
      ...theme,
      patterns: {
        ...theme.patterns,
        [patternKey]: {
          kind: kind.value,
          ink: color,
          size: Number(size.value),
          opacity: Number(opacity.value) / 100,
          angle: Number(angle.value),
        },
      },
    });
  }
  ink.addEventListener("blur", () => {
    if (normalizeHex(ink.value)) ink.value = normalizeHex(ink.value);
  });
  for (const input of [ink, size, opacity])
    input.addEventListener("input", writePattern);
  const tabs = el("div", {
    class: "segmented appearance-tabs",
    "aria-label": "Board styling",
  });
  for (const [name, panel] of [
    ["Themes", palettePanel],
    ["Colors", colorPanel],
    ["Patterns", patternPanel],
  ]) {
    const tab = button(
      name,
      () => {
        for (const p of [palettePanel, colorPanel, patternPanel])
          p.hidden = p !== panel;
        for (const t of tabs.children)
          t.setAttribute("aria-pressed", String(t === tab));
      },
      "",
      { "aria-pressed": panel === palettePanel },
    );
    tabs.append(tab);
  }
  const controls = el(
    "div",
    { class: "theme-controls" },
    tabs,
    palettePanel,
    colorPanel,
    patternPanel,
    undo,
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
    colorPanel.append(details);
  }
  function refresh(updateInputs = true) {
    const preset = BOARD_PRESETS.find((p) => p.id === theme.preset),
      palette = boardPalette(theme);
    const custom =
      Object.keys(theme.colors).length +
      Object.keys(theme.patterns || {}).length;
    title.textContent = (custom ? "Custom · " : "") + preset.name;
    reset.disabled = !Object.keys(theme.colors).length;
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
    refreshPattern();
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
