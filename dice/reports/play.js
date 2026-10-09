import { outcomes, MODES } from "./outcomes.mjs";
import { playableSchedule, createSession } from "./game.mjs";
import { createDiceView } from "./dice-view.js";
import { formatPercentile } from "./percentile.mjs";
import {
  sumPayoutGroups,
  plainSumRule,
  describeSumRule,
  SUM_FAMILIES,
} from "./sum-rules.mjs";
const $ = (id) => document.getElementById(id);
const signed = (v) => `${v > 0 ? "+" : ""}${v}`;
const tone = (v) => (v < 0 ? "negative" : v > 0 ? "positive" : "neutral");
const units = (value, digits = 1) =>
  Math.abs(value) >= 1e9
    ? value.toExponential(2)
    : value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export function createPlay({ onBusy, onBrowse }) {
  const session = createSession();
  const diceView = createDiceView($("dice"));
  let game = null,
    chosenFace = 1,
    choices = [],
    title = "",
    speed = "normal";
  let percentileWorker = null,
    percentileRevision = 0,
    percentileFailed = false;
  function resetPercentile() {
    percentileWorker?.terminate();
    percentileWorker = null;
    percentileFailed = false;
    percentileRevision++;
    $("session-percentile").textContent = "—";
    $("session-percentile").dataset.state = "empty";
    delete $("session-percentile").dataset.rounds;
    $("percentile-detail").textContent =
      "Roll to see how your session compares.";
    $("session-spread").hidden = true;
  }
  function failPercentile() {
    percentileWorker?.terminate();
    percentileWorker = null;
    percentileFailed = true;
    percentileRevision++;
    $("session-percentile").textContent = "Unavailable";
    $("session-percentile").dataset.state = "error";
    $("percentile-detail").textContent =
      "The percentile calculation could not finish. Your PnL is unaffected. Reset PnL to start a fresh comparison.";
    $("session-spread").hidden = true;
  }
  function updatePercentile() {
    if (percentileFailed) return;
    try {
      if (!percentileWorker) {
        const worker = new Worker(
          new URL("./percentile-worker.js", import.meta.url),
          { type: "module" },
        );
        percentileWorker = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== percentileWorker) return;
          if (data.error) {
            failPercentile();
            return;
          }
          if (data.revision !== percentileRevision) return;
          const result = data.result,
            label = formatPercentile(result);
          $("session-percentile").textContent = label;
          $("session-percentile").dataset.state = "ready";
          $("session-percentile").dataset.rounds = String(result.rounds);
          $("percentile-detail").textContent =
            `Session PnL percentile: ${label} after ${result.rounds} ${result.rounds === 1 ? "roll" : "rolls"}.${result.exact ? "" : " Normal estimate."}`;
          $("session-stdev-label").textContent =
            `Std dev · ${result.rounds} ${result.rounds === 1 ? "roll" : "rolls"}`;
          $("session-stdev").textContent = `${units(result.stdev, 2)} units`;
          $("session-zscore").textContent =
            result.zScore === null
              ? "No variation"
              : `${result.zScore > 0 ? "+" : ""}${units(result.zScore, 2)}σ`;
          $("session-expected").textContent =
            `Expected PnL: ${units(result.mean)} units`;
          $("session-sigma-bands").innerHTML = result.bands
            .map(
              (band) =>
                `<tr><th scope="row">±${band.sigma}σ</th><td>${units(band.lower)} to ${units(band.upper)}</td><td>${band.probability.toFixed(1)}%</td></tr>`,
            )
            .join("");
          $("session-possible").textContent =
            `Possible PnL: ${BigInt(result.minimum).toLocaleString("en-US")} to ${BigInt(result.maximum).toLocaleString("en-US")} units`;
          $("session-method").textContent = result.exact
            ? "Probabilities use the full weighted payout distribution; ties count halfway in the percentile."
            : "Normal estimate: this distribution exceeds the calculation budget. Percentile and band probabilities are approximate; standard deviation still uses the actual payout odds.";
          $("session-spread").hidden = false;
        };
        worker.onerror = () => {
          if (worker === percentileWorker) failPercentile();
        };
      }
      $("session-percentile").textContent = "…";
      $("session-percentile").dataset.state = "calculating";
      $("percentile-detail").textContent =
        "Calculating your session percentile…";
      $("session-spread").hidden = true;
      percentileWorker.postMessage({
        revision: ++percentileRevision,
        game: { n: game.n, mode: game.mode, payouts: game.payouts },
        pnl: session.state.pnl,
      });
    } catch {
      failPercentile();
    }
  }
  function renderDice(values, reveal = false) {
    diceView.show(
      values,
      reveal && game.mode === "chosen" ? chosenFace : null,
      reveal,
    );
    $("dice").setAttribute(
      "aria-label",
      reveal ? `Top faces: ${values.join(", ")}` : "Dice ready to roll",
    );
  }
  function renderChoices() {
    $("play-schedule").innerHTML = "";
    choices.forEach((choice, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${choice.title} · ${game.mode === "sum" ? describeSumRule(choice.rule || plainSumRule(game.n, choice.payouts)) : choice.payouts.map(signed).join(" / ")}`;
      option.selected = choice.payouts.join() === game.payouts.join();
      $("play-schedule").append(option);
    });
  }
  function renderPaytable(index = -1) {
    const categories =
      game.mode === "sum"
        ? sumPayoutGroups(game.n, game.payouts)
        : outcomes(game.n, game.mode).map((row, i) => ({
            ...row,
            indices: [i],
            payout: game.payouts[i],
          }));
    $("play-paytable").dataset.mode = game.mode;
    $("play-paytable").innerHTML = categories
      .map(
        (row) =>
          `<div class="paytable-row ${row.indices.includes(index) ? "hit" : ""}" ${row.indices.includes(index) ? 'aria-current="true"' : ""}><span>${row.label}<small>${((row.weight / 6 ** game.n) * 100).toFixed(row.weight / 6 ** game.n < 0.001 ? 4 : 2)}%</small></span><strong class="${tone(row.payout)}">${signed(row.payout)}</strong></div>`,
      )
      .join("");
    if (index >= 0) {
      const container = $("play-paytable"),
        row = container.querySelector('[aria-current="true"]');
      container.scrollTo({
        top: Math.max(
          0,
          row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2,
        ),
        behavior: "instant",
      });
    }
  }
  function setBusy(busy) {
    $("roll-button").disabled = busy || !game;
    $("roll-button").innerHTML = busy
      ? "Rolling…"
      : 'Roll again <span aria-hidden="true">↗</span>';
    $("play-schedule").disabled = busy;
    $("reset-pnl").disabled = busy;
    $("choose-schedule").disabled = busy;
    document
      .querySelectorAll("[data-face-choice], [data-roll-speed]")
      .forEach((el) => (el.disabled = busy));
    onBusy(busy);
  }
  function renderSession() {
    const { pnl, rounds, history } = session.state;
    $("pnl").textContent = signed(pnl);
    $("pnl").className = tone(pnl);
    $("round-count").textContent =
      `${rounds} ${rounds === 1 ? "roll" : "rolls"}`;
    $("roll-history").innerHTML = history
      .map(
        (r) =>
          `<li class="${tone(r.payout)}" title="Roll ${r.round}: ${r.label}; dice ${r.roll.join(", ")}">${signed(r.payout)}</li>`,
      )
      .join("");
  }
  function finish() {
    const result = session.settle();
    if (!result) return;
    renderDice(result.roll, true);
    $("dice-stage").classList.remove("rolling");
    $("dice-stage").dataset.effect = result.effect;
    $("dice-stage").classList.add("landed");
    $("result-label").textContent = result.label;
    $("result-payout").textContent =
      result.payout === 0 ? "Push" : `${signed(result.payout)} units`;
    const effectLabel = {
      loss: "Added to session PnL",
      push: "No profit, no loss",
      win: "A winning roll",
      "big-win": "Big win",
      jackpot: "Top payout!",
    }[result.effect];
    $("result-detail").textContent =
      `${effectLabel} · ${game.mode === "sum" ? `${result.roll.join(" + ")} = ${result.roll.reduce((a, b) => a + b, 0)}` : `Top faces ${result.roll.join(" · ")}`}`;
    $("particles").innerHTML =
      speed !== "instant" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      ["big-win", "jackpot"].includes(result.effect)
        ? Array.from(
            { length: 18 },
            (_, i) =>
              `<i style="--angle:${i * 20}deg;--distance:${90 + (i % 4) * 25}px;--delay:${(i % 3) * 50}ms"></i>`,
          ).join("")
        : "";
    renderPaytable(result.index);
    renderSession();
    updatePercentile();
    setBusy(false);
  }
  function choose(next, nextTitle = "Selected schedule", nextChoices = []) {
    if (session.state.rolling) return false;
    const validated = playableSchedule(next);
    const same =
      game &&
      game.n === validated.n &&
      game.mode === validated.mode &&
      game.payouts.join() === validated.payouts.join();
    game = {
      ...validated,
      rule:
        next.rule ||
        (validated.mode === "sum"
          ? plainSumRule(validated.n, validated.payouts)
          : null),
    };
    title = nextTitle;
    const activeChoice = { payouts: [...game.payouts], title, rule: game.rule },
      isActive = (choice) => choice.payouts.join() === game.payouts.join();
    choices = nextChoices.some(isActive)
      ? nextChoices.map((choice) => (isActive(choice) ? activeChoice : choice))
      : [activeChoice, ...nextChoices];
    $("play-title").textContent =
      `${game.n} ${game.n === 1 ? "die" : "dice"} · ${MODES[game.mode]}`;
    $("play-subtitle").textContent = title;
    $("play-rule").hidden = game.mode !== "sum";
    $("play-rule").textContent = game.rule
      ? `${SUM_FAMILIES[game.rule.family]} · ${describeSumRule(game.rule)}`
      : "";
    $("face-picker").hidden = game.mode !== "chosen";
    renderChoices();
    if (!same) {
      renderDice(Array.from({ length: game.n }, (_, i) => (i % 6) + 1));
      renderPaytable();
      $("dice-stage").dataset.effect = "ready";
      $("dice-stage").classList.remove("landed");
      $("particles").innerHTML = "";
      $("result-label").textContent = "Top faces count";
      $("result-payout").textContent = "Roll the dice";
      $("result-detail").textContent = "Your selected schedule is active.";
    }
    setBusy(false);
    $("roll-button").innerHTML = 'Roll dice <span aria-hidden="true">↗</span>';
    $("play-error").textContent = "";
    return true;
  }
  $("face-buttons").innerHTML = Array.from(
    { length: 6 },
    (_, i) =>
      `<button data-face-choice="${i + 1}" aria-pressed="${i === 0}" aria-label="Choose face ${i + 1}">${i + 1}</button>`,
  ).join("");
  $("face-buttons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-face-choice]");
    if (!button || session.state.rolling) return;
    chosenFace = Number(button.dataset.faceChoice);
    document
      .querySelectorAll("[data-face-choice]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    // A changed choice applies to the next roll; keep the last result intact.
  });
  $("roll-speed").addEventListener("click", (event) => {
    const button = event.target.closest("[data-roll-speed]");
    if (!button || session.state.rolling) return;
    speed = button.dataset.rollSpeed;
    document
      .querySelectorAll("[data-roll-speed]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
  });
  $("roll-button").addEventListener("click", () => {
    if (!game || session.state.rolling) return;
    try {
      if (!session.begin(game, chosenFace)) return;
      setBusy(true);
      $("play-error").textContent = "";
      $("dice-stage").classList.remove("landed");
      $("dice-stage").dataset.effect = "ready";
      $("particles").innerHTML = "";
      $("result-label").textContent = "Dice in motion";
      $("result-payout").textContent = "Rolling…";
      $("result-detail").textContent = "";
      $("dice-stage").classList.add("rolling");
      $("dice").setAttribute("aria-label", "Rolling dice");
      const instant =
        speed === "instant" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("dice-stage").classList.toggle("instant-reveal", instant);
      if (instant) finish();
      else {
        const values = session.pendingRoll;
        diceView.roll(values, {
          speed,
          onReveal(index) {
            if (speed !== "suspense") return;
            $("result-label").textContent =
              `Die ${index + 1} of ${values.length}`;
            $("dice").setAttribute(
              "aria-label",
              `Top faces: ${values.slice(0, index + 1).join(", ")}; remaining dice rolling`,
            );
          },
          onComplete: finish,
        });
      }
    } catch (error) {
      // If presentation fails after sampling, still award the locked roll once.
      finish();
      $("play-error").textContent = error.message;
      setBusy(false);
    }
  });
  function selectChoice(index) {
    const choice = choices[index];
    return choose(
      { ...game, payouts: choice.payouts, rule: choice.rule },
      choice.title,
      choices,
    );
  }
  $("play-schedule").addEventListener("change", () => {
    selectChoice(Number($("play-schedule").value));
  });
  $("reset-pnl").addEventListener("click", () => {
    if (session.reset()) {
      renderSession();
      resetPercentile();
    }
  });
  $("choose-schedule").addEventListener("click", onBrowse);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && session.state.rolling) finish();
  });
  return {
    choose,
    stepSchedule(direction) {
      if (session.state.rolling || !game || choices.length < 2) return false;
      const current = $("play-schedule").selectedIndex,
        next = Math.max(0, Math.min(choices.length - 1, current + direction));
      if (next !== current) selectChoice(next);
      return true;
    },
    get hasGame() {
      return game !== null;
    },
    get busy() {
      return session.state.rolling;
    },
  };
}
