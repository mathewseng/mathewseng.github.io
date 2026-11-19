const timecode = time => {
  const seconds = Math.max(0, Math.floor(time || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const name = player => player === "white" ? "White" : "Black";

function indexedActions(data) {
  const actions = data.rolls.map(roll => ({
    frame: roll.start, player: roll.player, kind: "roll",
    pickup: roll.pickup, resultFrame: roll.resultFrame,
    label: `${name(roll.player)} rolls ${roll.dice.map(die => die ?? "?").join("–")}`,
  }));
  if (data.cubeOffer) {
    const { start, player, offered } = data.cubeOffer;
    actions.push({ frame: start, player, kind: "cube", face: offered,
      label: `${name(player)} ${offered === 2 ? "doubles" : "redoubles"} to ${offered}` });
  }
  return actions.sort((a, b) => a.frame - b.frame);
}

export function createTransport(player, onData, replayAsset, requestPlayback) {
  const shell = document.querySelector("#replay-shell");
  const transport = shell.querySelector(".replay-transport");
  const markers = document.querySelector("#replay-markers");
  const status = document.querySelector("#replay-action");
  const seek = document.querySelector("#replay-seek");
  const time = document.querySelector("#replay-time");
  const toggle = document.querySelector("#replay-toggle");
  const previous = document.querySelector("#replay-previous");
  const next = document.querySelector("#replay-next");
  const speed = document.querySelector("#replay-speed");
  const mute = document.querySelector("#replay-mute");
  const fullscreen = document.querySelector("#replay-fullscreen");
  let actions = [], index = -1, source, pending, unavailable = false;
  const load = new Map();

  const seekTo = seconds => {
    player.preload = "metadata";
    player.currentTime = seconds;
    synchronize();
  };
  const fps = () => source?.fps ?? 25;
  const cursor = () => Math.round(player.currentTime * fps());
  const activeIndex = () => actions.findLastIndex(action => action.frame <= cursor());
  const nextIndex = () => actions.findIndex(action => action.frame > cursor());
  const jump = direction => {
    const active = activeIndex();
    // From between two ticks, Left returns to the preceding action. From a
    // tick itself it goes to the previous one.
    const preceding = actions[active]?.frame === cursor() ? active - 1 : active;
    const target = actions[direction < 0 ? preceding : nextIndex()];
    if (target) seekTo(target.frame / fps());
  };

  function synchronize() {
    const duration = Number.isFinite(player.duration) ? player.duration : (source?.frames ?? 0) / fps();
    seek.max = duration;
    seek.value = Math.min(player.currentTime, duration);
    seek.disabled = duration === 0;
    seek.setAttribute("aria-valuetext", timecode(player.currentTime));
    const position = duration ? (player.currentTime / duration) * 100 : 0;
    seek.style.setProperty("--replay-progress", `${Math.min(100, position)}%`);
    time.value = `${timecode(player.currentTime)} / ${timecode(duration)}`;
    toggle.textContent = player.paused ? "Play" : "Pause";
    toggle.setAttribute("aria-label", player.paused ? "Play replay" : "Pause replay");
    mute.textContent = player.muted ? "Unmute" : "Mute";
    fullscreen.textContent = document.fullscreenElement === shell ? "Exit full screen" : "Full screen";
    const current = activeIndex();
    const postGame = source?.postGamePlay && cursor() >= source.postGamePlay.frame;
    previous.disabled = current < 0 || (current === 0 && actions[current].frame === cursor());
    next.disabled = nextIndex() < 0;
    const highlighted = postGame ? -1 : current;
    if (highlighted !== index) {
      markers.children[index]?.removeAttribute("aria-current");
      markers.children[highlighted]?.setAttribute("aria-current", "true");
      index = highlighted;
    }
    const action = actions[current];
    const finishingMove = action?.kind === "roll" && action.pickup != null && cursor() >= action.pickup &&
      Number.isInteger(action.resultFrame) && cursor() < action.resultFrame;
    const actionLabel = finishingMove ? `${name(action.player)}’s move` : action?.label;
    const label = postGame ? "Post-game play" : action ? `${actionLabel} · ${current + 1} of ${actions.length}` :
      actions.length ? `${actions.length} actions` : unavailable ? "Action timeline unavailable" :
        source ? "No recorded actions" : "Loading actions…";
    if (status.textContent !== label) status.textContent = label;
    status.dataset.player = postGame ? "" : action?.player ?? "";
  }

  function drawMarkers() {
    index = -1;
    const rolls = actions.filter(action => action.kind === "roll");
    let rollIndex = 0;
    markers.replaceChildren(...actions.map(action => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.dataset.kind = action.kind;
      marker.dataset.player = action.player;
      marker.style.left = `${action.frame * 100 / source.frames}%`;
      if (action.kind === "roll") {
        const left = rolls[rollIndex - 1]?.frame ?? action.frame - source.frames;
        const right = rolls[rollIndex + 1]?.frame ?? action.frame + source.frames;
        const gap = Math.min(action.frame - left, right - action.frame);
        marker.style.setProperty("--marker-gap", `${gap * 100 / source.frames}%`);
        rollIndex++;
      }
      const label = `${timecode(action.frame / fps())} · ${action.label}`;
      marker.title = label;
      marker.setAttribute("aria-label", label);
      if (action.face) marker.textContent = action.face;
      marker.addEventListener("click", () => seekTo(action.frame / fps()));
      return marker;
    }));
    synchronize();
  }

  const togglePlayback = () => {
    if (player.paused) void requestPlayback();
    else player.pause();
  };
  toggle.addEventListener("click", togglePlayback);
  previous.addEventListener("click", () => jump(-1));
  next.addEventListener("click", () => jump(1));
  for (const node of [previous, next]) node.setAttribute("aria-keyshortcuts", node === previous ? "ArrowLeft" : "ArrowRight");
  seek.addEventListener("input", () => seekTo(Number(seek.value)));
  speed.addEventListener("change", () => {
    player.defaultPlaybackRate = player.playbackRate = Number(speed.value);
  });
  mute.addEventListener("click", () => { player.muted = !player.muted; });
  fullscreen.addEventListener("click", () => {
    if (document.fullscreenElement === shell) void document.exitFullscreen();
    else if (shell.requestFullscreen) void shell.requestFullscreen().catch(() => {});
    else player.webkitEnterFullscreen?.();
  });
  fullscreen.hidden = !shell.requestFullscreen && !player.webkitEnterFullscreen;
  for (const event of ["timeupdate", "loadedmetadata", "play", "pause", "seeking", "seeked", "volumechange", "ended", "error"]) {
    player.addEventListener(event, synchronize);
  }
  document.addEventListener("fullscreenchange", synchronize);
  window.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        document.querySelector("dialog[open]") || event.target.closest?.("select, textarea, input:not([type=range]), [contenteditable], [role=tab]")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (!actions.length) return;
      event.preventDefault();
      jump(event.key === "ArrowLeft" ? -1 : 1);
    } else if ((event.key === " " && event.target === player) || (event.key.toLowerCase() === "k" && !event.repeat)) {
      event.preventDefault();
      togglePlayback();
    }
  });
  player.controls = false;
  transport.hidden = false;

  return {
    seek: seekTo,
    async select(game) {
      pending?.abort();
      const request = pending = new AbortController();
      source = null;
      actions = [];
      unavailable = false;
      onData(null);
      drawMarkers();
      try {
        const data = load.get(game) ?? await fetch(replayAsset(`state/game-${game.padStart(2, "0")}.json`), {
          signal: request.signal,
        }).then(response => {
          if (!response.ok) throw new Error("Action timeline unavailable");
          return response.json();
        });
        if (request.signal.aborted) return;
        load.set(game, data);
        source = data;
        actions = indexedActions(data);
        onData(data);
        drawMarkers();
      } catch {
        if (request.signal.aborted) return;
        unavailable = true;
        synchronize();
      }
    },
  };
}
