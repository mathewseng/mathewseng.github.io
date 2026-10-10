import { createDiceView } from "./dice-view.js";
import { createMatchupSession } from "./matchup-game.mjs";
import { SCORE_RULES, scoreRule, fraction } from "./matchups.mjs";

const pct = (count, total) => `${((count / total) * 100).toFixed(2)}%`;
const signed = (value) =>
  value > 0 ? `+${value}` : String(value).replace("-", "−");
const outcomes = [
  ["wins", "Wins · A"],
  ["ties", "Ties"],
  ["losses", "Losses · B wins"],
];

export function createMatchupPlay(root, { onChange, onCompare }) {
  const options = SCORE_RULES.map(
    (rule) => `<option value="${rule.id}">${rule.name}</option>`,
  ).join("");
  root.innerHTML = `
    <div class="match-section-head"><h3>Play a matchup</h3><button id="match-play-compare" class="match-text-button">Analyze this matchup ↗</button></div>
    <div class="match-play-controls">
      <label>Side A<select id="match-play-a">${options}</select></label>
      <label>Side B<select id="match-play-b">${options}</select></label>
      <label>Add to A<input id="match-play-handicap" type="number" min="-36" max="36" step="0.5" value="0" aria-describedby="match-play-handicap-help" /></label>
    </div>
    <p id="match-play-handicap-help" class="hint">Handicap: −36 to +36 in half-points. Higher score wins.</p>
    <p id="match-play-error" class="error" role="alert" hidden></p>
    <div class="match-play-layout">
      <div class="match-play-arena">
        <div id="match-play-table" class="match-play-table" data-state="ready">
          ${["a", "b"]
            .map(
              (
                side,
              ) => `<section class="match-play-side" aria-label="Side ${side.toUpperCase()}">
            <div class="match-play-side-heading"><span class="eyebrow">SIDE ${side.toUpperCase()}</span><h4 id="match-play-${side}-name"></h4></div>
            <div id="match-play-${side}-dice" class="match-play-dice" role="img" aria-label="Two dice ready to roll"></div>
            <div class="match-play-score"><strong id="match-play-${side}-score">—</strong><span id="match-play-${side}-detail">Ready to roll</span></div>
          </section>`,
            )
            .join("")}
        </div>
        <p id="match-play-result" class="match-play-result" role="status" aria-live="polite">Roll both pairs to begin.</p>
      </div>
      <section class="match-play-session" aria-labelledby="match-play-session-title">
        <div class="match-section-head"><h4 id="match-play-session-title">This matchup · <span id="match-play-rounds">0 rolls</span></h4><button id="match-play-reset" class="match-text-button">Reset counts</button></div>
        <table class="match-play-stats"><caption class="sr-only">Running results from A’s perspective, alongside exact probabilities for this matchup</caption><thead><tr><th scope="col">Result</th><th scope="col">Count</th><th scope="col">Observed</th><th scope="col">Exact</th></tr></thead><tbody>${outcomes.map(([key, label]) => `<tr class="match-play-stat-${key}"><th scope="row">${label}</th><td id="match-play-count-${key}" class="match-play-count">0</td><td id="match-play-observed-${key}">—</td><td><strong id="match-play-exact-${key}"></strong><small id="match-play-fraction-${key}" class="match-exact"></small></td></tr>`).join("")}</tbody></table>
        <div class="match-play-bars"><div><span>Observed</span><div id="match-play-observed-bar" class="match-outcome-bar" role="img"></div></div><div><span>Exact</span><div id="match-play-exact-bar" class="match-outcome-bar" role="img"></div></div></div>
        <p class="hint">Counts stay separate for each matchup and handicap until you reload. Exact odds stay the same on every roll; observed results will vary.</p>
        <details class="match-details"><summary>Recent rolls <span id="match-play-history-count"></span></summary><ol id="match-play-history" class="match-play-history"></ol></details>
      </section>
      <div class="match-play-actions"><button id="match-play-roll">Roll both pairs <span aria-hidden="true">↗</span></button><label>Animation<select id="match-play-speed"><option value="normal">Normal</option><option value="instant">Instant</option></select></label></div>
    </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const sessions = new Map();
  const dice = [
    createDiceView($("match-play-a-dice")),
    createDiceView($("match-play-b-dice")),
  ];
  let session = null,
    key = "",
    busy = false,
    validInput = true;

  function renderBar(id, counts, total) {
    const bar = $(id);
    bar.innerHTML = outcomes
      .map(
        ([name]) =>
          `<span class="match-${name}" style="width:${total ? (counts[name] / total) * 100 : 0}%"></span>`,
      )
      .join("");
    bar.setAttribute(
      "aria-label",
      total
        ? outcomes
            .map(([name, label]) => `${label}: ${pct(counts[name], total)}`)
            .join(", ")
        : "No rolls yet",
    );
  }
  function renderSession() {
    const state = session.state,
      exact = session.probabilities;
    $("match-play-rounds").textContent =
      `${state.rounds.toLocaleString("en-US")} ${state.rounds === 1 ? "roll" : "rolls"}`;
    for (const [name] of outcomes) {
      $("match-play-count-" + name).textContent =
        state[name].toLocaleString("en-US");
      $("match-play-observed-" + name).textContent = state.rounds
        ? pct(state[name], state.rounds)
        : "—";
      $("match-play-exact-" + name).textContent = pct(exact[name], exact.total);
      $("match-play-fraction-" + name).textContent = fraction(
        exact[name],
        exact.total,
      );
    }
    renderBar("match-play-observed-bar", state, state.rounds);
    renderBar("match-play-exact-bar", exact, exact.total);
    $("match-play-history-count").textContent = state.history.length
      ? `(${state.history.length})`
      : "";
    $("match-play-history").innerHTML =
      state.history
        .map(
          (row) =>
            `<li><span>#${row.round}</span><span>A: ${row.aRoll.join(" · ")} → ${row.aScore}<br>B: ${row.bRoll.join(" · ")} → ${row.bScore}</span><strong class="match-${row.outcome}-value">${row.outcome === "wins" ? "A wins" : row.outcome === "losses" ? "B wins" : "Tie"}</strong></li>`,
        )
        .join("") || `<li>No rolls yet.</li>`;
  }
  function renderResult(result) {
    $("match-play-table").dataset.state = result ? "settled" : "ready";
    $("match-play-table").dataset.outcome = result?.outcome || "";
    for (const [i, side] of ["a", "b"].entries()) {
      const values = result ? result[side + "Roll"] : [1, 1];
      dice[i].show(values, null, Boolean(result));
      $("match-play-" + side + "-dice").setAttribute(
        "aria-label",
        result
          ? `Side ${side.toUpperCase()} rolls ${values.join(" and ")}`
          : "Two dice ready to roll",
      );
      $("match-play-" + side + "-score").textContent = result
        ? result[side + "Score"]
        : "—";
      $("match-play-" + side + "-detail").textContent = result
        ? side === "a" && session.rules.handicap
          ? `Rule score ${result.aBase} ${signed(session.rules.handicap)} handicap`
          : `Score from ${values.join(" and ")}`
        : "Ready to roll";
    }
    $("match-play-result").textContent = !result
      ? "Roll both pairs to begin."
      : result.outcome === "ties"
        ? `Tie · both score ${result.aScore}`
        : `${result.outcome === "wins" ? "A wins" : "B wins"} by ${Math.abs(result.aScore - result.bScore)} · ${result.aScore} vs ${result.bScore}`;
    $("match-play-result").dataset.outcome = result?.outcome || "";
  }
  function setBusy(value) {
    busy = value;
    for (const id of [
      "match-play-a",
      "match-play-b",
      "match-play-handicap",
      "match-play-speed",
      "match-play-reset",
    ])
      $(id).disabled = value;
    $("match-play-roll").disabled = value || !validInput;
    $("match-play-roll").textContent = value
      ? "Rolling both pairs…"
      : "Roll both pairs ↗";
    $("match-play-table").setAttribute("aria-busy", String(value));
  }
  function finish() {
    const result = session?.settle();
    if (!result) return;
    renderResult(result); // Also cancels both animation loops.
    renderSession();
    setBusy(false);
  }
  function choose(a, b, handicap) {
    if (busy) return false;
    const nextKey = `${a}:${b}:${handicap}`;
    if (!sessions.has(nextKey))
      sessions.set(nextKey, createMatchupSession({ a, b, handicap }));
    const changed = key !== nextKey;
    key = nextKey;
    session = sessions.get(key);
    $("match-play-a").value = a;
    $("match-play-b").value = b;
    // Preserve the caret while a valid handicap is being typed.
    if (
      document.activeElement !== $("match-play-handicap") ||
      Number($("match-play-handicap").value) !== handicap
    )
      $("match-play-handicap").value = handicap;
    $("match-play-a-name").textContent =
      scoreRule(a).name + (handicap ? ` ${signed(handicap)}` : "");
    $("match-play-b-name").textContent = scoreRule(b).name;
    $("match-play-a-name").title = scoreRule(a).formula;
    $("match-play-b-name").title = scoreRule(b).formula;
    validInput = true;
    $("match-play-error").hidden = true;
    setBusy(false);
    renderSession();
    if (changed) renderResult(session.state.history[0]);
    return true;
  }
  function updateRules() {
    if (busy) return;
    const input = $("match-play-handicap");
    validInput = input.value !== "" && input.checkValidity();
    $("match-play-error").hidden = validInput;
    $("match-play-error").textContent =
      "Enter a handicap from −36 to +36 in half-points. Odds still show the last valid matchup.";
    $("match-play-roll").disabled = !validInput;
    if (validInput)
      onChange(
        $("match-play-a").value,
        $("match-play-b").value,
        Number(input.value),
      );
  }
  ["match-play-a", "match-play-b"].forEach((id) =>
    $(id).addEventListener("change", updateRules),
  );
  $("match-play-handicap").addEventListener("input", updateRules);
  $("match-play-roll").addEventListener("click", () => {
    if (busy || !validInput || !session) return;
    try {
      if (!session.begin()) return;
      setBusy(true);
      $("match-play-error").hidden = true;
      $("match-play-table").dataset.state = "rolling";
      $("match-play-table").dataset.outcome = "";
      $("match-play-result").dataset.outcome = "";
      $("match-play-result").textContent = "Both sides are rolling…";
      for (const side of ["a", "b"]) {
        $("match-play-" + side + "-score").textContent = "—";
        $("match-play-" + side + "-detail").textContent = "Rolling…";
        $("match-play-" + side + "-dice").setAttribute(
          "aria-label",
          `Side ${side.toUpperCase()} is rolling two dice`,
        );
      }
      if (
        $("match-play-speed").value === "instant" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        finish();
      else {
        const roll = session.pendingRoll;
        const completed = new Set();
        dice.forEach((view, index) =>
          view.roll(roll.slice(index * 2, index * 2 + 2), {
            speed: "normal",
            onReveal() {},
            onComplete() {
              completed.add(index);
              if (completed.size === 2) finish();
            },
          }),
        );
      }
    } catch (error) {
      finish();
      setBusy(false);
      $("match-play-error").textContent = error.message;
      $("match-play-error").hidden = false;
    }
  });
  $("match-play-reset").addEventListener("click", () => {
    if (session?.reset()) {
      renderSession();
      renderResult(null);
    }
  });
  $("match-play-compare").addEventListener("click", onCompare);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish();
  });
  return { choose, finish };
}
