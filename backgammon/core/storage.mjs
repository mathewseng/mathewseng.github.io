// SPDX-License-Identifier: GPL-3.0-or-later
import { assertState, replay, clone } from "./rules.mjs";
import { DEFAULT_BOARD_THEME, normalizeBoardTheme } from "./appearance.mjs";
import { DEFAULT_SOUND, normalizeSound } from "./sound.mjs";
import { mergeEvaluations } from "./decision-history.mjs";
import { validateTakebacks } from "./table.mjs";
import { normalizeShortcuts, DEFAULT_SHORTCUTS } from "./shortcuts.mjs";
export const PREFIX = "backgammon.v1.";
export const MAX_BACKUP = 8 * 1024 * 1024;
export const settingsDefaults = {
  orientation: 0,
  keyboardEnabled: true,
  shortcuts: DEFAULT_SHORTCUTS,
  numbers: true,
  motion: "system",
  appearance: "dark",
  preset: "quick",
  moveFeedback: false,
  boardTheme: DEFAULT_BOARD_THEME,
  sound: DEFAULT_SOUND,
};
export function settings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(PREFIX + "settings") || "{}",
    );
    return {
      ...settingsDefaults,
      ...saved,
      boardTheme: normalizeBoardTheme(saved?.boardTheme),
      shortcuts: normalizeShortcuts(saved?.shortcuts),
      keyboardEnabled: saved?.keyboardEnabled !== false,
      sound: normalizeSound(saved?.sound),
    };
  } catch {
    return { ...settingsDefaults };
  }
}
export function saveSettings(value) {
  const next = { ...settings(), ...value };
  next.boardTheme = normalizeBoardTheme(next.boardTheme);
  next.shortcuts = normalizeShortcuts(next.shortcuts);
  next.sound = normalizeSound(next.sound);
  localStorage.setItem(PREFIX + "settings", JSON.stringify(next));
}
let dbPromise;
export function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("backgammon-local", 1);
    request.onupgradeneeded = () => {
      for (const s of ["items", "work", "progress", "cache"])
        request.result.createObjectStore(s, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(
        new Error(
          "Browser storage is unavailable. Export important work before leaving.",
        ),
      );
    };
  }));
}
async function transact(store, mode, fn) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode),
      request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Storage transaction aborted."));
  });
}
export const get = (store, id) =>
  transact(store, "readonly", (s) => s.get(id));
export const all = (store = "items") =>
  transact(store, "readonly", (s) => s.getAll());
export const remove = (store, id) =>
  transact(store, "readwrite", (s) => s.delete(id));
export function validateItem(item) {
  if (
    !item ||
    typeof item !== "object" ||
    item.version !== 1 ||
    typeof item.id !== "string" ||
    item.id.length > 100 ||
    !["position", "mistake", "match", "collection"].includes(item.kind)
  )
    throw new Error("Invalid Library item or schema version.");
  if (
    !Number.isFinite(item.createdAt) ||
    !Number.isFinite(item.updatedAt) ||
    item.createdAt < 0 ||
    item.updatedAt < 0
  )
    throw new Error("Invalid item dates.");
  for (const [k, max] of [
    ["title", 160],
    ["notes", 12000],
    ["collection", 100],
  ])
    if (typeof item[k] !== "string" || item[k].length > max)
      throw new Error(`Invalid ${k} field.`);
  if (
    !Array.isArray(item.tags) ||
    item.tags.length > 20 ||
    item.tags.some((t) => typeof t !== "string" || t.length > 40)
  )
    throw new Error("Invalid tags.");
  if (item.kind === "match") {
    const states = replay(item.initial, item.events);
    for (const [index, event] of item.events.entries()) {
      if (!event.evaluation) continue;
      if (!event.evaluation.result)
        throw new Error("Missing decision evaluation.");
      validateItem({
        version: 1,
        id: "evaluation",
        kind: "position",
        title: "",
        notes: "",
        collection: "",
        tags: [],
        createdAt: 0,
        updatedAt: 0,
        state: states[index],
        analysis: event.evaluation.result,
      });
    }
    validateTakebacks(item, true);
    if (
      item.status !== undefined &&
      !["in-progress", "game-complete", "match-complete"].includes(
        item.status,
      )
    )
      throw new Error("Invalid saved game status.");
  } else if (item.kind !== "collection") assertState(item.state);
  if (item.analysis) {
    const a = item.analysis;
    const valid = (n) => typeof n === "number" && Number.isFinite(n);
    const evaluation = (c) =>
      c &&
      valid(c.equity) &&
      valid(c.cubeless) &&
      Array.isArray(c.probabilities) &&
      c.probabilities.length === 5 &&
      c.probabilities.every((n) => valid(n) && n >= -0.0001 && n <= 1.0001);
    if (
      a.status !== "complete" ||
      typeof a.engine !== "string" ||
      a.engine.length > 150 ||
      !a.settings ||
      ![0, 1, 2].includes(a.settings.plies) ||
      typeof a.settings.name !== "string"
    )
      throw new Error("Invalid analysis metadata.");
    if (a.type === "checker") {
      if (
        !Array.isArray(a.candidates) ||
        a.candidates.length > 4096 ||
        a.candidates.some(
          (c) =>
            !evaluation(c) ||
            !Array.isArray(c.steps) ||
            c.steps.length > 4 ||
            typeof c.notation !== "string" ||
            c.notation.length > 160,
        )
      )
        throw new Error("Invalid checker analysis.");
      if (
        a.actual &&
        (!evaluation(a.actual) ||
          !Array.isArray(a.actual.steps) ||
          a.actual.steps.length > 4)
      )
        throw new Error("Invalid played move analysis.");
    } else if (
      a.type !== "cube" ||
      !evaluation(a) ||
      !Array.isArray(a.outcomes) ||
      a.outcomes.length !== 3 ||
      !a.outcomes.every(valid)
    )
      throw new Error("Invalid cube analysis.");
  }
  if (JSON.stringify(item).length > 2 * 1024 * 1024)
    throw new Error("Item exceeds the 2 MB limit.");
  return item;
}
export async function put(store, item) {
  if (store === "items") validateItem(item);
  return transact(store, "readwrite", (s) => s.put(clone(item)));
}
export function itemRecord(kind, fields) {
  return {
    version: 1,
    id: crypto.randomUUID(),
    kind,
    title: kind === "match" ? "Saved match" : "Saved position",
    notes: "",
    collection: "",
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...fields,
  };
}
export async function backup(gamesOnly = false) {
  return JSON.stringify(
    {
      format: "backgammon-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      items: (await all()).filter(
        (item) => !gamesOnly || item.kind === "match",
      ),
      progress: gamesOnly ? [] : await all("progress"),
    },
    null,
    2,
  );
}
// Archive every committed snapshot, including unfinished and online sessions.
// Transactions preserve user annotations and serialize updates/accepted rewinds.
// These snapshots come only from the validated local/protocol transition layer;
// imported records still undergo full replay in validateItem above.
const archives = new Map();
export function saveMatchHistory(model, names, mode = "local") {
  if (!model?.started) return Promise.resolve();
  const id = model.id;
  const key = JSON.stringify([
    model.state.sequence,
    model.events.length,
    model.undoLog?.length || 0,
    names,
    model.events.map((e) => e.evaluation?.result || null),
  ]);
  const previous = archives.get(id);
  if (previous?.key === key) return previous.promise;
  const snapshot = clone(model);
  const promise = (previous?.promise || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      assertState(snapshot.state);
      validateTakebacks(snapshot);
      const db = await database();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("items", "readwrite"),
          store = tx.objectStore("items"),
          request = store.get(id);
        request.onsuccess = () => {
          mergeEvaluations(snapshot, request.result);
          const item = {
            ...(request.result ||
              itemRecord("match", {
                id,
                title: names.join(" vs ").slice(0, 160),
                tags: ["played", mode],
              })),
            initial: snapshot.initial,
            events: snapshot.events,
            undoLog: snapshot.undoLog || [],
            names: [...names],
            status: snapshot.state.result?.matchOver
              ? "match-complete"
              : snapshot.state.phase === "over"
                ? "game-complete"
                : "in-progress",
            gameCount: snapshot.state.gameNumber,
            updatedAt: Date.now(),
          };
          store.put(item);
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || new Error("Game history could not be saved."));
      });
    });
  archives.set(id, { key, promise });
  // Bound bookkeeping only; stored games are never evicted automatically.
  if (archives.size > 32) archives.delete(archives.keys().next().value);
  promise.catch(() => {
    if (archives.get(id)?.promise === promise) archives.delete(id);
  });
  return promise;
}
export function parseBackup(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > MAX_BACKUP
  )
    throw new Error("Backup is larger than 8 MB.");
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("Backup is not valid JSON.");
  }
  if (
    b?.format !== "backgammon-library" ||
    b.version !== 1 ||
    !Array.isArray(b.items) ||
    b.items.length > 2000
  )
    throw new Error("Unsupported backup format or too many items.");
  b.items.forEach(validateItem);
  if (new Set(b.items.map((i) => i.id)).size !== b.items.length)
    throw new Error("Backup contains duplicate IDs.");
  if (
    !Array.isArray(b.progress) ||
    b.progress.length > 2000 ||
    b.progress.some(
      (p) =>
        typeof p.id !== "string" ||
        !Number.isFinite(p.due) ||
        !Number.isInteger(p.attempts) ||
        p.attempts < 0,
    )
  )
    throw new Error("Invalid training progress.");
  return b;
}
export async function importBackup(text, replace = false) {
  const b = parseBackup(text),
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["items", "progress"], "readwrite");
    if (replace) {
      tx.objectStore("items").clear();
      tx.objectStore("progress").clear();
    }
    for (const item of b.items) tx.objectStore("items").put(item);
    for (const p of b.progress) tx.objectStore("progress").put(p);
    tx.oncomplete = () => resolve(b.items.length);
    tx.onerror = () => reject(tx.error);
  });
}
export async function recordPractice(
  id,
  { error = 0, hint = false, skip = false } = {},
) {
  const prev = (await get("progress", id)) || {
    id,
    attempts: 0,
    unassisted: 0,
    streak: 0,
    hints: 0,
    skips: 0,
  };
  const clean = !hint && !skip;
  const streak = clean && error < 0.02 ? prev.streak + 1 : 0;
  const next = {
    ...prev,
    attempts: prev.attempts + 1,
    unassisted: prev.unassisted + Number(clean),
    hints: prev.hints + Number(hint),
    skips: prev.skips + Number(skip),
    streak,
    lastError: clean ? error : null,
    lastAt: Date.now(),
    due: Date.now() + [1, 2, 4, 7, 14, 30][Math.min(streak, 5)] * 86400000,
  };
  await put("progress", next);
  return next;
}
export function download(text, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
