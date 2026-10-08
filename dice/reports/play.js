import { outcomes, MODES } from "./outcomes.mjs";
import { playableSchedule, createSession } from "./game.mjs";
const $ = (id) => document.getElementById(id);
const signed = (v) => `${v > 0 ? "+" : ""}${v}`;
const tone = (v) => (v < 0 ? "negative" : v > 0 ? "positive" : "neutral");
const PIPS = [
  [],
  [5],
  [1, 9],
  [1, 5, 9],
  [1, 3, 7, 9],
  [1, 3, 5, 7, 9],
  [1, 3, 4, 6, 7, 9],
];
export function createPlay({ onBusy, onBrowse }) {
  const session = createSession();
  let game = null,
    chosenFace = 1,
    choices = [],
    title = "",
    interval = 0,
    timeout = 0;
  function diceMarkup(values) {
    return values
      .map(
        (face, i) =>
          `<div class="die" style="--i:${i};--tilt:${i % 2 ? 9 : -8}deg" data-face="${face}">${Array.from({ length: 9 }, (_, j) => `<i class="pip ${PIPS[face].includes(j + 1) ? "on" : ""}"></i>`).join("")}</div>`,
      )
      .join("");
  }
  function renderDice(values, reveal = false) {
    $("dice").innerHTML = diceMarkup(values);
    $("dice").style.setProperty("--dice-count", values.length);
    $("dice").setAttribute(
      "aria-label",
      reveal ? `Rolled ${values.join(", ")}` : "Dice ready to roll",
    );
    if (reveal && game.mode === "chosen")
      [...$("dice").children].forEach((el, i) =>
        el.classList.toggle("match", values[i] === chosenFace),
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
      .querySelectorAll("[data-face-choice]")
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
    clearInterval(interval);
    clearTimeout(timeout);
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
      if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        timeout = setTimeout(finish, 50);
      else {
        interval = setInterval(() => {
          // Preserve the die elements so their tumble animation runs through.
          [...$("dice").children].forEach((die) => {
            const face = 1 + Math.floor(Math.random() * 6);
            die.dataset.face = face;
            die.classList.remove("match");
            [...die.children].forEach((pip, i) =>
              pip.classList.toggle("on", PIPS[face].includes(i + 1)),
            );
          });
        }, 110);
        timeout = setTimeout(finish, 1050 + game.n * 45);
      }
    } catch (error) {
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
