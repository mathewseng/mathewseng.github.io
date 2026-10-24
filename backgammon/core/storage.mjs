// SPDX-License-Identifier: GPL-3.0-or-later
import { assertState, replay, clone } from "./rules.mjs";
import { DEFAULT_BOARD_THEME, normalizeBoardTheme } from "./appearance.mjs";
import { DEFAULT_SOUND, normalizeSound } from "./sound.mjs";
import { DEFAULT_MOTION_SCALE, normalizeMotionScale } from "./motion.mjs";
import { mergeEvaluations, decisionHistory, decisionTotals } from "./decision-history.mjs";
import { splitGameHistory } from "./game-archive.mjs";
import { validateTakebacks } from "./table.mjs";
import { normalizeShortcuts, DEFAULT_SHORTCUTS } from "./shortcuts.mjs";
import { DEFAULT_SKIN, DEFAULT_SKIN_BOARD_THEME, SKIN_IDS } from "../skins/index.mjs";
import { PURETD, PURETD_WIDE } from "../engine/puretd-metadata.mjs";
export const PREFIX = "backgammon.v1.";
export const MAX_BACKUP = 8 * 1024 * 1024;
export const settingsDefaults = {
  orientation: 0,
  keyboardEnabled: true,
  shortcuts: DEFAULT_SHORTCUTS,
  numbers: true,
  cubeOneAsOne: false,
  moveHints: true,
  interactionMode: "advanced",
  motion: "system",
  motionScale: DEFAULT_MOTION_SCALE,
  appearance: "dark",
  preset: "quick",
  moveFeedback: true,
  equityBar: true,
  analysisAhead: true,
  closedOutPassing: "off",
  boardTheme: DEFAULT_SKIN_BOARD_THEME,
  skin: DEFAULT_SKIN,
  sound: DEFAULT_SOUND,
};
// The skin id is an allow-list: unknown or missing values mean the default.
export function normalizeSkin(value) {
  return SKIN_IDS.includes(value) ? value : DEFAULT_SKIN;
}
// Settings saved before skins existed carry no skin and, unless the board was
// customised, the house slate palette. Those boards follow the default skin;
// a customised board (another preset, colours or patterns) is kept as is.
function migrateBoardTheme(saved) {
  if (saved?.skin !== undefined) return saved.boardTheme;
  if (saved?.boardTheme === undefined) return DEFAULT_SKIN_BOARD_THEME;
  const theme = normalizeBoardTheme(saved.boardTheme);
  const untouched =
    theme.preset === DEFAULT_BOARD_THEME.preset &&
    Object.keys(theme.colors || {}).length === 0 &&
    !theme.patterns;
  return untouched ? DEFAULT_SKIN_BOARD_THEME : saved.boardTheme;
}
let settingsText, normalizedSettings;
const freezeSettings = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSettings);
    Object.freeze(value);
  }
  return value;
};
// Rendering and gesture handlers only read preferences. Share an immutable
// snapshot there instead of copying the entire palette/shortcut tree per read.
export function readSettings() {
  try {
    const text = localStorage.getItem(PREFIX + "settings") || "{}";
    // Gesture handlers read settings many times. Validate only when stored text
    // changes (including another tab); editors use settings() for writable copies.
    if (text === settingsText && normalizedSettings) return normalizedSettings;
    const saved = JSON.parse(text);
    const normalized = {
      ...settingsDefaults,
      ...saved,
      boardTheme: normalizeBoardTheme(migrateBoardTheme(saved)),
      skin: normalizeSkin(saved?.skin),
      shortcuts: normalizeShortcuts(saved?.shortcuts),
      keyboardEnabled: saved?.keyboardEnabled !== false,
      equityBar: saved?.equityBar !== false,
      analysisAhead: saved?.analysisAhead !== false,
      closedOutPassing: ["forced", "bad-double"].includes(saved?.closedOutPassing) ? saved.closedOutPassing : "off",
      moveFeedback: saved?.moveFeedback !== false,
      interactionMode: saved?.interactionMode === "beginner" ? "beginner" : "advanced",
      moveHints: saved?.moveHints !== false,
      cubeOneAsOne: saved?.cubeOneAsOne === true,
      motionScale: normalizeMotionScale(saved?.motionScale, saved?.motion),
      sound: normalizeSound(saved?.sound),
    };
    settingsText = text;
    normalizedSettings = freezeSettings(normalized);
    return normalizedSettings;
  } catch {
    return freezeSettings({ ...settingsDefaults });
  }
}
export function settings() { return clone(readSettings()); }
export function saveSettings(value) {
  const next = { ...settings(), ...value };
  // Keep older callers/backup settings that set only reduced motion compatible.
  if (Object.hasOwn(value, "motion") && !Object.hasOwn(value, "motionScale"))
    next.motionScale = value.motion === "reduce" ? 0 : next.motionScale || DEFAULT_MOTION_SCALE;
  next.motionScale = normalizeMotionScale(next.motionScale, next.motion);
  next.boardTheme = normalizeBoardTheme(next.boardTheme);
  next.skin = normalizeSkin(next.skin);
  next.shortcuts = normalizeShortcuts(next.shortcuts);
  next.sound = normalizeSound(next.sound);
  localStorage.setItem(PREFIX + "settings", JSON.stringify(next));
}
let dbPromise;
export function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("backgammon-local", 2);
    let blockedTimer, failed = false;
    request.onblocked = () => {
      blockedTimer = setTimeout(() => {
        failed = true; dbPromise = null;
        reject(Error('Close older Backgammon tabs, then reopen this page to update storage. Your saved games are unchanged.'));
      }, 2000);
    };
    request.onupgradeneeded = () => {
      clearTimeout(blockedTimer);
      for (const s of ["items", "work", "progress", "cache"])
        if (!request.result.objectStoreNames.contains(s)) request.result.createObjectStore(s, { keyPath: "id" });
      const summaries = request.result.createObjectStore('summaries', {keyPath:'id'});
      summaries.createIndex('recent', ['updatedAt', 'id']);
      summaries.createIndex('session', ['sessionId', 'gameNumber', 'createdAt', 'id']);
      // One record at a time; never hydrate the whole Library to build its index.
      const cursor = request.transaction.objectStore('items').openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        summaries.put(itemSummary(cursor.result.value));
        cursor.result.continue();
      };
    };
    request.onsuccess = () => {
      clearTimeout(blockedTimer);
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(blockedTimer);
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
export const get = (store, id) => transact(store, "readonly", (s) => s.get(id));
export const all = (store = "items") =>
  transact(store, "readonly", (s) => s.getAll());
export async function remove(store, id) {
  if (store !== 'items') return transact(store, 'readwrite', s => s.delete(id));
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items','summaries'], 'readwrite');
    tx.objectStore('items').delete(id); tx.objectStore('summaries').delete(id);
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

export function itemSummary(item) {
  const {id,kind,title,notes,tags,collection,createdAt,updatedAt,status,names,gameCount,decisionSummary} = item;
  return {id,kind,title,notes,tags,collection,createdAt,updatedAt,status,names,gameCount,decisionSummary,
    sessionId:item.sessionId || id, gameNumber:item.gameNumber || item.initial?.gameNumber || 1,
    eventCount:item.events?.length || 0, variations:item.undoLog?.length || 0,
    scores:item.state?.scores, archivedVariation:item.archivedVariation === true};
}

// Keyset pagination reads only small metadata. The full game is read by get()
// only after a person opens it; changing page releases the previous page.
export async function listItemSummaries({sessionId, cursor, limit = 12, kind, collection, query = ''} = {}) {
  const db = await database();
  limit = Math.max(1, Math.min(24, limit));
  return new Promise((resolve, reject) => {
    const tx = db.transaction('summaries', 'readonly');
    const index = tx.objectStore('summaries').index(sessionId ? 'session' : 'recent');
    const range = sessionId ? IDBKeyRange.bound([sessionId], cursor || [sessionId, []], false, !!cursor)
      : cursor ? IDBKeyRange.upperBound(cursor, true) : undefined;
    const request = index.openCursor(range, 'prev'), items = [];
    let next = null, more = false;
    request.onsuccess = () => {
      const c = request.result;
      if (!c) return;
      const item = c.value;
      if ((!kind || item.kind === kind) && (!collection || item.collection === collection) &&
          [item.title,item.notes,...item.tags].join(' ').toLowerCase().includes(query.toLowerCase())) {
        if (items.length === limit) { more = true; return; }
        items.push(item); next = c.key;
      }
      c.continue();
    };
    tx.oncomplete = () => resolve({items, cursor:more ? next : null});
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

export async function practiceItems() {
  const db = await database(), ids = [];
  await new Promise((resolve,reject) => {
    const tx = db.transaction('summaries','readonly');
    const request = tx.objectStore('summaries').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value;
      if (item.kind === 'mistake' || (item.kind === 'position' && item.tags.includes('exercise'))) ids.push(item.id);
      cursor.continue();
    };
    tx.oncomplete=resolve; tx.onabort=tx.onerror=()=>reject(tx.error);
  });
  return (await Promise.all(ids.map(id=>get('items',id)))).filter(Boolean);
}
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
    validateTakebacks(item, true);
    const validateLine = (initial, events) => {
      const states = replay(initial, events);
      for (const [index, event] of events.entries()) {
        for (const evaluation of [event.evaluation, event.initialDecision?.evaluation]) {
          if (!evaluation) continue;
          if (!evaluation.result)
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
            analysis: evaluation.result,
          });
        }
      }
    };
    validateLine(item.initial, item.events);
    for (const entry of item.undoLog || []) {
      validateLine(entry.initial, entry.events);
      if (entry.prefix) validateLine(item.initial, entry.prefix);
    }
    if (
      item.status !== undefined &&
      !["in-progress", "game-complete", "match-complete"].includes(item.status)
    )
      throw new Error("Invalid saved game status.");
  } else if (item.kind !== "collection") assertState(item.state);
  if (item.analysis) {
    const a = item.analysis;
    const valid = (n) => typeof n === "number" && Number.isFinite(n);
    const isNeural = a.method === 'neural';
    const learned = isNeural && [PURETD, PURETD_WIDE].find(model => model.id === a.engine);
    if (isNeural && (!learned || a.type !== 'checker' ||
        a.model?.id !== learned.model || a.model.sha256 !== learned.modelSHA256 || a.model.equityOnly !== true ||
        ![0, 1].includes(a.settings?.plies) || a.settings.cubeful !== true ||
        a.settings.pruning !== false || a.units !== 'current-cube-points'))
      throw new Error('Invalid learned-model provenance.');
    const evaluation = (c) =>
      c &&
      valid(c.equity) &&
      (isNeural ? c.cubeless === null && c.probabilities === null : valid(c.cubeless) &&
      Array.isArray(c.probabilities) &&
      c.probabilities.length === 5 &&
      c.probabilities.every((n) => valid(n) && n >= -0.0001 && n <= 1.0001));
    const isReference = a.method === "reference";
    const credit = c => c?.referenceCredit &&
      typeof c.referenceCredit.author === "string" && c.referenceCredit.author.trim().length > 0 && c.referenceCredit.author.length <= 120 &&
      typeof c.referenceCredit.date === "string" && c.referenceCredit.date.length <= 40 &&
      typeof c.referenceCredit.engine === "string" && c.referenceCredit.engine.length <= 100;
    if (isReference && (a.type !== "checker" || a.settings?.plies !== null ||
        a.engine !== "eXtreme Gammon · published opening book 3.70 (2013)" ||
        a.book?.id !== "xg-public-opening-3.70-v1" || a.book.source !== "published-xg-reference" ||
        !/^https:\/\/www\.extremegammon\.com\/OB\/[A-Za-z0-9_$.-]+\.html$/.test(a.reference?.url) ||
        !Array.isArray(a.candidates) || !a.candidates.length || !a.candidates.every(credit) || (a.actual && !credit(a.actual))))
      throw new Error("Invalid reference provenance.");
    if (
      a.status !== "complete" ||
      typeof a.engine !== "string" ||
      a.engine.length > 150 ||
      !a.settings ||
      !(isReference ? a.settings.plies === null : [0, 1, 2, 3, 4, 5].includes(a.settings.plies)) ||
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
  if (store !== 'items') return transact(store, "readwrite", (s) => s.put(clone(item)));
  validateItem(item);
  if (item.kind === 'match') {
    const rows = decisionHistory(item);
    item = {...item, decisionSummary:[0,1].map(player => decisionTotals(rows,player))};
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items','summaries'], 'readwrite');
    tx.objectStore('items').put(clone(item));
    tx.objectStore('summaries').put(itemSummary(item));
    tx.oncomplete = () => resolve(item.id); tx.onabort = tx.onerror = () => reject(tx.error);
  });
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
function matchRecord(snapshot, names, mode, previous) {
  mergeEvaluations(snapshot, previous);
  const rows = decisionHistory(snapshot);
  return {
    ...(previous || itemRecord('match', {id:snapshot.archiveId || snapshot.id,
      title:names.join(' vs ').slice(0,160), tags:['played',mode]})),
    initial:snapshot.initial, events:snapshot.events, state:snapshot.state,
    undoLog:snapshot.undoLog || [], names:[...names],
    sessionId:snapshot.id, previousGameId:snapshot.previousGameId,
    gameNumber:snapshot.state.gameNumber, archivedVariation:snapshot.archivedVariation === true,
    tableContext:{config:snapshot.config, humanNames:snapshot.humanNames, localRolls:snapshot.localRolls},
    status:snapshot.state.result?.matchOver ? 'match-complete' : snapshot.state.phase === 'over' ? 'game-complete' : 'in-progress',
    gameCount:snapshot.historyVersion === 2 ? 1 : snapshot.state.gameNumber,
    decisionSummary:[0,1].map(player => decisionTotals(rows, player)),
    updatedAt:Date.now(),
  };
}

// Conversion and the new live pointer share one transaction: a quota failure,
// tab close or crash leaves the old complete save intact, never half migrated.
export async function migratePlayHistory(work) {
  if (!work?.game?.started || work.game.config?.mode === 'online') return work;
  if (work.game.historyVersion === 2 && !work.game.events.some(e => e.action.type === 'next')) return work;
  let next;
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['items','summaries','work'], 'readwrite');
    const items = tx.objectStore('items');
    const previous = items.get(work.game.archiveId || work.game.id);
    previous.onsuccess = () => {
      try {
        // Review may have added grades to the archive since Play last saved.
        // Merge before splitting, so grades in later games survive too.
        const table = mergeEvaluations(clone(work.game), previous.result);
        const {current, games} = splitGameHistory(table);
        next = {...work, id:work.id || 'play', game:current};
        for (const game of games) {
          const request = items.get(game.archiveId);
          request.onsuccess = () => {
            try {
              const item = matchRecord(game, game.names, game.config.mode, request.result);
              items.put(item); tx.objectStore('summaries').put(itemSummary(item));
            } catch (error) { tx.abort(); reject(error); }
          };
        }
        tx.objectStore('work').put(next);
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || Error('Game history migration was not saved.'));
  });
  return next;
}
export function saveMatchHistory(model, names, mode = "local") {
  if (!model?.started) return Promise.resolve();
  const id = model.archiveId || model.id;
  const key = JSON.stringify([
    model.state.sequence,
    model.events.length,
    model.undoLog?.length || 0,
    names,
    model.events.map((e) => [e.evaluation?.result || null, e.initialDecision || null]),
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
        const tx = db.transaction(["items", "summaries"], "readwrite"),
          store = tx.objectStore("items"),
          request = store.get(id);
        request.onsuccess = () => {
          try {
            const item = matchRecord(snapshot, names, mode, request.result);
            store.put(item);
            tx.objectStore('summaries').put(itemSummary(item));
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || new Error("Game history could not be saved."));
      });
    });
  archives.set(id, { key, promise });
  // Bound bookkeeping only; stored games are never evicted automatically.
  if (archives.size > 2) archives.delete(archives.keys().next().value);
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
    const tx = db.transaction(["items", "progress", "summaries"], "readwrite");
    if (replace) {
      tx.objectStore("items").clear();
      tx.objectStore("summaries").clear();
      tx.objectStore("progress").clear();
    }
    for (const item of b.items) {
      tx.objectStore("items").put(item);
      tx.objectStore('summaries').put(itemSummary(item));
    }
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
