import { decisionHistory, groupDecisionTurns } from "../core/decision-history.mjs";
import { decisionReview } from "../ui/decision-review.mjs";
import { historyTurn } from "../ui/history-turn.mjs";
import { dieFace, el, button } from "../ui/shell.mjs";

const names = ["White", "Black"];
const fps = 25;
const timecode = frame => {
  const seconds = Math.floor(frame / fps);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function createHistory(seek) {
  const content = document.querySelector("#history-content");
  const download = document.querySelector("#download-history");
  const heading = document.querySelector("#history-heading");
  const cache = new Map();
  let selected, request;

  const review = (source, { result, action, label, title, player }) => {
    const dialog = decisionReview(source, {
      title, names, opponent: player === 1, rankedMoveLimit: 5, includePlayedInRanking: false,
    });
    if (result) dialog.result(result, false);
    else dialog.preview(action?.steps, label);
  };

  function draw(data) {
    const items = new Map(data.items.map(item => [item.id, item]));
    const decisions = new Map(data.items.filter(item => item.kind === "match").map(item => [
      item.id, new Map(decisionHistory(item).map(row => [row.index, row])),
    ]));
    const totals = el("dl", { class: "vision-history-totals", "aria-label": "Total EV loss for confirmed decisions" },
      ...data.replay.losses.map((loss, player) => el("div", {},
        el("dt", {}, `${names[player]} EV loss`), el("dd", {}, loss.toFixed(3)))));
    const list = el("ol", { class: "vision-history-list" });
    for (const entry of data.replay.timeline) {
      const time = timecode(entry.frame);
      const position = items.get(entry.item);
      const row = decisions.get(entry.item)?.get(entry.event);
      const timestamp = button(time, () => seek(entry.frame / fps), "ghost vision-history-time", {
        "aria-label": `Seek video to ${time}`,
      });
      const item = el("li", { class: "vision-history-event", "data-history-kind": entry.kind }, timestamp);
      if (row) {
        const [group] = groupDecisionTurns([row]);
        const open = () => review(row.source, { ...row,
          title: `${names[row.player]} · ${entry.kind === "checker" ? "Checker decision" : "Cube decision"} · ${time}`,
        });
        const node = historyTurn({ ...group, turn: entry.turn }, {
          names, viewer: 0, local: true, actions: () => ({ review: open, preview: open }),
        });
        if (entry.checkpoint) node.classList.add("vision-history-checkpoint");
        item.append(node);
      } else {
        const player = Number(entry.player === "dark");
        const information = el("div", { class: "vision-history-unresolved" },
          el("div", {},
            el("strong", {}, entry.label),
            ...(entry.player ? [el("span", { class: "muted small" }, names[player])] : []),
          ),
        );
        if (entry.dice?.some(Boolean)) {
          information.append(el("span", { class: "history-roll",
            "aria-label": `Roll ${entry.dice.map(value => value || "unknown").join(" and ")}` },
          ...[...entry.dice].sort((a, b) => (b || 0) - (a || 0))
            .map(value => value ? dieFace(value, { player }) : el("span", { class: "muted" }, "?"))));
        }
        if (position?.analysis) information.append(button("Review position", () => review(position.state, {
          title: `${names[player]} · Observed position · ${time}`, player, result: position.analysis,
        }), "ghost"));
        item.append(information);
      }
      list.append(item);
    }
    content.replaceChildren(totals, list);
  }

  return {
    async select(number) {
      if (selected === number) return;
      selected = number;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const file = `history/game-${number.padStart(2, "0")}.json`;
      heading.textContent = `Game ${number} history`;
      download.href = file;
      content.setAttribute("aria-busy", "true");
      content.replaceChildren(el("p", { role: "status", class: "muted" }, "Loading game history…"));
      try {
        let data = cache.get(number);
        if (!data) {
          const response = await fetch(file, { signal: controller.signal });
          if (!response.ok) throw new Error("Unable to load game history.");
          data = await response.json();
          cache.set(number, data);
        }
        if (!controller.signal.aborted) draw(data);
      } catch {
        if (!controller.signal.aborted) content.replaceChildren(el("p", { role: "alert" }, "Game history is unavailable."));
      } finally {
        if (!controller.signal.aborted) content.setAttribute("aria-busy", "false");
      }
    },
  };
}
