const BOARD = { x: 32, y: 88, width: 928, height: 696, sourceWidth: 560, sourceHeight: 420 };
const CHECKER = ["#74f4ff", "#ffba72"];
const DIE = "#87ecac";
const CUBE = "#fff08c";
const HAND = "#ef8ccc";
const COLUMNS = [81, 115, 152, 187, 222, 256, 316, 350, 386, 421, 456, 491];

async function loadFrames(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Detection data unavailable");
  const bytes = await response.arrayBuffer();
  if (new Uint8Array(bytes, 0, 2)[0] !== 0x1f) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const decoded = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(decoded).json();
}

export function createAudit(player, replayAsset) {
  const canvas = document.querySelector("#detection-overlay");
  const status = document.querySelector("#audit-status");
  const controls = [...document.querySelectorAll("[data-view]")];
  const context = canvas.getContext("2d");
  const cache = new Map();
  const scale = BOARD.width / BOARD.sourceWidth;
  let enabled = false, number = "1", source, frameData, callback, request = 0;

  function draw(time = player.currentTime) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!enabled || !source || player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const frame = Math.floor(time * source.fps + .001);
    const [checkers, dice, cube, hands, stacks = []] = source.frames[frame] ?? [[], [], null, []];
    const x = (value) => BOARD.x + value * scale;
    const y = (value) => BOARD.y + value * BOARD.height / BOARD.sourceHeight;
    context.lineWidth = 2.6;
    for (const [left, top, right, bottom] of hands) {
      context.strokeStyle = HAND;
      context.strokeRect(x(left), y(top), (right - left) * scale, (bottom - top) * scale);
    }
    for (const [cx, cy, side, , recovered] of checkers) {
      context.strokeStyle = CHECKER[side];
      context.setLineDash(recovered ? [3, 3] : []);
      context.beginPath();
      context.arc(x(cx), y(cy), 14 * scale, 0, 2 * Math.PI);
      context.stroke();
    }
    context.setLineDash([]);
    drawContextCheckers(frame, checkers, x, y);
    for (const [point, side, count] of stacks) {
      const top = point <= 12;
      const center = COLUMNS[top ? 12 - point : point - 13];
      const label = `${count}`;
      const left = x(center) - 15;
      const at = y(top ? 58 : 347);
      context.fillStyle = "#10151c";
      context.fillRect(left, at, 30, 26);
      context.strokeStyle = CHECKER[side];
      context.strokeRect(left, at, 30, 26);
      context.font = "bold 21px system-ui";
      context.fillStyle = CHECKER[side];
      context.fillText(label, x(center) - context.measureText(label).width / 2, at + 21);
    }
    // Optional last element: box side in source units (the Nov 21 board's dice and cube sizes).
    for (const [cx, cy, value, candidate, score, size] of dice) {
      mark(x(cx), y(cy), DIE, value ? `${value} · ${score}%` : `${candidate}?`, size && size * scale);
    }
    if (cube) {
      const [cx, cy, face, score, size] = cube;
      mark(x(cx), y(cy), CUBE, `Cube ${face || "?"} · ${score}%`, size && size * scale);
    }
  }

  function drawContextCheckers(frame, checkers, x, y) {
    const state = frameData?.changes.findLast(row => row.frame <= frame);
    const position = frameData?.positions[state?.position];
    if (!["checker-turn", "checker-result-pending"].includes(state?.phase) ||
        !["stable-board-and-bear-off-inventory", "repeated-settled-dice-faces"].includes(position?.source)) return;
    const counts = state.movingPoints ?? position.points;
    context.save();
    context.setLineDash([7, 5]);
    for (const [index, count] of counts.entries()) {
      if (!count) continue;
      const top = index < 12;
      const center = COLUMNS[top ? 11 - index : index - 12];
      const side = Number(count < 0);
      const seen = checkers.filter(([cx, cy, color]) =>
        side === color && Math.abs(center - cx) <= 15 && (cy < 210) === top).length;
      context.strokeStyle = CHECKER[side];
      for (let missing = seen; missing < Math.abs(count); missing++) {
        const slot = 32 + 26 * missing;
        context.beginPath();
        context.arc(x(center), y(top ? slot : BOARD.sourceHeight - slot), 14 * scale, 0, 2 * Math.PI);
        context.stroke();
      }
    }
    context.restore();
  }

  function mark(x, y, color, label, side = 34) {
    const half = side / 2;
    context.strokeStyle = color;
    context.strokeRect(x - half, y - half, side, side);
    context.font = "bold 20px system-ui";
    const w = context.measureText(label).width + 12;
    const left = Math.min(x + half + 1, BOARD.x + BOARD.width - w);
    const top = Math.max(BOARD.y + 1, y - half - 12);
    context.fillStyle = "#10151c";
    context.fillRect(left, top, w, 25);
    context.fillStyle = color;
    context.fillText(label, left + 6, top + 19);
  }

  function updateStatus() {
    if (!enabled) return;
    if (!source) return;
    status.textContent = player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ? "Play to see detections."
      : "White (cyan) · Black (amber) · Dice (green) · Cube (yellow) · Hands (pink) · Camera recovery (dotted) · Reconstructed checker (dashed) · Stack count (numbered)";
  }

  function stopTick() {
    if (callback === undefined) return;
    if (player.cancelVideoFrameCallback) player.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
    callback = undefined;
  }

  function tick() {
    stopTick();
    if (!enabled) return;
    const next = (_, frame) => {
      callback = undefined;
      draw(frame?.mediaTime);
      tick();
    };
    callback = player.requestVideoFrameCallback
      ? player.requestVideoFrameCallback(next)
      : requestAnimationFrame(next);
  }

  async function update() {
    const id = ++request;
    source = undefined;
    canvas.hidden = status.hidden = !enabled;
    draw();
    stopTick();
    if (!enabled) return;
    status.textContent = "Loading detections…";
    const pending = cache.get(number) ?? loadFrames(replayAsset(`audit/game-${number.padStart(2, "0")}.json.gz`));
    const selected = number;
    cache.delete(number);
    cache.set(number, pending);
    if (cache.size > 2) cache.delete(cache.keys().next().value);
    try {
      const loaded = await pending;
      if (id !== request) return;
      source = loaded;
      updateStatus();
      draw();
      tick();
    } catch {
      cache.delete(selected);
      if (id === request) status.textContent = "Detections unavailable for this game.";
    }
  }

  for (const button of controls) {
    button.addEventListener("click", () => {
      const next = button.dataset.view === "vision";
      if (next === enabled) return;
      enabled = next;
      for (const control of controls) {
        control.setAttribute("aria-pressed", String(control === button));
      }
      void update();
    });
  }
  for (const event of ["seeked", "loadeddata", "pause"]) {
    player.addEventListener(event, () => {
      updateStatus();
      draw();
    });
  }
  return {
    setFrameData(data) {
      frameData = data;
      draw();
    },
    select(game) {
      number = game;
      void update();
    },
  };
}
