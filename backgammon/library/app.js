// SPDX-License-Identifier: GPL-3.0-or-later
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
shell("library", "Library", "Saved in this browser. Yours to keep.");
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
      ["match", "Session Library"],
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
      select(
        [["", "All collections"], ...collections.map((c) => [c, c])],
        collection,
        (v) => {
          collection = v;
          renderList();
        },
      ),
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
        { class: "empty" },
        el(
          "h2",
          {},
          items.length
            ? "No matching items"
            : "A place for your next insight.",
        ),
        el(
          "p",
          { class: "muted" },
          items.length
            ? "Try another search or collection."
            : "Played games save here automatically, including unfinished games. You can also save positions and training mistakes.",
        ),
        el("a", { href: "/backgammon/solver/" }, "Open Solver →"),
      ),
    );
    return;
  }
  for (const item of shown) {
    const row = el(
      "div",
      {
        class: "library-item",
        role: "button",
        tabindex: 0,
        "aria-label": `Open ${item.title}`,
        "aria-selected": selected?.id === item.id,
        onClick: () => choose(item),
        onKeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choose(item);
          }
        },
      },
      el(
        "span",
        { class: "item-glyph", "aria-hidden": true },
        item.kind === "match" ? "≡" : item.kind === "mistake" ? "↺" : "◇",
      ),
      el(
        "div",
        {},
        el("h2", {}, item.title),
        el(
          "p",
          {},
          `${item.kind === "match" ? "Session" : item.kind} · ${new Date(item.updatedAt).toLocaleDateString()}${item.status ? " · " + item.status.replaceAll("-", " ") : ""}${item.tags.length ? " · " + item.tags.join(", ") : ""}`,
        ),
      ),
    );
    if (item.kind === "match") {
      const decisions = decisionHistory(item);
      const summary = el("div", { class: "library-session-summary" });
      for (const n of [...new Set(decisions.map((r) => r.game))]) {
        const rows = decisions.filter((r) => r.game === n);
        summary.append(
          el(
            "p",
            {},
            `Game ${n} · ` +
              [0, 1]
                .map((p) => {
                  const t = decisionTotals(rows, p);
                  return `${item.names?.[p] || (p ? "Teal" : "Ivory")}: ${t.evaluated ? t.loss.toFixed(3) : "—"} ${t.money ? "EV points lost" : "equity lost"} (${t.evaluated} evaluated, ${t.pending} unreviewed)`;
                })
                .join(" · "),
          ),
        );
      }
      if (!decisions.length)
        summary.append(el("p", {}, "No decisions played yet"));
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
        "Select an item to open it, add a note, or organize it.",
      ),
      el(
        "p",
        { class: "notice" },
        "Browser storage is not a cross-device backup. Export your Library regularly.",
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
  if (item.kind === "match")
    p.append(
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
    );
  if (item.kind === "match" && item.undoLog?.length)
    p.append(
      el(
        "p",
        { class: "muted small" },
        `${item.undoLog.length} accepted takeback${item.undoLog.length === 1 ? "" : "s"}. Export includes the original undone turns; match review follows the current line.`,
      ),
    );
  if (item.kind !== "collection") {
    const slot = el("div", { style: "aspect-ratio:876/600" });
    p.append(slot);
    const board = new Board(slot);
    board.render(
      item.kind === "match"
        ? replay(item.initial, item.events).at(-1)
        : item.state,
      { ...settings(), interactive: false },
    );
  }
  p.append(
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
    button(
      item.kind === "match" ? "Review match" : "Open in Solver",
      () =>
        (location.href = `/backgammon/solver/?item=${encodeURIComponent(item.id)}`),
    ),
    button("Export item", () =>
      download(
        JSON.stringify(item, null, 2),
        `backgammon-${item.kind}.json`,
      ),
    ),
  );
  if (item.kind !== "match")
    p.append(
      button("Practice this position", async () => {
        await put("items", {
          ...item,
          tags: [...new Set([...item.tags, "exercise"])],
        });
        location.href = "/backgammon/trainer/#mistakes";
      }),
    );
  p.append(
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
