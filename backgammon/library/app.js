// SPDX-License-Identifier: GPL-3.0-or-later
import { startUpdates, resumedAfterUpdate } from "../ui/updates.mjs";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";
import { historyExplorer } from "../ui/history-tree.mjs";
import {
  all,
  listItemSummaries,
  get,
  put,
  remove,
  backup,
  parseBackup,
  importBackup,
  download,
  MAX_BACKUP,
  settings,
} from "../core/storage.mjs";
import { shareURL } from "../core/xgid.mjs";
import { replay } from "../core/rules.mjs";
import { sameDecisionPrefix, decisionHistory, decisionTotals } from "../core/decision-history.mjs";
import { sessionReview } from "../ui/session-review.mjs";
import { Board } from "../ui/board.mjs";
import {
  $,
  shell,
  el,
  button,
  field,
  select,
  dialog,
  confirmDialog,
  openPanel,
  toast,
  showError,
} from "../ui/shell.mjs";

// Kind icons (20px grid, stroked like the topbar icons): a session is a stack
// of games, a mistake is a return arrow, a position is a board point.
const ICONS = {
  match: '<path d="M4 6h12M4 10h12M4 14h8"/>',
  mistake: '<path d="M7 5 3.5 8.5 7 12"/><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9"/>',
  position: '<path d="M4 4h12l-6 12z"/>',
  collection: '<path d="M3 6h5l2 2h7v8H3z"/>',
};
function kindIcon(kind) {
  const span = el("span", { class: "item-glyph", "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[kind] || ICONS.position}</svg>`;
  return span;
}
const KIND_NAMES = { match: "Game", position: "Position", mistake: "Mistake", collection: "Collection" };
// Play adds these to every saved game; the names already say who played.
const PLAY_TAGS = ["played", "computer", "local", "online"];

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
resumedAfterUpdate();
const pageProgress = readPageProgress();
shell("library", "Library");
let cursor = null, nextCursor = null, listGeneration = 0, selectionGeneration = 0, previewBoard = null, saveEdits = async () => {};
let items = [],
  selected = null,
  query = "",
  collection = "",
  kind = location.hash === "#games" ? "match" : "";
$("workspace").className = "library-layout";
$("workspace").querySelector(".stage").remove();
const list = el("section", {
  class: "library-list",
  "aria-label": "Saved items",
  id: "library-list",
});
$("workspace").prepend(list);
// Whether a press on the list is still in progress. A mouse press blurs an
// edited field (and saves it) before the press ends; a touch tap ends first.
let listPressed = false;
list.addEventListener("pointerdown", () => { listPressed = true; });
for (const type of ["pointerup", "pointercancel"])
  addEventListener(type, () => { listPressed = false; }, true);
$("toolbar").prepend(
  button("Import", importDialog, "ghost"),
  button("Export", exportDialog, "ghost", { id: "export-library" }),
);
// Edits also save when the Details sheet closes: Escape and swipe-down close
// it without blurring the field. `close` does not bubble, hence capture.
document.addEventListener("close", (e) => {
  if (e.target.id === "details-dialog") saveEdits();
}, true);
function exportDialog() {
  dialog(
    "Export from this browser",
    el("p", {}, "Keep a backup you can import on another device."),
    [
      button(
        "Game history",
        async () =>
          download(await backup(true), "backgammon-game-history.json"),
        "primary",
        { id: "export-games" },
      ),
      button("Entire Library", async () =>
        download(await backup(), "backgammon-backup.json"),
      ),
    ],
  );
}
await refresh();
if (pageProgress) {
  query = pageProgress.query || "";
  collection = pageProgress.collection || "";
  kind = pageProgress.kind || "";
  selected = pageProgress.selected ? await get("items", pageProgress.selected) : null;
  render();
}
keepPageProgress(() => ({
  query,
  collection,
  kind,
  selected: selected?.id,
  fields: [...$("panel").querySelectorAll("input,textarea")].map(
    (n) => n.value,
  ),
}));
async function refresh(controls = true) {
  const token = ++listGeneration;
  try {
    const page = await listItemSummaries({cursor, query, collection, kind, limit:12});
    if (token !== listGeneration) return;
    items = page.items; nextCursor = page.cursor;
    if (controls) {
      selected = selected ? await get("items", selected.id) : null;
      render();
    } else renderList();
  } catch (e) {
    showError(e);
  }
}
function render() {
  const search = el("input", {
    type: "search",
    value: query,
    placeholder: "Search names, notes, or tags…",
    "aria-label": "Search Library",
    onInput: (e) => {
      query = e.target.value;
      cursor = null; refresh(false);
    },
  });
  const typeFilter = select(
    [
      ["", "All items"],
      ["match", "Games"],
      ["position", "Positions"],
      ["mistake", "Mistakes"],
    ],
    kind,
    (value) => {
      kind = value;
      history.replaceState(
        null,
        "",
        value === "match" ? "#games" : location.pathname,
      );
      cursor = null; refresh(false);
    },
  );
  typeFilter.setAttribute("aria-label", "Item type");
  list.replaceChildren(
    el(
      "div",
      { class: "library-filters" },
      search,
      typeFilter,
      el("input", {type:"search", value:collection, placeholder:"Collection", "aria-label":"Collection filter",
        onInput:e => {collection=e.target.value; cursor=null; refresh(false);}}),
    ),
    el("div", { id: "items" }),
  );
  renderList();
  inspector();
}
function renderList() {
  const shown = items.filter(
    (i) =>
      (!collection.trim() || (i.collection || "").toLowerCase() === collection.trim().toLowerCase()) &&
      (!kind || i.kind === kind) &&
      [i.title, i.notes, i.collection, ...i.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const parent = $("items");
  parent.replaceChildren();
  if (!shown.length) {
    parent.append(
      el(
        "div",
        { class: "empty empty-state" },
        el(
          "h2",
          {},
          query || collection || kind
            ? "No matching items"
            : "Nothing saved yet.",
        ),
        ...(query || collection || kind
          ? [button("Clear filters", () => {
              query = collection = kind = "";
              cursor = null;
              history.replaceState(null, "", location.pathname);
              // The rebuild removes this button; keep focus in the filters.
              refresh().then(() => document.querySelector("input[aria-label='Search Library']")?.focus());
            })]
          : [
              el(
                "p",
                { class: "muted" },
                "Games you play save here on their own. Save positions from the Solver and mistakes from the Trainer.",
              ),
              el("a", { class: "btn", href: "/backgammon/solver/" }, "Open Solver"),
            ]),
      ),
    );
  }
  // Rows are real buttons with a pressed state for the selected item; their
  // content is phrasing content (spans), the title a <strong>.
  for (const item of shown) {
    const match = item.kind === "match", games = item.gameCount || 1;
    const tags = match ? item.tags.filter((t) => !PLAY_TAGS.includes(t)) : item.tags;
    const row = el(
      "button",
      {
        type: "button",
        class: "library-item",
        "aria-label": `Open ${item.title}`,
        "aria-pressed": selected?.id === item.id,
        onClick: () => choose(item),
      },
      kindIcon(item.kind),
      el(
        "span",
        { class: "library-item-body" },
        el("strong", { class: "library-item-title" }, item.title),
        el(
          "span",
          { class: "library-item-meta" },
          `${match ? (games > 1 ? `${games} games` : `Game ${item.gameNumber}`) : KIND_NAMES[item.kind] || item.kind} · ${new Date(item.updatedAt).toLocaleDateString()}${item.status ? " · " + item.status.replaceAll("-", " ") : ""}${item.collection ? " · " + item.collection : ""}${tags.length ? " · " + tags.join(", ") : ""}`,
        ),
      ),
    );
    if (match) {
      const totals = selected?.id === item.id ? selected.decisionSummary : item.decisionSummary;
      const summary = el("span", { class: "library-session-summary" });
      if (totals) {
        // A player's loss shows once any of their decisions has a grade.
        const evaluated = totals.reduce((n, t) => n + t.evaluated, 0);
        if (evaluated)
          summary.append(el("span", { class: "library-session-players" }, ...totals.flatMap((t, player) => t.evaluated ? [
            el("span", { class: "library-session-player", "data-player": player },
              el("strong", {}, item.names?.[player] || (player ? "Black" : "White")),
              el("span", {}, t.money && t.lossUnits !== "normalized-equity" ? "Open to see EV loss" : `${t.loss.toFixed(3)} ${t.money ? "EV lost" : "equity lost"}`),
            )] : [])));
        summary.append(el("span", { class: "library-session-count" },
          `${evaluated ? evaluated + " evaluated · " : ""}${totals.reduce((n, t) => n + t.pending, 0)} unreviewed`));
      }
      if (!totals)
        summary.append(el("span", { class: "library-session-count" }, `${item.eventCount} saved actions`));
      row.lastElementChild.append(summary);
    }
    parent.append(row);
  }
  if (cursor || nextCursor) parent.append(el('div', {class:'row spread'},
    button('Latest items', () => {cursor=null; refresh(false);}, '', {disabled:!cursor}),
    button('Older items', () => {cursor=nextCursor; refresh(false);}, '', {disabled:!nextCursor})));
}
async function choose(item) {
  const token = ++selectionGeneration;
  await saveEdits();
  const loaded = await get('items',item.id);
  if (token !== selectionGeneration) return;
  selected = loaded;
  // Recompute legacy weighted totals only for the game being opened. Older
  // game bodies remain unloaded while browsing the paginated library.
  if (selected?.kind === "match") {
    const rows = decisionHistory(selected);
    selected.decisionSummary = [0, 1].map(player => decisionTotals(rows, player));
  }
  renderList();
  inspector();
  if (getComputedStyle($("inspector")).display === "none") openPanel();
}
function inspector() {
  previewBoard?.destroy(); previewBoard = null;
  saveEdits = async () => {};
  const p = $("panel");
  p.replaceChildren();
  if (!selected) {
    p.append(
      el("h2", {}, "Local collection"),
      el(
        "p",
        { class: "muted" },
        "Saved in this browser only. Export to keep a copy elsewhere.",
      ),
      button("Review due items", showDue),
    );
    return;
  }
  const item = selected,
    title = el("input", { value: item.title, maxlength: 160 }),
    notes = el("textarea", { value: item.notes, maxlength: 12000 }),
    tags = el("input", { value: item.tags.join(", "), maxlength: 500 }),
    group = el("input", {
      value: item.collection,
      maxlength: 100,
      placeholder: "Collection name",
    });
  if (pageProgress?.selected === item.id && pageProgress.fields) {
    [title, notes, tags, group].forEach((n, i) => {
      n.value = pageProgress.fields[i] ?? n.value;
    });
    pageProgress.fields = null;
  }
  // The inspector is grouped: Open, Edit, Export, then Delete; the opening
  // action stays the first reachable control.
  const section = (name, title) =>
    el("section", { class: `library-group library-group--${name}`, "aria-label": title });
  const openGroup = section("open", "Open"),
    editGroup = section("edit", "Edit"),
    exportGroup = section("export", "Export"),
    dangerGroup = section("danger", "Delete"),
    heading = el("h2", { class: "library-selected-title" }, item.title);
  // Fields save on their own when they change, before another item opens and
  // when the Details sheet closes; unchanged fields write nothing.
  saveEdits = async () => {
    const edits = {
      title: title.value.trim() || "Untitled",
      notes: notes.value,
      tags: tags.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      collection: group.value.trim(),
    };
    if (Object.entries(edits).every(([k, v]) => String(v) === String(item[k]))) return;
    Object.assign(item, edits, { updatedAt: Date.now() });
    heading.textContent = item.title;
    try {
      await put("items", { ...item });
    } catch (e) {
      return showError(e);
    }
    // A mouse press on a row blurs the field first; redraw the list only after
    // the press ends, or its click would land on a replaced row.
    if (listPressed)
      await new Promise((r) => {
        const done = () => setTimeout(r);
        addEventListener("pointerup", done, { once: true });
        addEventListener("pointercancel", done, { once: true });
      });
    refresh(false);
  };
  [title, notes, tags, group].forEach((n) => n.addEventListener("change", () => saveEdits()));
  p.append(
    heading,
    openGroup,
    editGroup,
    exportGroup,
    dangerGroup,
  );
  if (item.kind !== "collection")
    openGroup.append(button(
      item.kind === "match" ? "Review in Solver" : "Open in Solver",
      () => (location.href = `/backgammon/solver/?item=${encodeURIComponent(item.id)}`),
      item.kind === "match" ? "" : "primary",
      { class: item.kind === "match" ? "library-open" : "primary library-open" },
    ));
  if (item.kind === "match")
    openGroup.append(
      button(
        "Review decisions",
        () =>
          sessionReview(item, {
            onSave: async (snapshot, index) => {
              const current = await get("items", item.id);
              if (!current || !sameDecisionPrefix(current, snapshot, index))
                throw new Error(
                  "This session changed. Reopen its review to continue.",
                );
              current.events[index].evaluation =
                snapshot.events[index].evaluation;
              await put("items", { ...current, updatedAt: Date.now() });
              await refresh();
            },
          }),
        "primary",
        { id: "review-decisions" },
      ),
      button("History tree", () => historyExplorer(item), "", {id: "library-history-tree"}),
    );
  if (item.kind === "match" && item.undoLog?.length)
    openGroup.append(
      el(
        "p",
        { class: "muted small" },
        `${item.undoLog.length} saved history ${item.undoLog.length === 1 ? "line" : "lines"}. Explore earlier variations in History tree. Exports include every saved line.`,
      ),
    );
  if (item.kind !== "match")
    openGroup.append(
      button("Practice this position", async () => {
        await put("items", {
          ...item,
          tags: [...new Set([...item.tags, "exercise"])],
        });
        location.href = `/backgammon/trainer/?item=${encodeURIComponent(item.id)}#mistakes`;
      }),
    );
  if (item.kind !== "collection") {
    const slot = el("div", { class: "library-preview" });
    openGroup.append(slot);
    const board = previewBoard = new Board(slot);
    board.render(
      item.kind === "match"
        ? replay(item.initial, item.events).at(-1)
        : item.state,
      { ...settings(), interactive: false },
    );
  }
  editGroup.append(
    field("Name", title),
    field("Notes", notes),
    field("Tags", tags),
    field("Collection", group),
  );
  exportGroup.append(
    button("Export item", () =>
      download(
        JSON.stringify(item, null, 2),
        `backgammon-${item.kind}.json`,
      ),
    ),
  );
  dangerGroup.append(
    button(
      "Delete",
      () => {
        const ask = confirmDialog(
          "Delete this item?",
          `“${item.title}” will be removed from this browser’s Library.`,
          async () => {
            const at = [...$("items").querySelectorAll(".library-item")].findIndex((r) => r.getAttribute("aria-pressed") === "true");
            await remove("items", item.id);
            selected = null;
            await refresh();
            document.getElementById("details-dialog")?.close();
            p.scrollTop = 0;
            toast("Deleted.");
            // Focus the row that took the deleted one's place once the
            // confirm closes (the page behind it is inert until then).
            ask.addEventListener("close", () => {
              const rows = $("items").querySelectorAll(".library-item");
              (rows[Math.max(0, Math.min(at, rows.length - 1))] || $("main")).focus();
            }, { once: true });
          },
          { verb: "Delete", danger: true },
        );
      },
      "danger",
    ),
  );
}
function importDialog() {
  const file = el("input", {
      type: "file",
      accept: ".json,application/json",
    }),
    mode = select(
      [
        ["merge", "Merge into this Library"],
        ["replace", "Replace this Library"],
      ],
      "merge",
    );
  let d;
  d = dialog(
    "Import a Library backup",
    el(
      "div",
      { class: "stack" },
      field("Backup file (up to 8 MB)", file),
      field("Import behavior", mode),
      el(
        "p",
        { class: "muted small" },
        "Merge keeps existing items and replaces matching IDs. Replace clears saved items and training progress. The whole backup is validated before writing.",
      ),
    ),
    [
      button(
        "Import",
        async () => {
          const f = file.files[0];
          if (!f) throw new Error("Choose a backup file.");
          if (f.size > MAX_BACKUP)
            throw new Error("Backup is larger than 8 MB.");
          const text = await f.text();
          parseBackup(text);
          const apply = async () => {
            const n = await importBackup(text, mode.value === "replace");
            d.close();
            await refresh();
            toast(`Imported ${n} items.`);
          };
          if (mode.value === "replace")
            confirmDialog(
              "Replace the Library?",
              "Export a backup first if you want to keep your current collection.",
              apply,
              { verb: "Replace", danger: true },
            );
          else await apply();
        },
        "primary",
      ),
    ],
  );
}
async function showDue() {
  const progress = await all("progress"),
    due = progress.filter((p) => p.due <= Date.now()),
    attempts = progress.reduce((n, p) => n + p.attempts, 0);
  dialog(
    "Review progress",
    el(
      "div",
      { class: "stack" },
      el(
        "p",
        {},
        attempts
          ? `${attempts} recorded attempts across ${progress.length} decisions. ${due.length} due for review.`
          : "No practice attempts yet.",
      ),
      el(
        "p",
        { class: "muted" },
        "Intervals extend with accurate unassisted answers. Hints and skips are recorded separately.",
      ),
      el("a", { href: "/backgammon/trainer/" }, "Start a practice session"),
    ),
  );
}

document.documentElement.dataset.appReady = "true";
}
boot();
