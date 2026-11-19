import { decisionHistory, groupDecisionTurns } from "../core/decision-history.mjs";
import { applyBoardTheme } from "../core/appearance.mjs";
import { decisionFeedback, lossTone } from "../core/decision-feedback.mjs";
import { decisionReview } from "../ui/decision-review.mjs";
import { historyTurn } from "../ui/history-turn.mjs";
import { dieFace, el, button } from "../ui/shell.mjs";

const names = ["White", "Black"];
const fps = 25;
const officeBoard = {
  version: 1, preset: "slate",
  colors: {
    frame: "#2B3755", border: "#596986", surface: "#A7B2C0", bar: "#3D4D6C", tray: "#405173",
    pointA: "#E7E9E2", pointB: "#4B5E89", numbers: "#EDF1F8", caption: "#E5EAF4",
    checker0: "#F2F2E8", rim0: "#CCD1D3", detail0: "#E0E3DE", count0: "#1E293C",
    checker1: "#373D48", rim1: "#161F33", detail1: "#505969", count1: "#F1F5FA",
    die0: "#F2F2E8", pips0: "#252C40", dieBorder0: "#AFB9CA",
    die1: "#49638F", pips1: "#FFFFFF", dieBorder1: "#BAC8E2",
    cube: "#E7E9E2", cubeText: "#1A2639", cubeBorder: "#7686A0",
  },
};
const timecode = frame => {
  const seconds = Math.floor(frame / fps);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function createHistory(seek, player) {
  applyBoardTheme(officeBoard, document.body);
  const content = document.querySelector("#history-content");
  const download = document.querySelector("#download-history");
  const heading = document.querySelector("#history-heading");
  const frameDownload = document.querySelector("#download-frame-data");
  const navigation = document.querySelector("#decision-navigation");
  const previous = navigation.querySelector("[data-decision-jump='previous']");
  const current = navigation.querySelector("[data-decision-jump='current']");
  const next = navigation.querySelector("[data-decision-jump='next']");
  const cache = new Map();
  let selected, request;
  let chapters = [], targets = {};

  function synchronize() {
    const frame = Math.round(player.currentTime * fps);
    const active = chapters.findLast(chapter => chapter.start <= frame && frame < chapter.end);
    targets = {
      previous: chapters.findLast(chapter => chapter.start < (active?.start ?? frame)),
      current: active,
      next: chapters.find(chapter => chapter.start > frame),
    };
    previous.disabled = !targets.previous;
    current.disabled = !targets.current;
    next.disabled = !targets.next;
    const text = targets.current ? `Review ${targets.current.label}` : "Review current decision";
    if (current.textContent !== text) current.textContent = text;
  }

  for (const event of ["timeupdate", "seeking", "seeked"]) player.addEventListener(event, synchronize);
  for (const button of [previous, next]) {
    button.addEventListener("click", () => {
      const chapter = targets[button.dataset.decisionJump];
      if (chapter) seek(chapter.start / fps, false);
    });
  }
  current.addEventListener("click", () => {
    if (!targets.current) return;
    player.pause();
    targets.current.open();
  });

  const review = (source, { result, action, label, title, player }) => {
    const dialog = decisionReview(source, {
      title, names, opponent: player === 1, rankedMoveLimit: 5, includePlayedInRanking: false,
      recordingReview: true,
    });
    if (result) dialog.result(result, false);
    else dialog.preview(action?.steps, label);
  };

  function draw(data) {
    const items = new Map(data.items.map(item => [item.id, item]));
    const decisions = new Map(data.items.filter(item => item.kind === "match").map(item => [
      item.id, new Map(decisionHistory(item).map(row => [row.index, row])),
    ]));
    const score = value => el("td", { "data-loss-tone": lossTone(value).tone }, value.toFixed(3));
    const totals = el("table", { class: "vision-history-totals" },
      el("caption", { class: "sr-only" }, "EV loss by decision type"),
      el("thead", {}, el("tr", {},
        ...["Player", "Checker EV Loss", "Cube EV Loss"].map(label => el("th", { scope: "col" }, label)))),
      el("tbody", {}, ...(data.replay.lossBreakdown ?? []).map(({ checkerLoss, cubeLoss }, player) => el("tr", {},
        el("th", { scope: "row", "data-player": player }, names[player]), score(checkerLoss), score(cubeLoss)))));
    const list = el("ol", { class: "vision-history-list" });
    chapters = [];
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
        if (Number.isFinite(entry.endFrame)) {
          const label = entry.kind === "checker"
            ? `${names[row.player]}’s ${[...row.source.dice].sort((a, b) => b - a).join("–")}`
            : `${names[row.player]}’s ${row.action.type === "roll"
              ? row.source.cube.value === 1 ? "no double" : "no redouble" : row.action.type}`;
          chapters.push({ start: entry.rollFrame ?? entry.frame, end: entry.endFrame, label, open });
        }
        const node = historyTurn({ ...group, turn: entry.turn }, {
          names, viewer: 0, local: true, showQuietCube: true, actions: () => ({ review: open, preview: open }),
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
        if (position?.analysis) {
          const isCube = position.analysis.type === "cube";
          const seat = position.state.turn;
          const open = () => review(position.state, {
            title: `${names[seat]} · ${isCube ? "Cube decision" : "Observed position"} · ${time}`,
            player: seat, result: position.analysis,
          });
          if (isCube) {
            const feedback = decisionFeedback(position.analysis, position.state);
            information.append(el("span", { class: "vision-loss-value", "data-loss-tone": feedback.tone },
              `${feedback.value} EV loss`));
            chapters.push({ start: entry.rollFrame ?? entry.frame, end: entry.endFrame,
              label: `${names[seat]}’s ${entry.label.toLowerCase()}`, open });
          }
          information.append(button(isCube ? "Review cube" : "Review position", open, "ghost"));
        }
        item.append(information);
      }
      list.append(item);
    }
    content.replaceChildren(totals, list);
    chapters.sort((a, b) => a.start - b.start);
    navigation.hidden = !chapters.length;
    frameDownload.hidden = !data.replay.frameData;
    synchronize();
  }

  return {
    async select(number) {
      if (selected === number) return;
      selected = number;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const id = number.padStart(2, "0");
      const file = `history/game-${id}.json`;
      chapters = [];
      navigation.hidden = frameDownload.hidden = true;
      frameDownload.href = `state/game-${id}.json`;
      frameDownload.download = `office-3-game-${id}-frames.json`;
      heading.textContent = `Game ${number} history`;
      download.href = file;
      download.download = `office-3-game-${id}-history.json`;
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
