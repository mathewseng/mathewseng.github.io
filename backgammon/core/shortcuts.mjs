// SPDX-License-Identifier: GPL-3.0-or-later
const all = [
  "setup",
  "opening",
  "move",
  "roll",
  "double",
  "resign",
  "over",
];
export const SHORTCUTS = [
  ...[..."1234567890-="].map((key, i) => ({
    id: `top${i}`,
    label: `Top ${i + 1}`,
    keys: [key],
    phases: ["move"],
  })),
  ...[..."qwertyuiop[]"].map((key, i) => ({
    id: `bottom${i}`,
    label: `Bottom ${i + 1}`,
    keys: [key],
    phases: ["move"],
  })),
  { id: "bar", label: "Bar / bear off", keys: ["b"], phases: ["move"] },
  { id: "off", label: "Bear off", keys: ["a"], phases: ["move"] },
  {
    id: "undo",
    label: "Undo draft step",
    keys: ["z"],
    phases: ["move"],
  },
  { id: "reset", label: "Reset draft", keys: ["x"], phases: ["move"] },
  {
    id: "double",
    label: "Offer double",
    keys: ["c"],
    phases: ["roll"],
  },
  { id: "drop", label: "Drop cube offer", keys: ["d"], phases: ["double"] },
  { id: "take", label: "Take cube offer", keys: ["t"], phases: ["double"] },
  {
    id: "redouble",
    label: "Beaver / raccoon",
    keys: ["c"],
    phases: ["double"],
  },
  {
    id: "roll",
    label: "Roll dice",
    keys: ["Space", "Enter"],
    phases: ["roll", "opening"],
  },
  {
    id: "confirm",
    label: "Confirm / begin / next game",
    keys: ["Enter"],
    phases: ["setup", "move", "over"],
  },
  { id: "hint", label: "Hint", keys: ["h"], phases: ["move"] },
  { id: "swap", label: "Prefer other die", keys: ["s"], phases: ["move"] },
  { id: "flip", label: "Flip board", keys: ["f"], phases: all },
  {
    id: "cancel",
    label: "Clear selection",
    keys: ["Escape"],
    phases: ["move"],
  },
  { id: "help", label: "Keyboard settings", keys: ["?"], phases: all },
];
export const DEFAULT_SHORTCUTS = Object.fromEntries(
  SHORTCUTS.map((d) => [d.id, d.keys]),
);
export function canonicalKey(key) {
  const s = String(key).trim();
  if (/^(space|spacebar)$/i.test(s) || key === " ") return "Space";
  if (/^(enter|return)$/i.test(s)) return "Enter";
  if (/^(escape|esc)$/i.test(s)) return "Escape";
  if (
    /^(backspace|delete|home|end|pageup|pagedown|arrowup|arrowdown|arrowleft|arrowright)$/i.test(
      s,
    )
  )
    return s.toLowerCase();
  return s.length === 1 ? s.toLowerCase() : null;
}
export function shortcutErrors(bindings) {
  const errors = [];
  for (let i = 0; i < SHORTCUTS.length; i++) {
    const a = SHORTCUTS[i],
      keys = bindings?.[a.id];
    if (
      !Array.isArray(keys) ||
      keys.length > 3 ||
      keys.some((k) => !canonicalKey(k) || k !== canonicalKey(k))
    ) {
      errors.push(
        `${a.label}: use up to three single keys, Space, Enter or Escape.`,
      );
      continue;
    }
    if (new Set(keys).size !== keys.length)
      errors.push(`${a.label}: duplicate key.`);
    for (const b of SHORTCUTS.slice(0, i))
      if (a.phases.some((p) => b.phases.includes(p))) {
        const shared = keys.find((k) => bindings[b.id]?.includes(k));
        if (shared)
          errors.push(`${shared}: ${a.label} conflicts with ${b.label}.`);
      }
  }
  return errors;
}
export function normalizeShortcuts(value) {
  if (
    value &&
    SHORTCUTS.every(
      (d) =>
        JSON.stringify(value[d.id]) ===
        JSON.stringify(
          d.id === "double"
            ? ["c", "d"]
            : d.id === "redouble"
              ? ["v"]
              : d.id === "roll"
                ? ["Space"]
                : d.keys,
        ),
    )
  )
    value = null;
  const bindings = Object.fromEntries(
    SHORTCUTS.map((d) => [
      d.id,
      Array.isArray(value?.[d.id]) ? value[d.id] : [...d.keys],
    ]),
  );
  return shortcutErrors(bindings).length
    ? structuredClone(DEFAULT_SHORTCUTS)
    : bindings;
}
export function shortcutAction(bindings, key, phase) {
  return (
    SHORTCUTS.find(
      (d) => d.phases.includes(phase) && bindings[d.id]?.includes(key),
    )?.id || null
  );
}
export function keyForEvent(event) {
  // Shift+point means quick play even on the number/punctuation row.
  const shifted = {
    "!": "1",
    "@": "2",
    "#": "3",
    $: "4",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "(": "9",
    ")": "0",
    _: "-",
    "+": "=",
    "{": "[",
    "}": "]",
  };
  return canonicalKey(
    event.shiftKey ? shifted[event.key] || event.key : event.key,
  );
}
export function visiblePoint(id, orientation) {
  const top = id.startsWith("top"),
    i = Number(id.slice(top ? 3 : 6));
  const point = top ? 12 + i : 11 - i;
  return orientation ? 23 - point : point;
}
