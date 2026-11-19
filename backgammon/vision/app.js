import { createAudit } from "./audit.js";
import { createHistory } from "./history.js";

const player = document.querySelector("#replay");
const play = document.querySelector("#play-replay");
const title = document.querySelector("#selected-game");
const download = document.querySelector("#download-replay");
const note = document.querySelector("#game-note");
const error = document.querySelector("#playback-error");
const games = new Map(
  [...document.querySelectorAll("[data-game]")].map((link) => [link.dataset.game, link]),
);
const release = new URL("./", download.href);
let currentGame = "1";
const audit = createAudit(player);
const gameHistory = createHistory((time) => {
  player.pause();
  player.preload = "metadata";
  player.currentTime = time;
  player.controls = true;
  play.hidden = true;
  player.focus({ preventScroll: true });
  player.scrollIntoView({ block: "center" });
});

function selectGame(number) {
  if (!games.has(number)) number = "1";
  if (number === currentGame) return;

  const id = number.padStart(2, "0");
  const nextGame = games.get(number);
  games.get(currentGame).removeAttribute("aria-current");
  nextGame.setAttribute("aria-current", "true");
  currentGame = number;
  const label = `Game ${number}`;
  const asset = new URL(`game-${id}-analysis.mp4`, release);
  title.textContent = label;
  play.setAttribute("aria-label", `Play ${label}`);
  note.textContent = nextGame.dataset.note ?? "";
  note.hidden = !note.textContent;
  download.href = asset;
  error.hidden = true;
  player.controls = false;
  player.poster = `posters/game-${id}.jpg`;
  player.src = asset;
  player.preload = "none";
  player.load();
  audit.select(number);
  gameHistory.select(number);
  play.hidden = false;
}

function restoreSelection() {
  selectGame(new URLSearchParams(location.search).get("game"));
}

for (const [number, link] of games) {
  link.addEventListener("click", (event) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (number === currentGame) return;
    const url = new URL(location.href);
    url.searchParams.set("game", number);
    history.pushState(null, "", url);
    selectGame(number);
  });
}

play.addEventListener("click", () => {
  player.controls = true;
  player.play().catch(() => {
    if (player.error) error.hidden = false;
  });
});
player.addEventListener("play", () => {
  if (document.activeElement === play) player.focus();
  play.hidden = true;
});
player.addEventListener("ended", () => { play.hidden = false; });
player.addEventListener("error", () => {
  error.hidden = false;
  player.controls = false;
  play.hidden = true;
});
window.addEventListener("popstate", restoreSelection);
player.controls = false;
play.hidden = false;
restoreSelection();
gameHistory.select(currentGame);
