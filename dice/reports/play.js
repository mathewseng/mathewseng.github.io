import { outcomes, MODES } from "./outcomes.mjs";
import { playableSchedule, createSession } from "./game.mjs";
import { createDiceView } from "./dice-view.js";
const $ = (id) => document.getElementById(id);
const signed = (v) => `${v > 0 ? "+" : ""}${v}`;
const tone = (v) => (v < 0 ? "negative" : v > 0 ? "positive" : "neutral");
export function createPlay({ onBusy, onBrowse }) {
  const session = createSession();
  const diceView = createDiceView($("dice"));
  let game = null,
    chosenFace = 1,
    choices = [],
    title = "",
    speed = "normal";
  function renderDice(values, reveal = false) {
    diceView.show(values, reveal && game.mode === "chosen" ? chosenFace : null);
    $("dice").setAttribute(
      "aria-label",
      reveal ? `Rolled ${values.join(", ")}` : "Dice ready to roll",
    );
  }
  function renderChoices() {
    $("play-schedule").innerHTML = "";
    choices.forEach((choice, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${choice.title} · ${choice.payouts.map(signed).join(" / ")}`;
      option.selected = choice.payouts.join() === game.payouts.join();
      $("play-schedule").append(option);
    });
  }
  function renderPaytable(index = -1) {
    $("play-paytable").innerHTML = outcomes(game.n, game.mode)
      .map(
        (row, i) =>
          `<div class="paytable-row ${index === i ? "hit" : ""}" ${index === i ? 'aria-current="true"' : ""}><span>${row.label}<small>${((row.weight / 6 ** game.n) * 100).toFixed(row.weight / 6 ** game.n < 0.001 ? 4 : 2)}%</small></span><strong class="${tone(game.payouts[i])}">${signed(game.payouts[i])}</strong></div>`,
      )
      .join("");
    if (index >= 0) {
      const container = $("play-paytable"),
        row = container.children[index];
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
    $("result-detail").textContent = {
      loss: "Added to session PnL",
      push: "No profit, no loss",
      win: "A winning roll",
      "big-win": "Big win",
      jackpot: "Top payout!",
    }[result.effect];
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
    game = validated;
    title = nextTitle;
    choices = [
      { payouts: [...game.payouts], title },
      ...nextChoices.filter((c) => c.payouts.join() !== game.payouts.join()),
    ];
    $("play-title").textContent = `${game.n} dice · ${MODES[game.mode]}`;
    $("play-subtitle").textContent = title;
    $("face-picker").hidden = game.mode !== "chosen";
    renderChoices();
    if (!same) {
      renderDice(Array.from({ length: game.n }, (_, i) => (i % 6) + 1));
      renderPaytable();
      $("dice-stage").dataset.effect = "ready";
      $("dice-stage").classList.remove("landed");
      $("particles").innerHTML = "";
      $("result-label").textContent = "Ready when you are";
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
              `Revealed ${values.slice(0, index + 1).join(", ")}; remaining dice rolling`,
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
  $("play-schedule").addEventListener("change", () => {
    const choice = choices[Number($("play-schedule").value)];
    const previous = [...choices];
    choose({ ...game, payouts: choice.payouts }, choice.title, previous);
  });
  $("reset-pnl").addEventListener("click", () => {
    if (session.reset()) renderSession();
  });
  $("choose-schedule").addEventListener("click", onBrowse);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && session.state.rolling) finish();
  });
  return {
    choose,
    get hasGame() {
      return game !== null;
    },
    get busy() {
      return session.state.rolling;
    },
  };
}
