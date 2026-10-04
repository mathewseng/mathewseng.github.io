// Cube trainer: play the two-player cube game against the equilibrium bot.
// The bot's cards stay hidden while any cube action remains; your numbers are
// against its range. Once no action is left the hands are tabled and the
// remaining streets show perfect-information equities.
import { VARIANTS, variantOf, DROP_UNIT, MAX_CUBE, dealTable, settle, cardName, STREETS } from "./engine.mjs";
import { offerRaise, reraise, canReraise, optionLabel, reraiseName, levelAfter } from "./cube-rules.mjs";
import { $, el, button, cardEl, renderSeats, renderOptionTable, cubeFace, signed, pct, STREET_CARDS, streetName, metric, evColor } from "./ui.js";
import { ownerLabel, fillVariantSelect, fillDropSelect } from "./cube-view.js";
import { computeView, gradeHidden, sampleAction, cubeKey } from "./table-view.js";

const YOU = 0,
  BOT = 1;
const NAMES = ["You", "Bot"];

export function initTrainer({ pool }) {
  const tr = {
    variant: "fr",
    dropUnit: 6,
    btn: 1,
    hands: [],
    board: [],
    street: 0,
    view: 0,
    cube: { level: 1, owner: null },
    history: {},
    phase: "idle",
    pending: null,
    actor: null,
    score: 0,
    played: 0,
    decisions: 0,
    errors: 0,
    lost: 0,
    log: [],
    snapshots: [],
    preview: null,
    decisionsThisHand: [],
    progress: null,
    token: 0,
    timer: null,
  };
  fillVariantSelect($("tr-variant"), tr.variant);
  fillDropSelect($("tr-drop"), tr.dropUnit);
  $("tr-drop").addEventListener("change", () => {
    if (tr.phase !== "idle" && tr.phase !== "over") trLog(`Drop cost changed to ${$("tr-drop").value}; it applies from the next hand.`);
  });
  $("tr-variant").addEventListener("change", () => {
    tr.variant = $("tr-variant").value;
    if (tr.phase !== "idle") trLog(`Variant changed to ${VARIANTS[tr.variant].name}; it applies from the next hand.`);
  });
  $("tr-new").addEventListener("click", newHand);
  $("tr-reset").addEventListener("click", () => {
    Object.assign(tr, { score: 0, played: 0, decisions: 0, errors: 0, lost: 0 });
    render();
  });
  const variant = () => variantOf(tr.variant);
  const precision = () => $("tr-precision").value;
  const visibleBoard = (s = tr.street) => tr.board.slice(0, STREET_CARDS[s]);
  const you = (seat) => seat === YOU;
  const verbFor = (seat, base) => (you(seat) ? base : base.endsWith("s") ? base + "es" : base + "s");

  function trLog(text, strong = false) {
    tr.log.unshift({ text, strong });
    if (tr.log.length > 80) tr.log.pop();
  }
  function newHand() {
    clearTimeout(tr.timer);
    tr.token++;
    const mode = $("tr-seat").value;
    tr.btn = mode === "btn" ? YOU : mode === "opp" ? BOT : tr.played % 2 === 0 ? YOU : BOT;
    tr.dropUnit = Number($("tr-drop").value);
    const t = dealTable(2);
    tr.hands = t.hands;
    tr.board = t.board;
    tr.street = 0;
    tr.view = 0;
    tr.cube = { level: 1, owner: null };
    tr.history = {};
    tr.phase = "street";
    tr.pending = null;
    tr.actor = null;
    tr.snapshots = [];
    tr.preview = null;
    tr.decisionsThisHand = [];
    tr.result = null;
    trLog(`New hand (${variant().name}, drop ${tr.dropUnit}). ${NAMES[tr.btn]} ${you(tr.btn) ? "are" : "is"} on the button.`, true);
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
      dropUnit: tr.dropUnit,
      precision: precision(),
      onProgress: (f) => {
        tr.progress = f;
        renderPrompt();
      },
    };
  }
  async function computeStreet() {
    const s = tr.street;
    const token = ++tr.token;
    tr.snapshots[s] = { view: null, cube: { ...tr.cube } };
    tr.progress = null;
    render();
    try {
      const view = await computeView(pool, spec());
      if (token !== tr.token) return;
      tr.progress = null;
      tr.snapshots[s].view = view;
      afterView(view);
    } catch (error) {
      console.error(error);
      $("tr-prompt").textContent = `Computation failed: ${error.message}`;
    }
  }
  const current = () => tr.snapshots[tr.street]?.view ?? null;
  const stage = () => current()?.decision?.stage ?? null;
  const liveNode = () => (tr.phase === "decision" ? 0 : tr.phase === "chain" ? tr.pending.k : null);
  const chooserAt = () => (tr.phase === "decision" ? tr.actor : tr.phase === "chain" ? tr.pending.responder : null);
  function afterView(view) {
    if (tr.phase === "street" && view.decision) {
      tr.phase = "decision";
      tr.actor = view.decision.actor;
    }
    render();
    runBot();
  }
  function runBot() {
    clearTimeout(tr.timer);
    const st = stage();
    const k = liveNode();
    if (!st || k == null) return;
    const chooser = chooserAt();
    const token = tr.token;
    if (chooser === BOT) {
      tr.timer = setTimeout(() => token === tr.token && act(BOT, sampleAction(st, k)), 650);
    } else if ($("tr-peek").checked) {
      tr.preview = { k, grade: gradeHidden(st, k, null), chooser: YOU, level: tr.cube.level, street: tr.street, preview: true, base: st.base };
      render();
    }
  }
  function record(seat, k, chosen) {
    const st = stage();
    const grade = gradeHidden(st, k, chosen);
    if (!grade) return;
    if (seat === YOU) {
      tr.decisions++;
      if (grade.error > 0.005) tr.errors++;
      tr.lost += grade.error;
    }
    tr.preview = null;
    tr.decisionsThisHand.unshift({ k, grade, chooser: seat, level: tr.cube.level, street: tr.street, preview: false, base: st.base });
  }
  // One cube action by `seat`: at node 0 (noDouble/double) or in the chain (drop/take/reraise).
  function act(seat, choice) {
    const st = stage();
    if (!st) return;
    if (tr.phase === "decision") {
      if (seat !== tr.actor) return;
      record(seat, 0, choice);
      const verb = tr.cube.level > 1 ? "redouble" : "double";
      if (choice === "double") {
        tr.pending = offerRaise(tr.cube.level, seat, 1 - seat, tr.dropUnit);
        tr.phase = "chain";
        trLog(`${NAMES[seat]} ${verbFor(seat, verb)} to ${tr.pending.level}.`, true);
      } else {
        // Passing up the option hands it to the opponent for the next cube street.
        tr.cube = { level: tr.cube.level, owner: 1 - seat };
        trLog(`${NAMES[seat]} ${you(seat) ? "do" : "does"} not ${verb}; ${NAMES[1 - seat]} ${you(1 - seat) ? "get" : "gets"} the option next.`);
        resolve();
      }
    } else if (tr.phase === "chain") {
      const pd = tr.pending;
      if (seat !== pd.responder) return;
      record(seat, pd.k, choice);
      if (choice === "drop") {
        trLog(`${NAMES[seat]} ${verbFor(seat, "drop")}.`);
        finish(pd.raiser, pd.drop, `${NAMES[seat].toLowerCase()} dropped at ${pd.level}`);
        return;
      }
      if (choice === "take") {
        tr.cube = { level: pd.level, owner: seat };
        trLog(`${NAMES[seat]} ${verbFor(seat, "take")}. Cube at ${tr.cube.level}, ${NAMES[seat].toLowerCase()} hold${you(seat) ? "" : "s"} it.`);
        tr.pending = null;
        resolve();
      } else {
        if (!canReraise(pd)) return;
        const name = reraiseName(pd.k);
        tr.pending = reraise(pd);
        trLog(`${NAMES[seat]} ${verbFor(seat, name.toLowerCase())} to ${tr.pending.level}!`, true);
      }
    } else return;
    render();
    runBot();
  }
  // The street's cube action is settled; record it and, if hands are now tabled, recompute with perfect information.
  function resolve() {
    tr.history[STREETS[tr.street]] = cubeKey(tr.cube, tr.btn);
    tr.phase = "street";
    tr.pending = null;
    tr.actor = null;
    tr.snapshots[tr.street].cubeAfter = { ...tr.cube };
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
  function finish(winner, points, reason) {
    const net = winner === YOU ? points : -points;
    tr.score += net;
    tr.played++;
    tr.phase = "over";
    tr.pending = null;
    tr.history.ended = true;
    tr.result = { net, reason };
    trLog(`${NAMES[winner]} win${you(winner) ? "" : "s"} ${points} point${points === 1 ? "" : "s"}: ${reason}.`, true);
    refreshTabled();
    render();
  }
  function refreshTabled() {
    const token = ++tr.token;
    computeView(pool, spec())
      .then((view) => {
        if (token !== tr.token) return;
        tr.snapshots[tr.street].view = view;
        render();
      })
      .catch(console.error);
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
    refreshTabled();
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
  function renderPrompt() {
    const prompt = $("tr-prompt");
    if (tr.phase !== "idle" && tr.progress != null && !current()) prompt.textContent = `Solving the equilibrium… ${Math.round(tr.progress * 100)}%`;
  }
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
      else if (view.stats.conditioned) meta.append(el("span", "muted", "Range conditioned on the earlier cube action"));
      if (view.decision) meta.append(spanb("Solve: ", `${view.decision.solve.iterations} it · ±${view.decision.solve.tolerance.toFixed(2)} pts`));
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
    else if (!view) prompt.textContent = tr.progress != null ? `Solving the equilibrium… ${Math.round(tr.progress * 100)}%` : "Computing equities and the equilibrium…";
    else if (tr.phase === "street") {
      prompt.textContent = tr.street === 3 ? "River dealt. Go to showdown." : `${streetName(tr.street)} dealt. No action here.`;
      actions.append(button(tr.street === 3 ? "Showdown" : `Deal ${streetName(tr.street + 1).toLowerCase()}`, "primary", next));
    } else if (tr.phase === "decision") {
      if (tr.actor === YOU) {
        prompt.textContent = `${streetName(tr.street)}: your cube decision at ${level}.`;
        prompt.classList.add("alert");
        actions.append(button(optionLabel("noDouble", 0, level, level, tr.dropUnit), "", () => act(YOU, "noDouble")), button(optionLabel("double", 0, level, level, tr.dropUnit), "primary", () => act(YOU, "double")));
      } else prompt.textContent = `${streetName(tr.street)}: bot is deciding whether to ${verb.toLowerCase()}…`;
    } else if (tr.phase === "chain") {
      const pd = tr.pending;
      const raiseWord = pd.k === 1 ? verb.toLowerCase() : reraiseName(pd.k - 1).toLowerCase();
      if (pd.responder === YOU) {
        prompt.textContent = `Bot ${verbFor(BOT, raiseWord)} to ${pd.level}. Drop (lose ${pd.drop}), take at ${pd.level}${canReraise(pd) ? `, or ${reraiseName(pd.k).toLowerCase()} to ${levelAfter(pd.base, pd.k + 1)}` : ""}?`;
        prompt.classList.add("alert");
        actions.append(button(optionLabel("drop", pd.k, pd.base, pd.base, pd.dropUnit), "", () => act(YOU, "drop")), button(optionLabel("take", pd.k, pd.base, pd.base, pd.dropUnit), "primary", () => act(YOU, "take")));
        if (canReraise(pd)) actions.append(button(optionLabel("reraise", pd.k, pd.base, pd.base, pd.dropUnit), "", () => act(YOU, "reraise")));
      } else prompt.textContent = `You ${raiseWord} to ${pd.level}. Bot is deciding…`;
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
      const kindLabel = sh.k === 0 ? (sh.base > 1 ? "redouble decision" : "double decision") : `reply to the ${sh.k === 1 ? (sh.base > 1 ? "redouble" : "double") : reraiseName(sh.k - 1).toLowerCase()} to ${levelAfter(sh.base, sh.k)}`;
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
  void DROP_UNIT;
  void MAX_CUBE;
}
