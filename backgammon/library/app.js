// SPDX-License-Identifier: GPL-3.0-or-later
import { startUpdates, resumedAfterUpdate } from "../ui/updates.mjs";
import { readPageProgress, keepPageProgress } from "../ui/page-progress.mjs";
import { historyExplorer } from "../ui/history-tree.mjs";
import {
  all,
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
import {
  decisionHistory,
  decisionTotals,
  sameDecisionPrefix,
} from "../core/decision-history.mjs";
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
const KIND_NAMES = { match: "Session", position: "Position", mistake: "Mistake", collection: "Collection" };

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
async function boot() {
await startUpdates();
resumedAfterUpdate();
const pageProgress = readPageProgress();
shell("library", "Library");
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
$("toolbar").prepend(
  button("Import", importDialog, "ghost"),
  button("Export", exportDialog, "ghost", { id: "export-library" }),
);
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
  selected = items.find((i) => i.id === pageProgress.selected) || null;
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
async function refresh() {
  try {
    items = (await all()).sort((a, b) => b.updatedAt - a.updatedAt);
    selected = items.find((i) => i.id === selected?.id) || null;
    render();
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
      renderList();
    },
  });
  const collections = [
    ...new Set(items.map((i) => i.collection).filter(Boolean)),
  ];
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
      renderList();
    },
  );
  typeFilter.setAttribute("aria-label", "Item type");
  list.replaceChildren(
    el(
      "div",
      { class: "library-filters" },
      search,
      typeFilter,
      Object.assign(select(
        [["", "All collections"], ...collections.map((c) => [c, c])],
        collection,
        (v) => {
          collection = v;
          renderList();
        },
      ), { ariaLabel: "Collection filter" }),
    ),
    el("div", { id: "items" }),
  );
  renderList();
  inspector();
}
function renderList() {
  const shown = items.filter(
    (i) =>
      (!collection || i.collection === collection) &&
      (!kind || i.kind === kind) &&
      [i.title, i.notes, ...i.tags]
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
          items.length
            ? "No matching items"
            : "Nothing saved yet.",
        ),
        el(
          "p",
          { class: "muted" },
          items.length
            ? "Try another search or collection."
            : "Games you play save here on their own. Save positions from the Solver and mistakes from the Trainer.",
        ),
        el("a", { class: "btn", href: "/backgammon/solver/" }, "Open Solver"),
      ),
    );
    return;
  }
  // Rows are real buttons with a pressed state for the selected item; their
  // content is phrasing content (spans), the title a <strong>.
  for (const item of shown) {
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
          `${KIND_NAMES[item.kind] || item.kind} · ${new Date(item.updatedAt).toLocaleDateString()}${item.status ? " · " + item.status.replaceAll("-", " ") : ""}${item.tags.length ? " · " + item.tags.join(", ") : ""}`,
        ),
      ),
    );
    if (item.kind === "match") {
      const decisions = decisionHistory(item);
      const summary = el("span", { class: "library-session-summary" });
      if (decisions.length) {
        const totals = [0, 1].map(player => decisionTotals(decisions, player));
        const games = new Set(decisions.map(r => r.game)).size;
        summary.append(
          el("span", { class: "library-session-players" }, ...totals.map((t, player) =>
            el("span", { class: "library-session-player", "data-player": player },
              el("strong", {}, item.names?.[player] || (player ? "Black" : "White")),
              el("span", {}, `${t.evaluated ? t.loss.toFixed(3) : "—"} ${t.money ? "EV points lost" : "equity lost"}`),
            ))),
          el("span", { class: "library-session-count" },
            `${games} ${games === 1 ? "game" : "games"} · ${totals.reduce((n, t) => n + t.evaluated, 0)} evaluated · ${totals.reduce((n, t) => n + t.pending, 0)} unreviewed`),
        );
      }
      if (!decisions.length)
        summary.append(el("span", { class: "library-session-count" }, "No decisions played yet"));
      row.lastElementChild.append(summary);
    }
    parent.append(row);
  }
}
function choose(item) {
  selected = item;
  renderList();
  inspector();
  if (getComputedStyle($("inspector")).display === "none") openPanel();
}
function inspector() {
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
  // The inspector is grouped: Open, Edit, Export, then a separated Danger
  // zone; the opening action stays the first reachable control.
  const section = (name, title, heading = true) =>
    heading
      ? el("section", { class: `library-group library-group--${name}`, "aria-labelledby": `library-${name}-title` },
          el("h3", { class: "library-group-title", id: `library-${name}-title` }, title))
      : el("section", { class: `library-group library-group--${name}`, "aria-label": title });
  const openGroup = section("open", "Open", false),
    editGroup = section("edit", "Edit", false),
    exportGroup = section("export", "Export"),
    dangerGroup = section("danger", "Danger zone");
  p.append(
    el("p", { class: "library-selected-kind" }, KIND_NAMES[item.kind] || item.kind),
    el("h2", { class: "library-selected-title" }, item.title),
    openGroup,
    editGroup,
    exportGroup,
    dangerGroup,
  );
  if (item.kind !== "collection")
    openGroup.append(button(
      item.kind === "match" ? "Review match in Solver" : "Open in Solver",
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
        location.href = "/backgammon/trainer/#mistakes";
      }),
    );
  if (item.kind !== "collection") {
    const slot = el("div", { class: "library-preview" });
    openGroup.append(slot);
    const board = new Board(slot);
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
    button(
      "Save changes",
      async () => {
        await put("items", {
          ...item,
          title: title.value.trim() || "Untitled",
          notes: notes.value,
          tags: tags.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          collection: group.value.trim(),
          updatedAt: Date.now(),
        });
        toast("Updated.");
        await refresh();
      },
      "primary",
    ),
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
    el("p", { class: "muted small" }, "Deleting removes the item from this browser only. Exported copies are unaffected."),
    button(
      "Delete",
      () =>
        confirmDialog(
          "Delete this item?",
          `“${item.title}” will be removed from this browser’s Library.`,
          async () => {
            await remove("items", item.id);
            selected = null;
            await refresh();
          },
          { verb: "Delete", danger: true },
        ),
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
