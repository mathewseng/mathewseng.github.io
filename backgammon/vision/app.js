// The publisher versions this entry point with the same content hash as
// the replay metadata. Carry it through the module and data requests.
const revision = new URL(import.meta.url).search;
const replayAsset = path => `${path}${revision}`;
const [{ createAudit }, { createHistory }, { createReports }, { createTransport }] = await Promise.all([
  import(`./audit.js${revision}`),
  import(`./history.js${revision}`),
  import(`./reports.js${revision}`),
  import(`./transport.js${revision}`),
]);

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
const audit = createAudit(player, replayAsset);
const transport = createTransport(player, data => audit.setFrameData(data), replayAsset);
function seekDecision(time, focusVideo = true) {
  player.pause();
  transport.seek(time);
  play.hidden = true;
  if (focusVideo) {
    player.focus({ preventScroll: true });
    player.scrollIntoView({ block: "center" });
  }
}
const gameHistory = createHistory(seekDecision, player, replayAsset);
const gameReports = createReports(seekDecision, replayAsset);

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
  player.poster = `posters/game-${id}.jpg`;
  player.src = asset;
  player.preload = "none";
  player.load();
  audit.select(number);
  transport.select(number);
  gameHistory.select(number);
  gameReports.select(number);
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
  play.hidden = true;
});
player.addEventListener("loadeddata", () => {
  if (player.currentTime > 0) play.hidden = true;
});
window.addEventListener("popstate", restoreSelection);
play.hidden = false;
const initial = new URLSearchParams(location.search).get("game");
if (games.has(initial) && initial !== currentGame) selectGame(initial);
else {
  transport.select(currentGame);
  gameHistory.select(currentGame);
  gameReports.select(currentGame);
}
