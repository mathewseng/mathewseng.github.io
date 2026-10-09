// SPDX-License-Identifier: GPL-3.0-or-later
import { historyTree, historyPath } from "../core/history-tree.mjs";
import { clone, notation, decisionPlayer } from "../core/rules.mjs";
import { settings } from "../core/storage.mjs";
import { el, button, dialog } from "./shell.mjs";
import { Board } from "./board.mjs";

function eventLabel(event) {
  if (!event) return "Starting position";
  const a = event.action;
  if (a.type === "move") return notation(a.steps, event.actor);
  if (["opening", "roll", "practice-roll"].includes(a.type))
    return `${a.type === "opening" ? "Opening" : a.type === "practice-roll" ? "Set roll" : "Roll"} ${a.dice.join("–")}`;
  return (
    {
      double: "Double",
      take: "Take",
      pass: "Drop",
      beaver: "Beaver",
      raccoon: "Raccoon",
      next: "Next game",
      resign: "Offer resignation",
      accept: "Accept resignation",
      reject: "Decline resignation",
    }[a.type] || a.type
  );
}

// Read-only, isolated shared board. Only the explicit footer action restores.
export function historyExplorer(model, { onReturn } = {}) {
  const snapshot = clone(model),
    tree = historyTree(snapshot),
    names = snapshot.names || ["Ivory", "Teal"];
  const slot = el("div", { class: "history-preview-board" });
  const caption = el("p", { class: "history-preview-caption", role: "status" });
  const trail = el("p", { class: "muted small history-trail" });
  const list = el("div", {
    class: "history-tree-list",
    role: "tree",
    "aria-label": "Game variations",
  });
  const pages = el("span", { class: "muted small", "aria-live": "polite" });
  const summary = el(
    "p",
    { class: "muted small history-tree-summary" },
    "Preview committed positions; your draft stays on the table. Returning keeps both lines.",
  );
  const error = el("p", { class: "error", role: "alert", hidden: true });
  let selected = tree.current,
    page = 0,
    size = 8,
    busy = false,
    view = "tree";
  const collapsed = new Set();
  const compact = matchMedia("(max-width: 700px), (max-height: 500px)");
  const before = button("Previous position", () =>
    choose(tree.nodes[selected].parent, true),
  );
  const after = button("Next position", () => {
    const children = tree.nodes[selected].children;
    if (children.length === 1) choose(children[0], true);
    else {
      collapsed.delete(selected);
      setView("tree");
      draw(true);
    }
  });
  const boardPanel = el(
    "section",
    { class: "history-preview", "aria-label": "Position preview" },
    slot,
    caption,
    trail,
    el("div", { class: "row" }, before, after),
  );
  const prev = button("Previous page", () => {
    page--;
    draw();
  });
  const next = button("Next page", () => {
    page++;
    draw();
  });
  const pager = el(
    "div",
    { class: "row spread history-tree-pager" },
    prev,
    pages,
    next,
  );
  const panel = el(
    "section",
    { class: "history-tree-panel" },
    summary,
    list,
    pager,
  );
  const layout = el("div", { class: "history-explorer" }, boardPanel, panel);
  const d = dialog("History tree", layout);
  d.classList.add("history-dialog");
  const board = new Board(slot);
  const tabs = el("div", { class: "row history-tree-tabs" });
  const treeTab = button("Tree", () => setView("tree")),
    boardTab = button("Board", () => setView("board"));
  tabs.append(
    treeTab,
    boardTab,
    button(
      "Current position",
      () => {
        for (let n = tree.nodes[tree.current]; n; n = tree.nodes[n.parent])
          collapsed.delete(n.id);
        choose(tree.current, false);
        setView("tree");
        draw(true);
      },
      "ghost",
    ),
  );
  d.querySelector(".dialog-header").after(tabs);
  let restore;
  if (onReturn) {
    restore = button(
      "Return to this position",
      async () => {
        if (restore.disabled || busy) return;
        busy = true;
        restore.disabled = true;
        try {
          await onReturn(
            historyPath(tree, selected),
            tree.nodes[selected].state,
          );
          d.close();
        } catch (e) {
          error.hidden = false;
          error.textContent = e.message;
          busy = false;
          updateBoard();
        }
      },
      "primary",
      { id: "history-return" },
    );
    d.querySelector("footer").append(restore);
  }
  d.querySelector("footer").prepend(error);
  function setView(v) {
    view = v;
    d.dataset.historyView = v;
    treeTab.setAttribute("aria-pressed", v === "tree");
    boardTab.setAttribute("aria-pressed", v === "board");
    queueMicrotask(fit);
  }
  function flattened() {
    const result = [],
      stack = [...tree.roots].reverse().map((id) => ({ id, indent: 0 }));
    while (stack.length) {
      const item = stack.pop(),
        n = tree.nodes[item.id];
      result.push(item);
      if (!collapsed.has(n.id))
        for (const id of [...n.children].reverse())
          stack.push({
            id,
            indent: item.indent + (n.children.length > 1 ? 1 : 0),
          });
    }
    return result;
  }
  function draw(reveal = false) {
    const flat = flattened();
    if (reveal) {
      const i = flat.findIndex((n) => n.id === selected);
      if (i >= 0) page = Math.floor(i / size);
    }
    page = Math.max(0, Math.min(page, Math.ceil(flat.length / size) - 1));
    const displayed = flat.slice(page * size, (page + 1) * size);
    list.replaceChildren(
      ...displayed.map(({ id, indent }) => {
        const n = tree.nodes[id],
          siblings =
            n.parent === null ? tree.roots : tree.nodes[n.parent].children;
        const row = el("div", {
          class: "history-node",
          role: "treeitem",
          tabindex: id === selected ? 0 : -1,
          "data-history-node": id,
          "data-player": n.event?.actor ?? "none",
          "aria-level": n.depth + 1,
          "aria-posinset": siblings.indexOf(id) + 1,
          "aria-setsize": siblings.length,
          "aria-selected": String(id === selected),
          ...(n.children.length
            ? { "aria-expanded": String(!collapsed.has(id)) }
            : {}),
          onClick: () => choose(id, true),
          onKeydown: (e) => {
            let target = null;
            const i = flat.findIndex((v) => v.id === id);
            if (e.key === "ArrowDown") target = flat[i + 1]?.id;
            else if (e.key === "ArrowUp") target = flat[i - 1]?.id;
            else if (e.key === "Home") target = flat[0]?.id;
            else if (e.key === "End") target = flat.at(-1)?.id;
            else if (e.key === "ArrowRight") {
              if (collapsed.has(id)) {
                collapsed.delete(id);
                draw(true);
              } else target = n.children[0];
            } else if (e.key === "ArrowLeft") {
              if (n.children.length && !collapsed.has(id)) {
                collapsed.add(id);
                draw(true);
              } else target = n.parent;
            } else if (["Enter", " "].includes(e.key)) {
              choose(id, true);
              e.preventDefault();
              return;
            } else return;
            e.preventDefault();
            if (target !== null && target !== undefined) choose(target, false);
            draw(true);
            list
              .querySelector(`[data-history-node="${selected}"]`)
              ?.focus({ preventScroll: true });
          },
        });
        row.style.setProperty("--branch-indent", Math.min(indent, 4));
        const toggle = button(
          n.children.length ? (collapsed.has(id) ? "▸" : "▾") : "·",
          (e) => {},
          "history-node-toggle",
          {
            "aria-label": `${collapsed.has(id) ? "Expand" : "Collapse"} after ${eventLabel(n.event)}`,
            tabindex: -1,
            disabled: !n.children.length,
          },
        );
        toggle.onclick = (e) => {
          e.stopPropagation();
          collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
          draw(true);
          list
            .querySelector(`[data-history-node="${id}"]`)
            ?.focus({ preventScroll: true });
        };
        row.append(
          toggle,
          el("span", { class: "history-node-step muted" }, String(n.depth)),
          el(
            "span",
            { class: "history-node-copy" },
            el("strong", {}, eventLabel(n.event)),
            el(
              "span",
              { class: "muted small" },
              n.detached
                ? "Older line · origin unavailable"
                : `${n.event ? names[n.event.actor] + " · " : ""}Game ${n.state.gameNumber}${n.children.length > 1 ? ` · ${n.children.length} branches` : ""}`,
            ),
          ),
          el(
            "span",
            { class: "history-node-marker" },
            n.current
              ? "Current"
              : n.active
                ? "Main"
                : n.detached && n.parent === null
                  ? "Saved line"
                  : n.parent !== null &&
                      tree.nodes[n.parent].children.length > 1
                    ? "Variation"
                    : "",
          ),
        );
        return row;
      }),
    );
    if (!list.querySelector('[tabindex="0"]'))
      list.querySelector('[role="treeitem"]')?.setAttribute("tabindex", "0");
    prev.disabled = page === 0;
    next.disabled = (page + 1) * size >= flat.length;
    pages.textContent = `${page * size + 1}–${Math.min((page + 1) * size, flat.length)} / ${flat.length}`;
  }
  function updateBoard() {
    const n = tree.nodes[selected],
      s = n.state;
    board.render(s, { ...settings(), interactive: false, preview: true });
    caption.textContent = `${eventLabel(n.event)}${n.current ? " · Current position" : ""}`;
    trail.textContent = `Game ${s.gameNumber} · ${names[decisionPlayer(s)]} · ${s.phase === "move" ? `dice ${s.dice.join("–")}` : s.phase === "roll" ? "before roll" : s.phase} · cube ${s.cube.value} · score ${s.scores.join("–")}`;
    before.disabled = n.parent === null;
    after.disabled = !n.children.length;
    after.textContent =
      n.children.length > 1 ? "Choose branch" : "Next position";
    if (restore) restore.disabled = busy || n.current || n.detached;
  }
  function choose(id, showBoard) {
    if (id === null || id === undefined) return;
    selected = id;
    updateBoard();
    draw(true);
    if (showBoard && compact.matches) setView("board");
  }
  function fit() {
    if (!d.open || (compact.matches && view !== "tree")) return;
    const h = list.clientHeight;
    if (h < 48) return;
    const nextSize = Math.max(1, Math.floor(h / 52));
    if (nextSize !== size) {
      size = nextSize;
      draw(true);
    }
  }
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
  observer.observe(list);
  d.addEventListener(
    "close",
    () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      board.destroy();
    },
    { once: true },
  );
  choose(selected, false);
  setView("tree");
  return d;
}
