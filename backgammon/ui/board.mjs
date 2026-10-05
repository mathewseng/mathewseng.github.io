// SPDX-License-Identifier: GPL-3.0-or-later
import { playerName, distance, applyStep } from "../core/rules.mjs";
import { reducedMotion, checkerFlight } from "./motion.mjs";
import { sound } from "./sound.mjs";
import { boardColor } from "../core/appearance.mjs";
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
export function pointGeometry(point, orientation = 0) {
  const p = orientation ? 23 - point : point,
    top = p >= 12,
    col = top ? p - 12 : 11 - p;
  return { x: 24 + col * 60 + (col >= 6 ? 48 : 0), y: top ? 34 : 388, top };
}
// Pointer coordinates are transformed into SVG space before testing these
// non-overlapping regions. Letterboxing and orientation never change the rules.
export function pointAt(x, y, orientation = 0) {
  for (let p = 0; p < 24; p++) {
    const g = pointGeometry(p, orientation);
    if (
      x >= g.x &&
      x < g.x + 60 &&
      y >= (g.top ? 28 : 366) &&
      y < (g.top ? 294 : 632)
    )
      return p;
  }
  for (const p of [0, 1]) {
    const top = p !== orientation;
    if (x >= 385 && x < 431 && y >= (top ? 32 : 387) && y < (top ? 277 : 632))
      return `bar${p}`;
    if (x >= 820 && x < 866 && y >= (top ? 35 : 386) && y < (top ? 274 : 625))
      return `off${p}`;
  }
  return null;
}
export function checkerPosition(s, point, player, orientation = 0) {
  if (point === "bar") return { x: 408, y: player !== orientation ? 100 : 506 };
  if (point === "off") return { x: 843, y: player !== orientation ? 84 : 582 };
  const g = pointGeometry(point, orientation),
    n = Math.max(1, Math.abs(s.points[point]));
  return {
    x: g.x + 30,
    y: g.top ? 65 + (Math.min(n, 5) - 1) * 47 : 595 - (Math.min(n, 5) - 1) * 47,
  };
}
function patternOverlay(node, role) {
  const overlay = node.cloneNode(false);
  overlay.removeAttribute("class");
  overlay.setAttribute("fill", `var(--pattern-${role}, transparent)`);
  overlay.setAttribute("stroke", "none");
  overlay.setAttribute("pointer-events", "none");
  overlay.setAttribute("data-pattern", role);
  return overlay;
}
function checker(x, y, p, count = 1, compact = false) {
  const g = svg("g", {
    class: "checker",
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: 24,
      fill: boardColor(`checker${p}`),
      stroke: boardColor(`rim${p}`),
      "stroke-width": 2,
    }),
  );
  g.append(patternOverlay(g.firstChild, `checker${p}`));
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: 18,
      fill: "none",
      stroke: boardColor(`detail${p}`),
      "stroke-width": 1.5,
    }),
  );
  if (count > 1)
    g.append(
      svg(
        "text",
        {
          x,
          y: y + 7,
          "text-anchor": "middle",
          fill: boardColor(`count${p}`),
          "font-size": compact ? 30 : 22,
          "font-weight": 700,
        },
        count,
      ),
    );
  return g;
}
export class Board {
  constructor(container, onPoint = () => {}) {
    this.container = container;
    this.onPoint = onPoint;
    this.svg = svg("svg", {
      viewBox: "0 0 876 660",
      class: "bg-board",
      role: "group",
      "aria-label": "Backgammon board",
    });
    container.replaceChildren(this.svg);
    this.animations = [];
    this.feedbackTimers = [];
    this.lifecycle = new AbortController();
    const listen = { signal: this.lifecycle.signal };
    const settle = () => {
      if (this.playbackTimer && this.playbackFinal) {
        const { state, options } = this.playbackFinal;
        this.render(state, options);
      } else this.cancelAnimations();
    };
    addEventListener(
      "bg-motion",
      () => {
        if (reducedMotion()) settle();
      },
      listen,
    );
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => {
        if (reducedMotion()) settle();
      },
      listen,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) settle();
      },
      listen,
    );
    this.svg.addEventListener("click", (e) => {
      if (
        performance.now() < (this.suppressClickUntil || 0) ||
        !this.options?.interactive
      )
        return;
      const die = e.target.closest("[data-die]");
      if (die && die.getAttribute("role") === "button") {
        this.renderOptions.chooseDie?.(Number(die.dataset.die));
        return;
      }
      const p = e.target.closest("[data-point]");
      if (p) this.onPoint(this.decode(p.dataset.point));
    });
    this.svg.addEventListener("pointerdown", (e) => {
      this.suppressClickUntil = 0;
      if (e.button !== 0 || !e.isPrimary || !this.options?.interactive) return;
      const p = e.target.closest("[data-point]");
      if (!p?.classList.contains("movable")) return;
      this.pointer = {
        id: e.pointerId,
        raw: this.decode(p.dataset.point),
        x: e.clientX,
        y: e.clientY,
        touch: e.pointerType === "touch",
        dragging: false,
      };
    });
    this.svg.addEventListener("pointermove", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6)
        return;
      if (!p.dragging) {
        if (!this.onDragStart?.(p.raw)) {
          this.pointer = null;
          return;
        }
        p.dragging = true;
        this.svg.setPointerCapture(e.pointerId);
        this.svg.classList.add("is-dragging");
        this.dragGhost = checker(0, 0, this.state.turn);
        this.dragGhost.classList.add("drag-checker");
        this.svg.append(this.dragGhost);
        this.svg
          .querySelector(`[data-point="${p.raw}"] .checker:last-of-type`)
          ?.classList.add("drag-origin");
      }
      e.preventDefault();
      const position = this.coordinates(e.clientX, e.clientY);
      const scale = this.svg.getScreenCTM().a;
      this.dragPosition = {
        x: position.x,
        y: position.y - (p.touch ? 28 / scale : 0),
      };
      this.dragGhost.setAttribute(
        "transform",
        `translate(${this.dragPosition.x} ${this.dragPosition.y})`,
      );
      this.svg
        .querySelectorAll(".drop-hover")
        .forEach((node) => node.classList.remove("drop-hover"));
      const target = pointAt(position.x, position.y, this.options.orientation);
      this.svg
        .querySelector(`[data-point="${target}"]`)
        ?.classList.add("drop-hover");
    });
    this.svg.addEventListener("pointerup", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (p.dragging) {
        const pos = this.coordinates(e.clientX, e.clientY),
          target = pointAt(pos.x, pos.y, this.options.orientation);
        const origin = this.dragPosition;
        this.endDrag();
        this.dropOrigin = origin;
        this.onDrop?.(p.raw, target);
        this.dropOrigin = null;
      } else this.pointer = null;
    });
    for (const event of ["pointercancel", "lostpointercapture"])
      this.svg.addEventListener(event, () => {
        const dragging = this.pointer?.dragging;
        this.endDrag();
        if (dragging) this.onCancel?.();
      });
    this.svg.addEventListener("focusin", (e) => {
      const p = e.target.closest("[data-point]");
      if (p)
        this.svg
          .querySelectorAll("[data-point]")
          .forEach((n) => n.setAttribute("tabindex", n === p ? "0" : "-1"));
    });
    this.svg.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.endDrag();
        this.onCancel?.();
        return;
      }
      if (!this.options?.interactive) return;
      const die = e.target.closest("[data-die]");
      if (
        die &&
        ["Enter", " "].includes(e.key) &&
        die.getAttribute("role") === "button"
      ) {
        e.preventDefault();
        this.renderOptions.chooseDie?.(Number(die.dataset.die));
        return;
      }
      const point = e.target.closest("[data-point]");
      if (!point) return;
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        this.onPoint(this.decode(point.dataset.point));
      } else if (
        ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const center = (node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        };
        const origin = center(point),
          horizontal = ["ArrowLeft", "ArrowRight"].includes(e.key),
          direction = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1;
        const next = [...this.svg.querySelectorAll("[data-point]")]
          .map((node) => {
            const p = center(node),
              along = horizontal ? p.x - origin.x : p.y - origin.y,
              across = horizontal ? p.y - origin.y : p.x - origin.x;
            return {
              node,
              along: along * direction,
              cost: Math.abs(along) + Math.abs(across) * 4,
            };
          })
          .filter((p) => p.along > 1)
          .sort((a, b) => a.cost - b.cost)[0];
        next?.node.focus();
      }
    });
  }
  decode(p) {
    return /^\d+$/.test(p) ? Number(p) : p;
  }
  dice(
    s,
    {
      orientation,
      usedDice,
      chooseDie,
      preferredDie,
      hideDice,
      interactive,
      preview,
    },
  ) {
    const group = svg("g", {
      class: "board-dice",
      "aria-label": "Rolled dice",
      ...(this.container.id === "board" ? { id: "dice" } : {}),
    });
    if (hideDice || !s.dice.length) {
      group.setAttribute("display", "none");
      return group;
    }
    const values = s.dice[0] === s.dice[1] ? Array(4).fill(s.dice[0]) : s.dice;
    const used = [...usedDice],
      center = s.turn === orientation ? 610 : 204;
    const pips = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };
    values.forEach((value, i) => {
      const consumed = used.includes(value);
      if (consumed) used.splice(used.indexOf(value), 1);
      const clickable =
        interactive && chooseDie && !consumed && values.length === 2;
      const x = center + (i - (values.length - 1) / 2) * 82;
      const die = svg("g", {
        transform: `translate(${x} 330)`,
        "data-die": value,
        class: `board-die${consumed ? " consumed" : ""}${preferredDie === value && clickable ? " preferred" : ""}`,
        role: clickable ? "button" : "img",
        "aria-label": `${clickable ? "Prefer die " : "Die "}${value}${consumed ? ", used" : ", available"}`,
        ...(clickable
          ? { tabindex: 0, "aria-pressed": preferredDie === value }
          : {}),
      });
      const face = svg("rect", {
        x: -36,
        y: -36,
        width: 72,
        height: 72,
        rx: 11,
        fill: boardColor(`die${s.turn}`),
        stroke: boardColor(`dieBorder${s.turn}`),
        "stroke-width": 2,
      });
      const body = svg("g", { class: "board-die-face" });
      body.append(face, patternOverlay(face, `die${s.turn}`));
      for (const pip of pips[value])
        body.append(
          svg("circle", {
            cx: ((pip % 3) - 1) * 21,
            cy: (Math.floor(pip / 3) - 1) * 21,
            r: value === 1 ? 9 : 7.3,
            fill: boardColor(`pips${s.turn}`),
            "pointer-events": "none",
          }),
        );
      if (consumed)
        body.append(
          svg("path", {
            d: "M21 28l6 6 13-17",
            stroke: boardColor("selection"),
            fill: "none",
            "stroke-width": 6,
            "stroke-linecap": "round",
            "pointer-events": "none",
          }),
        );
      die.append(body);
      group.append(die);
    });
    return group;
  }
  coordinates(x, y) {
    return new DOMPoint(x, y).matrixTransform(
      this.svg.getScreenCTM().inverse(),
    );
  }
  endDrag() {
    const p = this.pointer;
    this.pointer = null;
    if (p?.dragging) this.suppressClickUntil = performance.now() + 400;
    if (p && this.svg.hasPointerCapture(p.id))
      this.svg.releasePointerCapture(p.id);
    this.dragGhost?.remove();
    this.dragGhost = null;
    this.dragPosition = null;
    this.svg
      .querySelectorAll(".drag-origin")
      .forEach((n) => n.classList.remove("drag-origin"));
    this.svg.classList.remove("is-dragging");
    this.svg
      .querySelectorAll(".drop-hover")
      .forEach((n) => n.classList.remove("drop-hover"));
  }
  cancelAnimations() {
    this.feedbackTimers.forEach(clearTimeout);
    this.feedbackTimers = [];
    this.animations?.forEach((a) => a.cancel());
    this.animations = [];
    this.svg
      .querySelectorAll(".moving-checker,.landing-contact")
      .forEach((n) => n.remove());
    this.svg.querySelectorAll("[data-arriving]").forEach((n) => {
      n.style.opacity = "";
      n.removeAttribute("data-arriving");
    });
  }
  destroy() {
    this.lifecycle.abort();
    this.endDrag();
    clearTimeout(this.playbackTimer);
    this.cancelAnimations();
  }
  playTurn(before, steps) {
    if (!steps.length) return;
    if (reducedMotion() || document.hidden) {
      const after = steps.reduce((s, step) => applyStep(s, step), before);
      sound.play(
        after.bar[1 - before.turn] > before.bar[1 - before.turn]
          ? "hit"
          : steps.some((st) => st.to === "off")
            ? "off"
            : "move",
      );
      return;
    }
    clearTimeout(this.playbackTimer);
    const final = this.state,
      options = this.renderOptions;
    this.playbackFinal = { state: final, options };
    let current = before,
      index = 0;
    const advance = () => {
      if (index === steps.length) {
        this.playbackTimer = null;
        this.playbackFinal = null;
        this.render(final, { ...options, playback: true });
        return;
      }
      const step = steps[index++],
        after = applyStep(current, step);
      this.render(after, {
        ...options,
        interactive: false,
        selected: null,
        sources: [],
        destinations: [],
        moves: [],
        playback: true,
      });
      const duration = this.animateMove(current, after, step);
      current = after;
      this.playbackTimer = setTimeout(advance, duration + 25);
    };
    advance();
  }
  animateMove(before, after, step, reverse = false, route = [step]) {
    const cue = reverse
      ? "undo"
      : after.bar[1 - before.turn] > before.bar[1 - before.turn]
        ? "hit"
        : step.to === "off"
          ? "off"
          : "move";
    if (reducedMotion() || document.hidden) {
      sound.play(cue);
      return 0;
    }
    const p = before.turn,
      from = reverse ? step.to : step.from,
      to = reverse ? step.from : step.to;
    let interim = before;
    const via =
      !reverse && route.length > 1
        ? route.slice(0, -1).map((st) => {
            interim = applyStep(interim, st);
            return checkerPosition(interim, st.to, p, this.options.orientation);
          })
        : [];
    const flight = this.flyChecker(
      (!reverse && this.dropOrigin) ||
        checkerPosition(before, from, p, this.options.orientation),
      checkerPosition(after, to, p, this.options.orientation),
      p,
      to,
      { via },
    );
    if (reverse)
      this.feedbackTimers.push(
        setTimeout(() => sound.play("undo"), flight.landings.at(-1)),
      );
    else {
      let current = before;
      route.forEach((st, i) => {
        const next = applyStep(current, st);
        const name =
          next.bar[1 - p] > current.bar[1 - p]
            ? "hit"
            : st.to === "off"
              ? "off"
              : "move";
        this.feedbackTimers.push(
          setTimeout(() => sound.play(name), flight.landings[i]),
        );
        current = next;
      });
    }
    if (!reverse && route.length > 1) {
      let current = before;
      for (const [index, st] of route.entries()) {
        const next = applyStep(current, st);
        if (next.bar[1 - p] > current.bar[1 - p])
          this.flyChecker(
            checkerPosition(current, st.to, 1 - p, this.options.orientation),
            checkerPosition(next, "bar", 1 - p, this.options.orientation),
            1 - p,
            "bar",
            { delay: Math.max(0, flight.landings[index] - 35) },
          );
        current = next;
      }
    } else if (before.bar[1 - p] !== after.bar[1 - p]) {
      const source = reverse ? "bar" : step.to,
        dest = reverse ? step.to : "bar";
      this.flyChecker(
        checkerPosition(before, source, 1 - p, this.options.orientation),
        checkerPosition(after, dest, 1 - p, this.options.orientation),
        1 - p,
        dest,
        { delay: reverse ? 0 : Math.max(0, flight.landings[0] - 35) },
      );
    }
    return flight.duration + (after.bar[1 - p] > before.bar[1 - p] ? 210 : 0);
  }
  flyChecker(
    origin,
    destination,
    player,
    target,
    { via = [], delay = 0 } = {},
  ) {
    const piece = checker(0, 0, player);
    piece.classList.add("moving-checker");
    const raw = typeof target === "number" ? target : `${target}${player}`;
    const candidates = [
      ...this.svg.querySelectorAll(`[data-point="${raw}"] .checker`),
    ];
    const landed =
      candidates.find(
        (node) =>
          Number(node.firstChild.getAttribute("cx")) === destination.x &&
          Number(node.firstChild.getAttribute("cy")) === destination.y,
      ) || candidates.at(-1);
    if (landed) {
      landed.style.opacity = "0";
      landed.dataset.arriving = Number(landed.dataset.arriving || 0) + 1;
    }
    this.svg.append(piece);
    const flight = checkerFlight([origin, ...via, destination]);
    if (target === "off") {
      flight.frames[0].opacity = 1;
      flight.frames.at(-1).opacity = 0;
    }
    const animation = piece.animate(flight.frames, {
      duration: flight.duration,
      delay,
      fill: "both",
      easing: "linear",
    });
    this.animations.push(animation);
    animation.finished
      .then(() => {
        piece.remove();
        animation.cancel();
        if (landed && Number(landed.dataset.arriving) <= 1) {
          landed.style.opacity = "";
          landed.removeAttribute("data-arriving");
        } else if (landed)
          landed.dataset.arriving = Number(landed.dataset.arriving) - 1;
        this.contact(destination);
      })
      .catch(() => {});
    return flight;
  }
  contact(position) {
    if (reducedMotion() || document.hidden) return;
    const ring = svg("circle", {
      cx: position.x,
      cy: position.y,
      r: 27,
      class: "landing-contact",
      "pointer-events": "none",
      "aria-hidden": "true",
    });
    this.svg.append(ring);
    const animation = ring.animate([{ opacity: 0.65 }, { opacity: 0 }], {
      duration: 170,
      easing: "ease-out",
    });
    this.animations.push(animation);
    animation.finished.then(() => ring.remove()).catch(() => {});
  }
  animateRestore(before, after, cue = "reset") {
    sound.play(cue);
    if (reducedMotion() || document.hidden) return;
    for (const player of [0, 1]) {
      const origins = [],
        destinations = [];
      const count = (s, point) =>
        typeof point === "number"
          ? Math.max(0, s.points[point] * (player ? -1 : 1))
          : s[point][player];
      const pose = (s, point, n) => {
        const display = { ...s, points: [...s.points] };
        if (typeof point === "number")
          display.points[point] = n * (player ? -1 : 1);
        return {
          ...checkerPosition(display, point, player, this.options.orientation),
          point,
        };
      };
      for (const point of [...Array(24).keys(), "bar", "off"]) {
        const a = count(before, point),
          b = count(after, point);
        for (let i = b; i < a; i++) origins.push(pose(before, point, i + 1));
        for (let i = a; i < b; i++)
          destinations.push(pose(after, point, i + 1));
      }
      // Pair nearby changes for a concise reset. This does not choose game moves.
      for (const dest of destinations) {
        origins.sort(
          (a, b) =>
            Math.hypot(a.x - dest.x, a.y - dest.y) -
            Math.hypot(b.x - dest.x, b.y - dest.y),
        );
        const origin = origins.shift();
        if (origin) this.flyChecker(origin, dest, player, dest.point);
      }
    }
  }
  returnDragged(point) {
    if (!this.dropOrigin || reducedMotion() || document.hidden) return;
    this.flyChecker(
      this.dropOrigin,
      checkerPosition(
        this.state,
        point,
        this.state.turn,
        this.options.orientation,
      ),
      this.state.turn,
      point,
    );
  }
  animateDice() {
    sound.play("roll");
    if (reducedMotion() || document.hidden) return;
    this.svg.querySelectorAll(".board-die").forEach((die, i) => {
      // The outer SVG transform fixes the die's location. Animate the face inside
      // it, preserving focus/hit targets and displaying only the committed value.
      const face = die.querySelector(".board-die-face");
      const sign = i % 2 ? 1 : -1;
      const animation = face.animate(
        [
          {
            transform: `translate(${sign * 24}px,-9px) rotate(${sign * 32}deg) scale(.86)`,
            opacity: 0.5,
          },
          {
            transform: `translate(${-sign * 3}px,2px) rotate(${-sign * 7}deg) scale(1.04)`,
            opacity: 1,
            offset: 0.68,
          },
          { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 },
        ],
        {
          duration: 340,
          delay: i * 30,
          easing: "cubic-bezier(.2,.75,.3,1)",
          fill: "backwards",
        },
      );
      this.animations.push(animation);
    });
  }
  animateCube(before) {
    sound.play("cube");
    if (reducedMotion() || document.hidden) return;
    const cube = this.svg.querySelector(".board-cube");
    if (!cube) return;
    const cy = (s) =>
      s.cube.owner === null
        ? 330
        : s.cube.owner === this.options.orientation
          ? 432
          : 228;
    const offset = cy(before) - cy(this.state);
    const animation = cube.animate(
      [
        { transform: `translateY(${offset}px) scale(.9)`, opacity: 0.65 },
        { transform: "translateY(0) scale(1.12)", opacity: 1, offset: 0.68 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ],
      { duration: 280, easing: "cubic-bezier(.2,.7,.25,1)" },
    );
    this.animations.push(animation);
  }
  render(
    s,
    {
      orientation = 0,
      numbers = true,
      selected = null,
      destinations = [],
      sources = [],
      moves = [],
      interactive = true,
      preview = false,
      editor = false,
      playback = false,
      usedDice = [],
      chooseDie = null,
      preferredDie = null,
      hideDice = false,
    } = {},
  ) {
    if (!playback) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
      this.playbackFinal = null;
    }
    this.cancelAnimations();
    if (this.options?.orientation !== orientation || !interactive)
      this.endDrag();
    const previousSelected = this.renderOptions?.selected;
    this.state = s;
    this.options = { orientation, interactive };
    this.renderOptions = {
      orientation,
      numbers,
      selected,
      destinations,
      sources,
      moves,
      interactive,
      preview,
      editor,
      usedDice,
      chooseDie,
      preferredDie,
      hideDice,
    };
    this.svg.classList.toggle("has-moves", interactive && sources.length > 0);
    const compact = this.container.clientWidth < 600;
    const focused = this.svg.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focus = focused?.dataset.point,
      focusedDie = focused?.dataset.die;
    const children = [
      svg("rect", {
        x: 1,
        y: 1,
        width: 874,
        height: 658,
        rx: 15,
        fill: boardColor("frame"),
        stroke: boardColor("border"),
        "stroke-width": 2,
      }),
      svg("rect", {
        x: 18,
        y: 28,
        width: 780,
        height: 604,
        rx: 5,
        fill: boardColor("surface"),
      }),
      svg("path", {
        d: "M408 28V632",
        stroke: boardColor("bar"),
        "stroke-width": 40,
      }),
      svg("path", { d: "M813 28V632", stroke: boardColor("border") }),
    ];
    children.splice(2, 0, patternOverlay(children[1], "surface"));
    children.splice(1, 0, patternOverlay(children[0], "frame"));
    children.push(
      svg("rect", {
        x: 388,
        y: 28,
        width: 40,
        height: 604,
        fill: "var(--pattern-bar, transparent)",
        "pointer-events": "none",
        "data-pattern": "bar",
      }),
    );
    for (let p = 0; p < 24; p++) {
      const { x, y, top } = pointGeometry(p, orientation),
        v = s.points[p],
        n = Math.abs(v);
      const label = `Point ${distance(p, orientation)}, ${n ? `${n} ${playerName(v > 0 ? 0 : 1)} checkers` : "empty"}${sources.includes(p) ? ", movable" : ""}${
        destinations.includes(p)
          ? ", legal destination, dice " +
            moves
              .filter((m) => m.to === p)
              .map((m) =>
                m.undo
                  ? "move back"
                  : m.steps?.map((st) => st.die).join(" then ") || m.die,
              )
              .join(" or ")
          : ""
      }`;
      const g = svg("g", {
        "data-point": p,
        role: "button",
        tabindex: -1,
        "aria-label": label,
        "aria-disabled": !interactive,
        "aria-pressed": selected === p,
        class: `point${sources.includes(p) ? " movable" : ""}${selected === p ? " selected" : ""}${destinations.includes(p) ? " destination" : ""}${moves.some((m) => m.to === p && m.undo) ? " return-destination" : ""}`,
      });
      g.append(
        svg("rect", {
          x,
          y: top ? 28 : 366,
          width: 60,
          height: 266,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      g.append(
        svg("path", {
          d: top
            ? `M${x + 3} 38 L${x + 57} 38 L${x + 30} 262 Z`
            : `M${x + 3} 622 L${x + 57} 622 L${x + 30} 398 Z`,
          fill: boardColor(p % 2 ? "pointB" : "pointA"),
          "pointer-events": "none",
        }),
      );
      g.append(patternOverlay(g.lastChild, p % 2 ? "pointB" : "pointA"));
      if (numbers)
        g.append(
          svg(
            "text",
            {
              x: x + 30,
              y: top ? 21 : 650,
              "text-anchor": "middle",
              fill: boardColor("numbers"),
              "font-size": compact ? 28 : 16,
              "font-weight": 500,
              "pointer-events": "none",
            },
            distance(p, orientation),
          ),
        );
      for (let i = 0; i < Math.min(n, 5); i++)
        g.append(
          checker(
            x + 30,
            top ? 65 + i * 47 : 595 - i * 47,
            v > 0 ? 0 : 1,
            i === 4 && n > 5 ? n : 1,
            compact,
          ),
        );
      if (destinations.includes(p))
        g.append(
          svg("circle", {
            cx: x + 30,
            cy: top ? 274 : 386,
            r: 19,
            fill: boardColor("destination"),
            stroke: boardColor("surface"),
            "stroke-width": 2,
            "pointer-events": "none",
          }),
        );
      if (destinations.includes(p)) {
        const next = { ...s, points: [...s.points] };
        next.points[p] =
          Math.sign(v) === (s.turn ? -1 : 1)
            ? v + (s.turn ? -1 : 1)
            : s.turn
              ? -1
              : 1;
        const landing = checkerPosition(next, p, s.turn, orientation);
        g.append(
          svg("circle", {
            cx: landing.x,
            cy: landing.y,
            r: 25,
            class: "landing-ring",
            "pointer-events": "none",
          }),
        );
      }
      if (destinations.includes(p))
        g.append(
          svg(
            "text",
            {
              x: x + 30,
              y: top ? 281 : 393,
              "text-anchor": "middle",
              fill: boardColor("destinationText"),
              "font-size": compact ? 29 : 23,
              "font-weight": 700,
              "pointer-events": "none",
              class: "destination-die",
            },
            moves.find((m) => m.to === p)?.undo
              ? "↶"
              : moves.find((m) => m.to === p)?.die || "✓",
          ),
        );
      if (sources.includes(p) && n) {
        const pos = checkerPosition(s, p, s.turn, orientation);
        g.append(
          svg("circle", {
            cx: pos.x,
            cy: pos.y,
            r: 27,
            class: "source-ring",
            "pointer-events": "none",
          }),
        );
      }
      children.push(g);
    }
    for (const p of [0, 1]) {
      const top = p !== orientation,
        y = top ? 100 : 506;
      const g = svg("g", {
        "data-point": `bar${p}`,
        tabindex: -1,
        role: "button",
        "aria-label": `${playerName(p)} bar, ${s.bar[p]} checkers`,
        "aria-disabled": !interactive,
        "aria-pressed": selected === "bar" && s.turn === p,
        class: `point${sources.includes("bar") && s.turn === p ? " movable" : ""}${selected === "bar" && s.turn === p ? " selected" : ""}${destinations.includes("bar") && s.turn === p ? " destination return-destination" : ""}`,
      });
      g.append(
        svg("rect", {
          x: 385,
          y: top ? 32 : 387,
          width: 46,
          height: 245,
          rx: 4,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      if (s.bar[p]) g.append(checker(408, y, p, s.bar[p], compact));
      else
        g.append(
          svg(
            "text",
            {
              x: 408,
              y: top ? 68 : 608,
              "text-anchor": "middle",
              fill: boardColor("barLabel"),
              "font-size": compact ? 19 : 13,
            },
            "BAR",
          ),
        );
      if (sources.includes("bar") && s.turn === p)
        g.append(
          svg("circle", {
            cx: 408,
            cy: y,
            r: 27,
            class: "source-ring",
            "pointer-events": "none",
          }),
        );
      children.push(g);
      const off = svg("g", {
        "data-point": `off${p}`,
        tabindex: -1,
        role: "button",
        "aria-disabled": !interactive,
        "aria-label": `${playerName(p)} borne off, ${s.off[p]} checkers${destinations.includes("off") && s.turn === p ? ", legal destination" : ""}`,
        class: `point${destinations.includes("off") && s.turn === p ? " destination" : ""}${sources.includes("off") && s.turn === p ? " movable" : ""}${selected === "off" && s.turn === p ? " selected" : ""}`,
      });
      off.append(
        svg("rect", {
          x: 820,
          y: top ? 35 : 386,
          width: 46,
          height: 239,
          rx: 5,
          fill: boardColor("tray"),
          class: "point-hit",
        }),
      );
      off.append(patternOverlay(off.firstChild, "tray"));
      off.append(
        svg(
          "text",
          {
            x: 843,
            y: top ? 60 : 620,
            "text-anchor": "middle",
            fill: boardColor("trayLabel"),
            "font-size": compact ? 22 : 14,
          },
          "OFF",
        ),
      );
      for (let i = 0; i < s.off[p]; i++)
        off.append(
          svg("rect", {
            x: 827,
            y: top ? 76 + i * 11 : 590 - i * 11,
            width: 32,
            height: 7,
            rx: 3,
            fill: boardColor(`checker${p}`),
            "pointer-events": "none",
          }),
        );
      if (s.off[p])
        off.append(
          svg(
            "text",
            {
              x: 843,
              y: top ? 260 : 410,
              "text-anchor": "middle",
              fill: boardColor("trayLabel"),
              "font-size": 18,
            },
            s.off[p],
          ),
        );
      if (destinations.includes("off") && s.turn === p)
        off.append(
          svg(
            "text",
            {
              x: 843,
              y: top ? 330 : 339,
              "text-anchor": "middle",
              fill: boardColor("destination"),
              "font-size": 30,
              "font-weight": 700,
              "pointer-events": "none",
            },
            "↓",
          ),
        );
      children.push(off);
    }
    if (s.rules.cube) {
      const cy =
        s.cube.owner === null ? 330 : s.cube.owner === orientation ? 432 : 228;
      const cube = svg("g", {
        class: "board-cube",
        "aria-label": `Doubling cube ${s.cube.value}`,
      });
      cube.append(
        svg("rect", {
          x: 390,
          y: cy - 18,
          width: 36,
          height: 36,
          rx: 6,
          fill: boardColor("cube"),
          stroke: boardColor("cubeBorder"),
          "stroke-width": 1,
        }),
        svg(
          "text",
          {
            x: 408,
            y: cy + 7,
            "text-anchor": "middle",
            "font-size": 19,
            fill: boardColor("cubeText"),
            "font-weight": 700,
          },
          s.cube.value === 1 ? "64" : s.cube.value,
        ),
      );
      cube.insertBefore(
        patternOverlay(cube.firstChild, "cube"),
        cube.lastChild,
      );
      children.push(cube);
    }
    children.push(
      svg(
        "text",
        {
          x: s.dice.length && s.turn !== orientation ? 610 : 196,
          y: 337,
          "text-anchor": "middle",
          fill: boardColor("caption"),
          "font-size": 14,
          "letter-spacing": 2,
        },
        preview
          ? "MOVE PREVIEW"
          : editor
            ? "POSITION EDITOR"
            : interactive
              ? ""
              : "BACKGAMMON",
      ),
    );
    children.push(
      this.dice(s, {
        orientation,
        usedDice,
        chooseDie,
        preferredDie,
        hideDice,
        interactive,
        preview,
      }),
    );
    this.svg.replaceChildren(...children);
    if (
      selected !== null &&
      previousSelected !== selected &&
      !reducedMotion() &&
      !document.hidden
    ) {
      for (const node of this.svg.querySelectorAll(
        ".selected .source-ring,.destination .landing-ring",
      )) {
        const animation = node.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 130,
          easing: "ease-out",
        });
        this.animations.push(animation);
      }
    }
    this.svg.classList.toggle("is-preview", preview);
    if (interactive)
      (
        this.svg.querySelector(`[data-point="${focus}"]`) ||
        this.svg.querySelector(".selected,.movable") ||
        this.svg.querySelector("[data-point]")
      ).setAttribute("tabindex", "0");
    if (focus)
      this.svg
        .querySelector(`[data-point="${focus}"]`)
        ?.focus({ preventScroll: true });
    else if (focusedDie)
      this.svg
        .querySelector(`[data-die="${focusedDie}"][role="button"]`)
        ?.focus({ preventScroll: true });
  }
}
