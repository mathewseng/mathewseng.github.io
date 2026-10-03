// Cube trainer: play the two-player cube game against the equilibrium bot.
// The bot's cards stay hidden while any cube action remains; your numbers are
// against its range. Once no action is left the hands are tabled and the
// remaining streets show perfect-information equities.
import { VARIANTS, DROP_UNIT, dealTable, settle, cardName } from "./engine.mjs";
import { $, el, button, cardEl, renderSeats, renderOptionTable, cubeFace, signed, pct, STREET_CARDS, streetName, metric, evColor } from "./ui.js";
import { ownerLabel, fillVariantSelect } from "./cube-view.js";
import { computeView, gradeHidden, sampleAction } from "./table-view.js";

const YOU = 0,
  BOT = 1;
const NAMES = ["You", "Bot"];

export function initTrainer({ pool }) {
  const tr = {
    variant: "both",
    btn: 1,
    hands: [],
    board: [],
    street: 0,
    view: 0,
    cube: { level: 1, owner: null },
    history: { flop: null, river: null, ended: false },
    phase: "idle",
    actor: null,
    responder: null,
    score: 0,
    played: 0,
    decisions: 0,
    errors: 0,
    lost: 0,
    log: [],
    snapshots: [],
    preview: null,
    decisionsThisHand: [],
    token: 0,
    timer: null,
  };
  fillVariantSelect($("tr-variant"), tr.variant);
  $("tr-variant").addEventListener("change", () => {
    tr.variant = $("tr-variant").value;
    if (tr.phase !== "idle") trLog(`Variant changed to ${VARIANTS[tr.variant].name}; it applies from the next hand.`);
  });
  $("tr-new").addEventListener("click", newHand);
  $("tr-reset").addEventListener("click", () => {
    Object.assign(tr, { score: 0, played: 0, decisions: 0, errors: 0, lost: 0 });
    render();
  });
  const variant = () => VARIANTS[tr.variant];
  const precision = () => $("tr-precision").value;
  const visibleBoard = (s = tr.street) => tr.board.slice(0, STREET_CARDS[s]);
  const you = (seat) => seat === YOU;
  const verbFor = (seat, base) => (you(seat) ? base : base === "beaver" ? "beavers" : base + "s");

  function trLog(text, strong = false) {
    tr.log.unshift({ text, strong });
    if (tr.log.length > 80) tr.log.pop();
  }
  function newHand() {
    clearTimeout(tr.timer);
    tr.token++;
    const mode = $("tr-seat").value;
    tr.btn = mode === "btn" ? YOU : mode === "opp" ? BOT : tr.played % 2 === 0 ? YOU : BOT;
    const t = dealTable(2);
    tr.hands = t.hands;
    tr.board = t.board;
    tr.street = 0;
    tr.view = 0;
    tr.cube = { level: 1, owner: null };
    tr.history = { flop: null, river: null, ended: false };
    tr.phase = "street";
    tr.actor = null;
    tr.responder = null;
    tr.snapshots = [];
    tr.preview = null;
    tr.decisionsThisHand = [];
    tr.result = null;
    trLog(`New hand (${variant().name}). ${NAMES[tr.btn]} ${you(tr.btn) ? "are" : "is"} on the button.`, true);
    computeStreet();
  }
  function spec(street = tr.street) {
    return {
      hands: tr.hands,
      board: visibleBoard(street),
      street,
      variant: tr.variant,
      btn: tr.btn,
      cube: tr.cube,
      cubeEnabled: true,
      history: tr.history,
      precision: precision(),
    };
  }
  async function computeStreet() {
    const s = tr.street;
    const token = ++tr.token;
    tr.snapshots[s] = { view: null, cube: { ...tr.cube } };
    render();
    try {
      const view = await computeView(pool, spec());
      if (token !== tr.token) return;
      tr.snapshots[s].view = view;
      afterView(view);
    } catch (error) {
      console.error(error);
      $("tr-prompt").textContent = `Computation failed: ${error.message}`;
    }
  }
  const current = () => tr.snapshots[tr.street]?.view ?? null;
  const decisionData = () => current()?.decision?.data ?? null;
  function afterView(view) {
    if (tr.phase === "street" && view.decision) {
      tr.phase = "decision";
      tr.actor = view.decision.actor;
      tr.responder = view.decision.responder;
    }
    render();
    runBot();
  }
  function runBot() {
    clearTimeout(tr.timer);
    const data = decisionData();
    if (!data) return;
    const token = tr.token;
    const peek = $("tr-peek").checked;
    if (tr.phase === "decision" && tr.actor === BOT) {
      tr.timer = setTimeout(() => token === tr.token && decide(BOT, sampleAction(data, "double")), 650);
    } else if (tr.phase === "response" && tr.responder === BOT) {
      tr.timer = setTimeout(() => token === tr.token && respond(BOT, sampleAction(data, "response")), 650);
    } else if (tr.phase === "beaverReply" && tr.actor === BOT) {
      tr.timer = setTimeout(() => token === tr.token && replyBeaver(BOT, sampleAction(data, "beaverReply")), 650);
    } else if (peek && ((tr.phase === "decision" && tr.actor === YOU) || (tr.phase === "response" && tr.responder === YOU) || (tr.phase === "beaverReply" && tr.actor === YOU))) {
      const kind = tr.phase === "decision" ? "double" : tr.phase === "response" ? "response" : "beaverReply";
      tr.preview = { kind, grade: gradeHidden(data, kind, tr.cube.level, null), chooser: YOU, level: tr.cube.level, street: tr.street, preview: true };
      render();
    }
  }
  function record(seat, kind, chosen) {
    const data = decisionData();
    const grade = gradeHidden(data, kind, tr.cube.level, chosen);
    if (seat === YOU) {
      tr.decisions++;
      if (grade.error > 0.005) tr.errors++;
      tr.lost += grade.error;
    }
    tr.preview = null;
    tr.decisionsThisHand.unshift({ kind, grade, chooser: seat, level: tr.cube.level, street: tr.street, preview: false });
  }
  function decide(seat, choice) {
    if (tr.phase !== "decision" || tr.actor !== seat || !decisionData()) return;
    record(seat, "double", choice);
    const verb = tr.cube.level > 1 ? "redouble" : "double";
    if (choice === "double") {
      tr.phase = "response";
      trLog(`${NAMES[seat]} ${verbFor(seat, verb)} to ${tr.cube.level * 2}.`, true);
    } else {
      trLog(`${NAMES[seat]} ${you(seat) ? "do" : "does"} not ${verb}.`);
      resolve("N");
    }
    render();
    runBot();
  }
  function respond(seat, choice) {
    if (tr.phase !== "response" || tr.responder !== seat || !decisionData()) return;
    record(seat, "response", choice);
    if (choice === "drop") {
      trLog(`${NAMES[seat]} ${verbFor(seat, "drop")}.`);
      finish(tr.actor, DROP_UNIT * tr.cube.level, `${NAMES[seat].toLowerCase()} dropped`);
      return;
    }
    if (choice === "take") {
      tr.cube = { level: tr.cube.level * 2, owner: seat };
      trLog(`${NAMES[seat]} ${verbFor(seat, "take")}. Cube at ${tr.cube.level}, ${NAMES[seat].toLowerCase()} own${you(seat) ? "" : "s"} it.`);
      resolve("T");
    } else {
      tr.phase = "beaverReply";
      trLog(`${NAMES[seat]} ${verbFor(seat, "beaver")} to ${tr.cube.level * 4}!`, true);
    }
    render();
    runBot();
  }
  function replyBeaver(seat, choice) {
    if (tr.phase !== "beaverReply" || tr.actor !== seat || !decisionData()) return;
    record(seat, "beaverReply", choice);
    if (choice === "drop") {
      trLog(`${NAMES[seat]} ${verbFor(seat, "drop")} the beaver.`);
      finish(tr.responder, 2 * DROP_UNIT * tr.cube.level, `${NAMES[seat].toLowerCase()} dropped the beaver`);
      return;
    }
    tr.cube = { level: tr.cube.level * 4, owner: tr.responder };
    trLog(`${NAMES[seat]} ${verbFor(seat, "take")} the beaver. Cube at ${tr.cube.level}, ${NAMES[tr.responder].toLowerCase()} own${you(tr.responder) ? "" : "s"} it.`);
    resolve("BT");
    render();
    runBot();
  }
  // The pending action is settled; record it in the history and, if hands are
  // now tabled, recompute this street with perfect information.
  function resolve(outcome) {
    if (tr.street === 1) tr.history.flop = outcome;
    else tr.history.river = "done";
    tr.phase = "street";
    tr.actor = null;
    tr.responder = null;
    tr.snapshots[tr.street].cubeAfter = { ...tr.cube };
    const before = current();
    if (before && !before.tabled) {
      const token = ++tr.token;
      computeView(pool, spec())
        .then((view) => {
          if (token !== tr.token) return;
          if (view.tabled) {
            tr.snapshots[tr.street].view = view;
            trLog("No cube action remains: hands are tabled.");
            render();
          }
        })
        .catch(console.error);
    }
  }
  function finish(winner, points, reason) {
    const net = winner === YOU ? points : -points;
    tr.score += net;
    tr.played++;
    tr.phase = "over";
    tr.history.ended = true;
    tr.result = { net, reason };
    trLog(`${NAMES[winner]} win${you(winner) ? "" : "s"} ${points} point${points === 1 ? "" : "s"}: ${reason}.`, true);
    const token = ++tr.token;
    computeView(pool, spec())
      .then((view) => {
        if (token !== tr.token) return;
        tr.snapshots[tr.street].view = view;
        render();
      })
      .catch(console.error);
    render();
  }
  function showdown() {
    const r = settle(tr.hands, tr.board);
    const net = r.net[YOU] * tr.cube.level;
    tr.score += net;
    tr.played++;
    tr.phase = "over";
    tr.history.ended = true;
    tr.result = { net, settle: r, reason: "showdown" };
    const detail = r.pairs[0].hands.map((d, h) => `hand ${h + 1} ${d > 0 ? "you" : d < 0 ? "bot" : "tie"}`).join(", ");
    trLog(`Showdown: ${detail}${r.pairs[0].bonus ? ` and a scoop` : ""}. Net ${signed(r.net[YOU], 0)} × cube ${tr.cube.level} = ${signed(net, 0)} for you.`, true);
    const token = ++tr.token;
    computeView(pool, spec())
      .then((view) => {
        if (token !== tr.token) return;
        tr.snapshots[tr.street].view = view;
        render();
      })
      .catch(console.error);
    render();
  }
  function next() {
    if (tr.phase !== "street") return;
    if (tr.street === 3) {
      showdown();
      return;
    }
    tr.street++;
    tr.view = tr.street;
    tr.preview = null;
    const cards = tr.board.slice(STREET_CARDS[tr.street - 1], STREET_CARDS[tr.street]);
    trLog(`${streetName(tr.street)}: ${cards.map(cardName).join(" ")}.`);
    computeStreet();
  }
  function setView(s) {
    if (s > tr.street) return;
    tr.view = s;
    render();
  }

  /* ---------- rendering ---------- */
  function render() {
    $("score-you").textContent = signed(tr.score, 0);
    $("score-bot").textContent = signed(-tr.score, 0);
    $("tr-cube-face").replaceChildren(cubeFace(tr.cube.level, ownerLabel(tr.cube, NAMES), true));
    const steps = $("tr-streets");
    steps.replaceChildren();
    for (let s = 0; s < 4; s++) steps.append(button(streetName(s), `${s === tr.view ? "active" : s < tr.street ? "done" : ""}`, () => setView(s), tr.phase === "idle" || s > tr.street));
    const live = tr.view === tr.street;
    $("tr-view-note").textContent = tr.phase === "idle" ? "" : live ? "" : `Reviewing the ${streetName(tr.view).toLowerCase()}. Click ${streetName(tr.street)} to return to the live street.`;
    const snap = tr.snapshots[tr.view];
    const view = snap?.view ?? null;
    const board = tr.phase === "idle" ? [] : visibleBoard(tr.view);
    const bc = $("tr-board-cards");
    bc.replaceChildren();
    for (let i = 0; i < 5; i++) bc.append(i < board.length ? cardEl(board[i], i >= STREET_CARDS[tr.view - 1] && live ? "new" : "") : el("span", "slot"));
    const meta = $("tr-meta");
    meta.replaceChildren();
    if (view) {
      meta.append(el("span", "tag info-tag", view.tabled ? "Tabled · perfect information" : "Hidden · numbers vs range"));
      if (view.mode === "perfect") meta.append(spanb(`${view.stats.exact ? "Exact" : "Sampled"}: `, `${view.stats.count.toLocaleString("en-US")} runouts`));
      else if (view.stats.conditioned) meta.append(el("span", "muted", "Range conditioned on the flop cube action"));
      meta.append(spanb("Cube then: ", `${snap.cube.level} ${snap.cube.owner == null ? "centered" : `(${NAMES[snap.cube.owner]})`}`));
    } else if (tr.phase !== "idle") meta.append(el("span", "muted", "Computing…"));
    const prompt = $("tr-prompt");
    const actions = $("tr-actions");
    actions.replaceChildren();
    prompt.classList.remove("alert");
    const level = tr.cube.level;
    const verb = level > 1 ? "Redouble" : "Double";
    if (tr.phase === "idle") prompt.textContent = "Press New hand to deal.";
    else if (!live) prompt.textContent = `Viewing the ${streetName(tr.view).toLowerCase()} numbers.`;
    else if (!view) prompt.textContent = "Computing equities and the equilibrium…";
    else if (tr.phase === "street") {
      prompt.textContent = tr.street === 3 ? "River dealt. Go to showdown." : `${streetName(tr.street)} dealt. ${tr.street === 0 ? "No action before the flop." : "No action here."}`;
      actions.append(button(tr.street === 3 ? "Showdown" : `Deal ${streetName(tr.street + 1).toLowerCase()}`, "primary", next));
    } else if (tr.phase === "decision") {
      if (tr.actor === YOU) {
        prompt.textContent = `${streetName(tr.street)}: your cube decision at ${level}.`;
        prompt.classList.add("alert");
        actions.append(button(`No ${verb.toLowerCase()}`, "", () => decide(YOU, "noDouble")), button(`${verb} to ${level * 2}`, "primary", () => decide(YOU, "double")));
      } else prompt.textContent = `${streetName(tr.street)}: bot is deciding…`;
    } else if (tr.phase === "response") {
      if (tr.responder === YOU) {
        prompt.textContent = `Bot ${verb.toLowerCase()}s to ${level * 2}. Drop (lose ${DROP_UNIT * level}), take, or beaver to ${level * 4}?`;
        prompt.classList.add("alert");
        actions.append(
          button(`Drop (−${DROP_UNIT * level})`, "", () => respond(YOU, "drop")),
          button(`Take at ${level * 2}`, "primary", () => respond(YOU, "take")),
          button(`Beaver to ${level * 4}`, "", () => respond(YOU, "beaver")),
        );
      } else prompt.textContent = `You ${verb.toLowerCase()} to ${level * 2}. Bot is deciding…`;
    } else if (tr.phase === "beaverReply") {
      if (tr.actor === YOU) {
        prompt.textContent = `Bot beavers to ${level * 4}. Take, or drop and lose ${2 * DROP_UNIT * level}?`;
        prompt.classList.add("alert");
        actions.append(button(`Drop (−${2 * DROP_UNIT * level})`, "", () => replyBeaver(YOU, "drop")), button(`Take at ${level * 4}`, "primary", () => replyBeaver(YOU, "take")));
      } else prompt.textContent = `You beaver to ${level * 4}. Bot is deciding…`;
    } else if (tr.phase === "over") {
      prompt.textContent = `Hand over: ${signed(tr.result.net, 0)} for you (${tr.result.reason}).`;
      actions.append(button("New hand", "primary", newHand));
    }
    if (tr.phase === "idle") $("tr-seats").replaceChildren();
    else {
      const tabled = view ? view.tabled : false;
      const shown = [tr.hands[YOU], tabled || tr.phase === "over" ? tr.hands[BOT] : null];
      renderSeats($("tr-seats"), { hands: shown, board, stats: view?.stats ?? null, names: NAMES, btn: tr.btn, highlight: YOU, pending: !view });
    }
    renderAnalysis();
    renderSession();
    const log = $("tr-log");
    log.replaceChildren();
    for (const entry of tr.log) log.append(el("li", entry.strong ? "strong" : "", entry.text));
  }
  function spanb(label, value) {
    const s = el("span");
    s.append(label, el("b", "", value));
    return s;
  }
  function renderAnalysis() {
    const body = $("tr-analysis-body");
    body.replaceChildren();
    const note = $("tr-analysis-note");
    const list = tr.preview ? [tr.preview, ...tr.decisionsThisHand] : tr.decisionsThisHand;
    if (!list.length) {
      $("tr-analysis-title").textContent = "Cube analysis";
      note.hidden = false;
      return;
    }
    note.hidden = true;
    $("tr-analysis-title").textContent = "Cube decisions this hand";
    for (const sh of list) {
      const who = NAMES[sh.chooser];
      const kindLabel = sh.kind === "double" ? (sh.level > 1 ? "redouble decision" : "double decision") : sh.kind === "response" ? "reply to the double" : "reply to the beaver";
      const block = el("div", "decision-block");
      block.append(el("h3", "", `${sh.preview ? "Preview: " : ""}${streetName(sh.street)} ${kindLabel} (${who})`));
      const table = el("div");
      renderOptionTable(table, sh.grade, { preview: sh.preview, level: sh.level, chooser: sh.chooser === YOU ? "you" : "the bot" });
      block.append(table);
      if (!sh.preview && sh.chooser === YOU) {
        const verdict = el("p", `small ${sh.grade.error > 0.005 ? "error" : ""}`);
        verdict.textContent = sh.grade.error > 0.005 ? `Mistake: ${sh.grade.error.toFixed(2)} points given up against the equilibrium.` : "Correct (or part of the equilibrium mix).";
        if (sh.grade.error <= 0.005) verdict.style.color = "var(--green)";
        block.append(verdict);
      }
      body.append(block);
    }
  }
  function renderSession() {
    const box = $("tr-session");
    box.replaceChildren();
    box.append(
      metric("Hands", String(tr.played)),
      metric("Decisions", String(tr.decisions)),
      metric("Mistakes", String(tr.errors), { heat: tr.decisions ? evColor(-tr.errors / Math.max(1, tr.decisions), 0.5) : null }),
      metric("EV given up", `${tr.lost.toFixed(2)} pts`, { heat: evColor(-tr.lost, 10) }),
      metric("Accuracy", tr.decisions ? pct(1 - tr.errors / tr.decisions, 0) : "—"),
      metric("Net score", signed(tr.score, 0), { heat: evColor(tr.score, 20) }),
    );
  }
  render();
}
