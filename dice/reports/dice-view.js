import {
  FACES,
  MESH,
  apply,
  dot,
  orientation,
  facePoint,
} from "./dice-geometry.mjs";

const LIGHT = [0.25, 0.88, 0.4];
const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
const color = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(" ")})`;
const TAU = Math.PI * 2;

function paint(canvas, pose, { waiting, match, settled }) {
  const ctx = canvas.getContext("2d"),
    size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const scale = size * 0.63;
  const project = (point) => {
    const p = apply(pose.view, point);
    return [size / 2 + p[0] * scale, size * 0.5 - p[1] * scale];
  };
  const path = (points) => {
    ctx.beginPath();
    points.forEach((p, i) =>
      i ? ctx.lineTo(...project(p)) : ctx.moveTo(...project(p)),
    );
    ctx.closePath();
  };
  // A convex solid's front-facing patches cannot occlude one another.
  const visible = MESH.filter((patch) => apply(pose.view, patch.normal)[2] > 0);
  ctx.lineWidth = size / 200;
  ctx.lineJoin = "round";
  for (const patch of visible) {
    const normal = apply(pose.world, patch.normal);
    const light = Math.max(0, dot(normal, LIGHT));
    const top = Math.max(0, normal[1]);
    let ivory = mix([133, 141, 147], [254, 247, 224], 0.24 + 0.76 * light);
    // The scored upper face catches the light; lower sides stay quiet.
    if (match && settled) ivory = mix(ivory, [241, 196, 92], top * 0.66);
    ctx.fillStyle = ctx.strokeStyle = color(ivory);
    path(patch.points);
    ctx.fill();
    ctx.stroke();
  }
  if (waiting) return;
  // Recessed pips sit on the physical face, projected with its orientation.
  FACES.forEach((face) => {
    const normal = apply(pose.view, face.n);
    if (normal[2] <= 0.025) return;
    const worldNormal = apply(pose.world, face.n);
    const isTop = settled && worldNormal[1] > 0.99;
    for (const [u, v] of face.pips) {
      const center = facePoint(face, u * 0.22, v * 0.22, 0.501);
      const rim = Array.from({ length: 20 }, (_, i) => {
        const angle = (i / 20) * TAU;
        return center.map(
          (x, axis) =>
            x +
            0.067 *
              (Math.cos(angle) * face.u[axis] + Math.sin(angle) * face.v[axis]),
        );
      });
      path(rim);
      const [x, y] = project(center);
      const fill = ctx.createLinearGradient(
        x,
        y - scale * 0.055,
        x,
        y + scale * 0.055,
      );
      fill.addColorStop(0, isTop ? "#121820" : "#39424a");
      fill.addColorStop(1, isTop ? "#34404c" : "#687079");
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = isTop ? "#ffffef50" : "#ffffff20";
      ctx.lineWidth = size / 180;
      ctx.stroke();
    }
  });
}

export function createDiceView(container) {
  let dice = [],
    frame = 0,
    active = null;
  function draw(die, progress = 1) {
    if (die.element.dataset.state === "waiting") progress = 1;
    const spin = (1 - progress) ** 2;
    const pose = orientation(
      die.face,
      die.yaw,
      -TAU * spin,
      die.direction * Math.PI * 0.8 * spin,
    );
    paint(die.canvas, pose, {
      waiting: die.element.dataset.state === "waiting",
      settled: die.element.dataset.state === "settled",
      match: die.element.classList.contains("match"),
    });
  }
  function resize() {
    for (const die of dice) {
      const size = Math.round(
        die.element.clientWidth * Math.min(devicePixelRatio || 1, 2),
      );
      if (!size || die.canvas.width === size) continue;
      die.canvas.width = die.canvas.height = size;
      draw(die, die.progress);
    }
  }
  new ResizeObserver(resize).observe(container);
  function settleDie(die) {
    die.progress = 1;
    die.element.classList.remove("is-rolling", "is-waiting");
    die.element.dataset.state = "settled";
    die.element.dataset.face = die.face;
    die.value.textContent = die.face;
    die.canvas.style.transform = "none";
    die.shadow.style.transform = "none";
    die.shadow.style.opacity = "";
    draw(die);
  }
  function show(values, matchFace = null, reveal = false) {
    cancelAnimationFrame(frame);
    active = null;
    container.style.setProperty("--dice-count", values.length);
    if (dice.length !== values.length) {
      container.innerHTML = values
        .map(
          () =>
            '<div class="die"><div class="die-shadow"></div><canvas class="die-canvas" aria-hidden="true"></canvas><span class="die-value" aria-hidden="true"></span></div>',
        )
        .join("");
      dice = [...container.children].map((element, i) => ({
        element,
        canvas: element.querySelector("canvas"),
        value: element.querySelector(".die-value"),
        shadow: element.querySelector(".die-shadow"),
        yaw: [-0.3, 0.24, -0.12, 0.4, -0.4, 0.12][i],
        direction: i % 2 ? -1 : 1,
      }));
    }
    dice.forEach((die, i) => {
      die.face = values[i];
      die.element.classList.toggle("match", values[i] === matchFace);
      die.canvas.width = die.canvas.height = Math.max(
        1,
        Math.round(
          die.element.clientWidth * Math.min(devicePixelRatio || 1, 2),
        ),
      );
      settleDie(die);
      if (!reveal) die.value.textContent = "";
    });
  }
  function roll(values, { speed, onReveal, onComplete }) {
    cancelAnimationFrame(frame);
    const duration = speed === "suspense" ? 200 : 460;
    active = { start: performance.now(), next: 0 };
    dice.forEach((die, i) => {
      die.face = values[i];
      die.progress = 0;
      die.yaw =
        [-0.3, 0.24, -0.12, 0.4, -0.4, 0.12][i] + (Math.random() - 0.5) * 0.14;
      die.element.classList.remove("match");
      die.element.classList.add("is-waiting");
      die.element.dataset.state = "waiting";
      delete die.element.dataset.face;
      die.value.textContent = "·";
      draw(die);
    });
    function tick(now) {
      if (!active) return;
      let complete = true;
      for (let i = 0; i < dice.length; i++) {
        const die = dice[i];
        if (die.element.dataset.state === "settled") continue;
        complete = false;
        if (speed === "suspense" && i !== active.next) continue;
        const elapsed =
          now - active.start - (speed === "suspense" ? 0 : i * 12);
        if (elapsed < 0) continue;
        const t = Math.min(1, elapsed / duration);
        if (t === 1) {
          settleDie(die);
          onReveal(i);
          if (speed === "suspense") {
            active.next++;
            active.start = now;
          }
          continue;
        }
        die.element.classList.remove("is-waiting");
        die.element.classList.add("is-rolling");
        die.element.dataset.state = "rolling";
        die.progress = t;
        // A quick throw, two diminishing contacts, then a firm tabletop rest.
        const bounce =
          t < 0.62
            ? Math.sin((t / 0.62) * Math.PI) * 0.27
            : Math.sin(((t - 0.62) / 0.38) * Math.PI) * 0.075;
        const travel = die.direction * 0.15 * (1 - t) ** 2;
        die.canvas.style.transform = `translate(${travel * 100}%, ${-bounce * 100}%)`;
        die.shadow.style.transform = `scale(${1 - bounce})`;
        die.shadow.style.opacity = 0.55 - bounce;
        draw(die, t);
      }
      if (
        complete ||
        dice.every((die) => die.element.dataset.state === "settled")
      ) {
        active = null;
        onComplete();
      } else frame = requestAnimationFrame(tick);
    }
    // Mark the first moving die immediately, then animate on the display clock.
    tick(active.start);
  }
  return { show, roll };
}
