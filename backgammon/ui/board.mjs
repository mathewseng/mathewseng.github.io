// SPDX-License-Identifier: GPL-3.0-or-later
import { keycapGraphic } from "./keycap.mjs";
import { playerName, distance, applyStep, boardKey } from "../core/rules.mjs";
import { reducedMotion, checkerFlight, checkerDrop } from "./motion.mjs";
import { sound } from "./sound.mjs";
import { boardColor } from "../core/appearance.mjs";
import { routeArrow } from "./move-arrow-route.mjs";
import { captureHighlights, animateHighlights, clearHighlightExits } from "./highlight-motion.mjs";
import { LAST_MOVE_ENTRY_TIMING, captureLastMoveEntry, animateLastMoveEntry, captureLastMoveExit, animateLastMoveExit, clearLastMoveExits } from "./last-move-motion.mjs";
import { capturePreview, animatePreview, clearPreview } from "./preview-motion.mjs";
import { animate as animateBatched, beginAnimationBatch, finishAnimationBatch, resumeAnimation } from "./animation-batch.mjs";
const NS = "http://www.w3.org/2000/svg";
let boardSerial = 0;
const STACK_LIMIT = 5,
  CHECKER_RADIUS = 22;
// Five touching discs fit between the frame and the destination-label lane.
const stackY = (top, slot) =>
  top ? 54 + slot * CHECKER_RADIUS * 2 : 606 - slot * CHECKER_RADIUS * 2;
// Fill the corners around each visible disc, within its own point lane.
// One shared test keeps a near-edge tap and a drag pickup identical. The open
// point tip stays destination space; neighboring point targets never overlap.
function checkerHit(group, position) {
  const hit = group.querySelector('.checker-hit');
  if (!hit) return -1;
  const x = +hit.getAttribute('x'), y = +hit.getAttribute('y');
  if (position.x < x || position.x > x + +hit.getAttribute('width') ||
      position.y < y || position.y > y + +hit.getAttribute('height')) return -1;
  const faces = [...group.querySelectorAll(':scope > .checker > circle:first-child')];
  let closest = -1, distance = Infinity;
  faces.forEach((face, i) => {
    const d = Math.hypot(position.x - +face.getAttribute('cx'), position.y - +face.getAttribute('cy'));
    if (d < distance) { closest = i; distance = d; }
  });
  return closest;
}
function checkerHitArea(group, x, top, count, width = 58) {
  if (!count) return;
  const low = Math.min(stackY(top, 0), stackY(top, Math.min(count, STACK_LIMIT) - 1));
  const high = Math.max(stackY(top, 0), stackY(top, Math.min(count, STACK_LIMIT) - 1));
  const y = Math.max(28, low - 29), end = Math.min(632, high + 29);
  group.append(svg('rect', {x:x-width/2,y,width,height:end-y,rx:8,fill:'transparent',class:'checker-hit'}));
}
const diceTransform = die => {
  const [, x, y] = die.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  return `matrix(1,0,0,1,${x},${y})`;
};
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  if (tag === "circle" && attrs.class === "source-ring") attrs = {...attrs, pathLength: 120};
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
      y >= (g.top ? 0 : 366) &&
      y < (g.top ? 294 : 660)
    )
      return p;
  }
  for (const p of [0, 1]) {
    const top = p !== orientation;
    if (
      x >= 385 &&
      x < 431 &&
      y >= (top ? 32 : 387) &&
      y < (top ? 294 : 632)
    )
      return `bar${p}`;
    if (
      x >= 820 &&
      x < 866 &&
      y >= (top ? 35 : 557) &&
      y < (top ? 103 : 625)
    )
      return `off${p}`;
  }
  return null;
}
// A release in a legal region wins. Otherwise use its nearest edge, then its
// center to break ties. Targets come only from the dragged checker's legal
// routes; presentation never invents a move or chooses a different checker.
export function closestLegalPoint(x, y, targets, player, orientation = 0) {
  const raw = [...new Set(targets)].map(p => typeof p === "number" ? p : `${p}${player}`);
  const hit = pointAt(x, y, orientation);
  if (raw.includes(hit)) return hit;
  let best = null, bestDistance = Infinity, bestCenter = Infinity;
  for (const p of raw) {
    let left, top, width, height;
    if (typeof p === "number") {
      const g = pointGeometry(p, orientation);
      [left, top, width, height] = [g.x, g.top ? 0 : 366, 60, 294];
    } else {
      const upper = player !== orientation, bar = p.startsWith("bar");
      [left, top, width, height] = bar
        ? [385, upper ? 32 : 387, 46, upper ? 262 : 245]
        : [820, upper ? 35 : 557, 46, 68];
    }
    const distance = Math.hypot(Math.max(left - x, 0, x - left - width),
      Math.max(top - y, 0, y - top - height));
    const center = Math.hypot(x - left - width / 2, y - top - height / 2);
    if (distance < bestDistance || (distance === bestDistance && center < bestCenter)) {
      best = p; bestDistance = distance; bestCenter = center;
    }
  }
  return best;
}
export function checkerPosition(s, point, player, orientation = 0) {
  if (point === "bar")
    return { x: 408, y: player !== orientation ? 100 : 506 };
  if (point === "off")
    return { x: 843, y: player !== orientation ? 66 : 594 };
  const g = pointGeometry(point, orientation),
    n = Math.max(1, Math.abs(s.points[point]));
  return {
    x: g.x + 30,
    y: stackY(g.top, Math.min(n, STACK_LIMIT) - 1),
  };
}
// Original top-stack slots, compressed exactly like the live checker stacks.
// A checker using several dice leaves one origin, not ghosts at intermediate stops.
export function lastMoveGhosts(lastMove, orientation = 0) {
  const ghosts = [];
  for (const [key, { count, before }] of Object.entries(
    lastMove?.origins || {},
  )) {
    const point = key === "bar" ? key : Number(key),
      slots = new Map();
    for (let i = before - count; i < before; i++) {
      const slot = point === "bar" ? 0 : Math.min(i, STACK_LIMIT - 1);
      slots.set(slot, (slots.get(slot) || 0) + 1);
    }
    for (const [slot, n] of slots) {
      const g = point === "bar" ? null : pointGeometry(point, orientation);
      ghosts.push({
        point,
        count: n,
        x: g ? g.x + 30 : 408,
        y: g
          ? stackY(g.top, slot)
          : lastMove.player !== orientation
            ? 100
            : 506,
      });
    }
  }
  return ghosts;
}
// Arrows connect display identities, not legal paths. Route around the final
// actual checker stacks, then mask faces as a fallback in very dense positions.
export function lastMoveArrows(state, trace, orientation = 0) {
  if (!trace?.checkers?.length) return [];
  const position = (point, index) => {
    if (point === "bar") return { x: 408, y: trace.player !== orientation ? 100 : 506 };
    if (point === "off") return { x: 843, y: trace.player !== orientation ? 66 : 594 };
    const g = pointGeometry(point, orientation);
    return { x: g.x + 30, y: stackY(g.top, Math.min(index, STACK_LIMIT - 1)) };
  };
  const blockers = []; // Ghost origins are empty space, not obstacles.
  for (let p = 0; p < 24; p++) {
    const g = pointGeometry(p, orientation);
    for (let i = 0; i < Math.min(Math.abs(state.points[p]), STACK_LIMIT); i++)
      blockers.push({ x: g.x + 30, y: stackY(g.top, i), r: 28 });
  }
  for (const p of [0, 1]) {
    if (state.bar[p]) blockers.push({ x: 408, y: p !== orientation ? 100 : 506, r: 28 });
    if (state.off[p]) blockers.push({ x: 843, y: p !== orientation ? 66 : 594, r: 28 });
  }
  // Repeated transfers share one arrow between the exposed tops of the stacks.
  // Four crisscrossing lines for a double obscure both the ghosts and the move.
  const transfers = new Map();
  for (const piece of trace.checkers) {
    const key = `${piece.from}:${piece.to}`, earlier = transfers.get(key);
    transfers.set(key, earlier ? { ...earlier, count: earlier.count + 1,
      fromIndex: Math.max(earlier.fromIndex, piece.fromIndex),
      toIndex: Math.max(earlier.toIndex, piece.toIndex) } : { ...piece, count: 1 });
  }
  const seen = new Set(), arrows = [];
  for (const piece of transfers.values()) {
    const from = position(piece.from, piece.fromIndex), to = position(piece.to, piece.toIndex);
    const key = `${from.x},${from.y}:${to.x},${to.y}`;
    if (seen.has(key)) continue; // Tall stacks share a visible slot.
    seen.add(key);
    const route = routeArrow(from, to, blockers);
    if (route) arrows.push({ ...route, from, to, origin: piece.from, destination: piece.to, count: piece.count });
  }
  return arrows;
}
function moveArrowLayer(state, trace, orientation, children, id) {
  const faces = children.flatMap(n => [...n.querySelectorAll(".checker > circle:first-child")]);
  const arrows = lastMoveArrows(state, trace, orientation);
  const layer = svg("g", { class: "last-move-arrows", "pointer-events": "none", "aria-hidden": "true" });
  if (!arrows.length) return layer;
  const mask = svg("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 876, height: 660 });
  mask.append(svg("rect", { width: 876, height: 660, fill: "white" }));
  for (const face of faces)
    mask.append(svg("circle", { cx: face.getAttribute("cx"), cy: face.getAttribute("cy"), r: 25, fill: "black" }));
  const defs = svg("defs"); defs.append(mask); layer.append(defs);
  const ink = svg("g", { mask: `url(#${id})`, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
  for (const arrow of arrows) {
    const g = svg("g", { class: "last-move-arrow", "data-origin": arrow.origin, "data-destination": arrow.destination, "data-count": arrow.count });
    g.append(svg("path", { d: arrow.d, stroke: boardColor(`count${trace.player}`), "stroke-width": 4.5, opacity: 0.75 }));
    g.append(svg("path", { d: arrow.d, stroke: boardColor(`checker${trace.player}`), "stroke-width": 2.5, class: "move-arrow-line", opacity: 0.9 }));
    g.append(svg("path", { d: "M0 0 L-9 -4.5 Q-7 0 -9 4.5 Z",
      transform: `translate(${arrow.tip.x} ${arrow.tip.y}) rotate(${arrow.angle})`,
      fill: boardColor(`checker${trace.player}`), stroke: boardColor(`count${trace.player}`), "stroke-width": 1 }));
    ink.append(g);
  }
  layer.append(ink);
  return layer;
}
function originGhost({ x, y, count }, player) {
  const g = svg("g", {
    class: "last-move-ghost",
    "data-ghost-count": count,
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: CHECKER_RADIUS,
      fill: boardColor(`checker${player}`),
      opacity: 0.16,
    }),
  );
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: CHECKER_RADIUS + 3,
      fill: "none",
      stroke: boardColor("caption"),
      "stroke-width": 2,
      pathLength: 120,
      "stroke-dasharray": "2 4",
      "stroke-dashoffset": 1,
      "stroke-linecap": "round",
      opacity: 0.9,
    }),
  );
  return g;
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
function returnIcon(x, y) {
  return svg("path", { class: "destination-die", d: `M${x+8} ${y+10}v-12a8 8 0 0 0-16 0v3m-5-5 5 5 5-5`,
    fill: "none", stroke: boardColor("undoText"), "stroke-width": 3,
    "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none" });
}
function checker(x, y, p, count = 1, compact = false, moved = false, undoable = false, showCount = false) {
  const g = svg("g", {
    class: "checker",
    "data-player": p,
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: CHECKER_RADIUS,
      fill: boardColor(`checker${p}`),
      stroke: boardColor(`rim${p}`),
      "stroke-width": 2,
    }),
  );
  g.append(patternOverlay(g.firstChild, `checker${p}`));
  if (undoable) {
    g.classList.add("draft-undo-checker");
    g.append(svg("circle", { cx:x, cy:y, r:CHECKER_RADIUS,
      class:"draft-undo-tint", fill:boardColor("undo"), opacity:0.7,
      stroke:boardColor("undo"), "stroke-width":2 }));
  }
  g.append(
    svg("circle", {
      cx: x,
      cy: y,
      r: CHECKER_RADIUS - 6,
      fill: "none",
      stroke: boardColor(`detail${p}`),
      "stroke-width": 1.5,
    }),
  );
  if (undoable && count === 1 && !showCount)
    g.append(svg("path", { class:"draft-undo-mark", d:`M${x+8} ${y+7}v-7a8 8 0 0 0-16 0v2m-4-4 4 4 4-4`,
      fill:"none", stroke:boardColor("undoText"), "stroke-width":3,
      "stroke-linecap":"round", "stroke-linejoin":"round" }));
  if (count > 1 || showCount)
    g.append(
      svg(
        "text",
        {
          x,
          y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: boardColor(undoable ? "undoText" : `count${p}`),
          "font-size": compact ? 30 : 22,
          "font-weight": 700,
        },
        count,
      ),
    );
  if (moved) {
    g.classList.add("last-moved-checker");
    g.append(
      svg("circle", {
        cx: x,
        cy: y,
        r: CHECKER_RADIUS + 2,
        fill: "none",
        stroke: boardColor("surface"),
        class: "last-move-ring",
        "stroke-width": 4,
        opacity: 0.7,
      }),
    );
    g.append(
      svg("circle", {
        cx: x,
        cy: y,
        r: CHECKER_RADIUS + 2,
        fill: "none",
        stroke: boardColor("selection"),
        class: "last-move-ring",
        "stroke-width": 2.5,
        pathLength: 120,
        "stroke-dasharray": "4 6",
        "stroke-dashoffset": 2,
        "stroke-linecap": "round",
      }),
    );
  }
  return g;
}
export class Board {
  constructor(container, onPoint = () => {}) {
    this.arrowMaskId = `move-arrows-${++boardSerial}`;
    this.container = container;
    this.onPoint = onPoint;
    this.svg = svg("svg", {
      viewBox: "0 0 876 660",
      class: "bg-board",
      role: "group",
      "aria-label": "Backgammon board",
    });
    container.replaceChildren(this.svg);
    this.motion = true;
    this.animations = [];
    this.feedbackTimers = [];
    this.lifecycle = new AbortController();
    const listen = { signal: this.lifecycle.signal };
    this.touchInput = matchMedia('(pointer: coarse)');
    this.touchInput.addEventListener('change', () => this.updateCaption(), listen);
    const settle = () => {
      if (this.playbackTimer && this.playbackFinal) {
        const { state, options } = this.playbackFinal;
        this.render(state, options);
      } else this.cancelAnimations();
      if (this.pointer?.dragging) {
        this.dragLandingContext = null;
        this.showDragLanding(this.dragLandingTarget);
      }
    };
    addEventListener(
      "bg-motion",
      () => {
        if (this.reducedMotion()) settle();
      },
      listen,
    );
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => {
        if (this.reducedMotion()) settle();
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
    // Prevent mouse focus/selection rectangles without hiding keyboard focus.
    this.svg.addEventListener("mousedown", e => e.preventDefault());
    this.svg.addEventListener("dragstart", e => e.preventDefault());
    this.svg.addEventListener("click", (e) => {
      // Mobile tap correction can retarget the empty lane to an adjacent point
      // (or a bar tap to the lane). Use the real touch position for this dense,
      // non-overlapping board geometry; keep keyboard activation target-based.
      const pointer = e.detail && this.touchTap ? this.touchTap : e;
      const target = pointer === e ? e.target : document.elementFromPoint(pointer.clientX, pointer.clientY);
      this.touchTap = null;
      if (performance.now() < (this.suppressClickUntil || 0)) return;
      // A second roll tap may arrive during the first roll's animation.
      // Let Play recognize that intent before locking ordinary board actions.
      if (!target?.closest('.board-cube') && this.onRoll?.({target, clientX:pointer.clientX, clientY:pointer.clientY})) return;
      if (this.playbackTimer) return;
      if (target?.closest(".board-cube")) { this.onCube?.(); return; }
      if (!this.options?.interactive) return;
      if (target?.closest(".dice-switch, .dice-switch-hit")) { this.onSwitchDice?.(); return; }
      const die = target?.closest("[data-die]");
      if (this.activateDie(die)) return;
      const p = target?.closest("[data-point]");
      if (p) {
        const raw = this.decode(p.dataset.point);
        const pos = this.coordinates(pointer.clientX, pointer.clientY);
        const own =
          typeof raw === "number"
            ? Math.sign(this.state.points[raw]) ===
              (this.state.turn ? -1 : 1)
            : raw === `bar${this.state.turn}` || raw === `off${this.state.turn}`;
        const checkerTap =
          (own || this.renderOptions.editor) &&
          (checkerHit(p, pos) >= 0 || [...p.querySelectorAll(".off-checker")].some((r) =>
            pos.x >= +r.getAttribute("x") &&
            pos.x <= +r.getAttribute("x") + +r.getAttribute("width") &&
            pos.y >= +r.getAttribute("y") &&
            pos.y <= +r.getAttribute("y") + +r.getAttribute("height"),
          ));
        this.onPoint(raw, { quick: !checkerTap, checkerTap });
      } else this.onBackground?.();
    });
    this.svg.addEventListener('keydown', e => {
      if (e.target.closest?.('.board-caption') && ['Enter',' '].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation(); this.onRoll?.(e);
      }
    }, true);
    this.svg.addEventListener("pointerdown", (e) => {
      this.suppressClickUntil = 0;
      this.touchTap = e.isPrimary && e.pointerType === "touch"
        ? { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY } : null;
      if (e.button !== 0 || !e.isPrimary || !this.options?.interactive)
        return;
      const p = e.target.closest("[data-point]");
      if (!p?.classList.contains("movable")) return;
      // Empty tray-side space is a bear-off shortcut, never a pickup of an
      // already borne-off checker. The count disc keeps its own undo/drag hitbox.
      if (e.target.classList.contains("bearoff-hit")) return;
      const pos = this.coordinates(e.clientX, e.clientY);
      const pickIndex = checkerHit(p, pos);
      if (
        !p.dataset.point.startsWith("off") &&
        pickIndex < 0
      )
        return;
      this.pointer = {
        id: e.pointerId,
        raw: this.decode(p.dataset.point),
        x: e.clientX,
        y: e.clientY,
        touch: e.pointerType === "touch",
        pickIndex: Math.max(0, pickIndex),
        dragging: false,
      };
      if (e.pointerType === "touch") {
        this.touchTarget = e.target;
        this.touchMoveGuard = event => {
          if (this.pointer?.dragging && event.touches.length === 1 && event.cancelable)
            event.preventDefault();
        };
        // Touch events stay addressed to the original circle even after the
        // selection redraw replaces it. Keep the guard on that exact node.
        this.touchTarget.addEventListener("touchmove", this.touchMoveGuard, {passive:false});
      }
    });
    this.svg.addEventListener("pointermove", (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6)
        return;
      if (!p.dragging) {
        if (!this.onDragStart?.(p.raw)) {
          this.endDrag();
          return;
        }
        p.dragging = true;
        this.svg.setPointerCapture(e.pointerId);
        this.svg.classList.add("is-dragging");
        this.pickUpChecker(true);
        this.dragKeyDown = event => {
          if (event.key !== "Escape") return;
          event.preventDefault(); event.stopPropagation();
          this.endDrag(); this.onCancel?.();
        };
        document.addEventListener("keydown", this.dragKeyDown, true);
      }
      e.preventDefault();
      this.followDrag(e.clientX, e.clientY);
    });
    // Some mobile engines resolve SVG touch-action at the outer SVG, and a
    // redraw replaces the initially hit circle. Cancel only single-finger drag
    // scrolling; ordinary board swipes and two-finger zoom retain native input.
    this.svg.addEventListener("touchmove", e => {
      if (this.pointer?.dragging && e.touches.length === 1 && e.cancelable)
        e.preventDefault();
    }, { passive:false });
    this.svg.addEventListener("pointerup", (e) => {
      if (this.touchTap?.pointerId === e.pointerId)
        this.touchTap = { clientX: e.clientX, clientY: e.clientY };
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      if (p.dragging) {
        const pos = this.coordinates(e.clientX, e.clientY),
          target = this.dropTarget(pos);
        this.followDrag(e.clientX, e.clientY);
        const origin = { ...this.dragPosition, landing: this.captureDragLanding() };
        this.endDrag();
        this.dropOrigin = origin;
        try { this.onDrop?.(p.raw, target); }
        finally { this.dropOrigin = null; }
      } else this.endDrag();
    });
    for (const event of ["pointercancel", "lostpointercapture"])
      this.svg.addEventListener(event, () => {
        if (event === "pointercancel") this.touchTap = null;
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
      if (e.repeat && ["Enter", " "].includes(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        this.endDrag();
        this.onCancel?.();
        return;
      }
      if (["Enter", " "].includes(e.key) && e.target.closest(".board-cube[role=button]")) {
        e.preventDefault(); this.onCube?.(); return;
      }
      if (!this.options?.interactive) return;
      if (["Enter", " "].includes(e.key) && e.target.closest(".dice-switch, .dice-switch-hit")) {
        e.preventDefault(); this.onSwitchDice?.(); return;
      }
      const die = e.target.closest("[data-die]");
      if (
        die &&
        ["Enter", " "].includes(e.key) &&
        die.getAttribute("role") === "button"
      ) {
        e.preventDefault();
        this.activateDie(die);
        return;
      }
      const point = e.target.closest("[data-point]");
      if (!point) return;
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        this.onPoint(this.decode(point.dataset.point), {
          quick: e.shiftKey,
        });
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
  activateDie(die) {
    if (!die) return false;
    if (this.onDieTap) {
      this.onDieTap(die.hasAttribute("data-draft-index") ? Number(die.dataset.draftIndex) : null, Number(die.dataset.die), Number(die.dataset.dieIndex));
      return true;
    }
    // The selected/used face shares the surrounding lane's switch/undo action.
    // An unselected face explicitly chooses that die, also in beginner mode.
    if (die.classList.contains("preferred") ||
        (this.renderOptions.advanced && die.classList.contains("consumed"))) {
      this.onSwitchDice?.();
    } else if (die.getAttribute("role") === "button") {
      this.renderOptions.chooseDie?.(Number(die.dataset.die));
    } else return false;
    return true;
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
      editor = false, historical = false, forcedDice = [], lockedDice = 0, playableDice = null, advanced = false, shortcuts = null,
    },
  ) {
    // Display rolls high die first without changing the committed dice or the
    // editor's indexed inputs. Draft undo stays matched by value and step index.
    const roll = editor ? s.dice : [...s.dice].sort((a, b) => b - a);
    const group = svg("g", {
      class: `board-dice${historical ? " last-roll" : ""}`,
      "data-player": s.turn,
      "aria-label": historical
        ? `${playerName(s.turn)} last roll: ${roll.join(" and ")}`
        : "Rolled dice",
      ...(this.container.id === "board" ? { id: "dice" } : {}),
    });
    if (hideDice || !s.dice.length) {
      group.setAttribute("display", "none");
      return group;
    }
    const values =
      !historical && !editor && s.dice[0] === s.dice[1]
        ? Array(4).fill(s.dice[0])
        : roll;
    const used = usedDice.map((value, index) => ({ value, index })), forced = [...forcedDice],
      center = s.turn === orientation ? 610 : 204;
    const undoAction = usedDice.length > lockedDice;
    if (interactive && chooseDie && !historical && !editor) {
      // The whole empty middle lane on the active dice's half, from the inner
      // frame to the bar. Point targets end at 294/start at 366; the bar and
      // cube stay outside. Faces above this layer retain their individual undo.
      // The visible switch button provides keyboard/accessibility semantics.
      // This transparent padding is not a second focusable control.
      group.append(svg("rect", { class: "dice-switch-hit", x: s.turn === orientation ? 428 : 18,
        y: 294, width: 370, height: 72, fill: "transparent", "aria-hidden": "true" }));
    }
    const pips = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };
    values.forEach((value, i) => {
      const usedIndex = used.findIndex(step => step.value === value);
      const consumed = usedIndex >= 0;
      const draftIndex = consumed ? used.splice(usedIndex, 1)[0].index : null;
      const isForced = consumed && forced.includes(value);
      if (isForced) forced.splice(forced.indexOf(value), 1);
      const blocked = !consumed && playableDice !== null && !playableDice.includes(value);
      const active = !consumed && !blocked && preferredDie === value &&
        !values.slice(0, i).some((v, j) => v === value && j >= usedDice.filter(d => d === value).length);
      const clickable = interactive && chooseDie && (undoAction
        ? draftIndex === null || draftIndex >= lockedDice : !consumed && !blocked);
      const actionLabel = undoAction ? consumed ? "Undo move for die " : "Undo last move, die "
        : active ? "Switch selected die, die " : "Use die ";
      const x = center + (i - (values.length - 1) / 2) * (values.length === 2 ? 120 : 72);
      const die = svg("g", {
        transform: `translate(${x} 330)`,
        "data-die": value,
        "data-die-index": i,
        ...(consumed ? { "data-draft-index": draftIndex } : {}),
        class: `board-die${consumed ? " consumed" : ""}${isForced ? " forced" : ""}${blocked ? " blocked" : ""}${active && clickable ? " preferred" : ""}`,
        "data-status": isForced ? "forced" : consumed ? "used" : blocked ? "blocked" : active ? "selected" : "available",
        role: clickable ? "button" : "img",
        "aria-label": `${editor ? "Edit die " + (i + 1) + ", " : clickable ? actionLabel : "Die "}${value}${historical ? ", previous roll" : isForced ? ", forced move" : consumed ? ", used" : blocked ? ", no legal move" : active ? ", selected" : ", available"}`,
        ...(clickable
          ? { tabindex: 0, "aria-pressed": active }
          : {}),
      });
      const face = svg("rect", {
        x: -31,
        y: -31,
        width: 62,
        height: 62,
        rx: 11,
        fill: boardColor(`die${s.turn}`),
        stroke: boardColor(`dieBorder${s.turn}`),
        "stroke-width": 2,
      });
      // Keep the touch target still while the visual face grows/settles, within
      // the center lane so its padding never steals a point-space tap.
      die.append(svg("rect", { class: "board-die-hit", x: -34, y: -36,
        width: 68, height: 72, fill: "transparent", "aria-hidden": "true" }));
      const body = svg("g", { class: "board-die-face", "pointer-events": "none" });
      const ink = svg("g", {class:"die-ink"});
      ink.append(face, patternOverlay(face, `die${s.turn}`));
      body.append(ink);
      // A restrained colored rim reinforces size/shadow. Keep it mounted so
      // switching, using and undoing can reverse its fade from the visible frame.
      ink.append(svg("rect", { class: "die-status-mark die-selection-accent",
        "data-die-mark": "selected", x: -31, y: -31, width: 62, height: 62, rx: 11,
        fill: "color-mix(in srgb, var(--board-selection) 35%, transparent)",
        stroke: boardColor("selection"), "stroke-width": 2.4,
        opacity: active && clickable ? 1 : 0, "aria-hidden": "true" }));
      for (const pip of pips[value])
        ink.append(
          svg("circle", {
            cx: ((pip % 3) - 1) * 18,
            cy: (Math.floor(pip / 3) - 1) * 18,
            r: 6.5,
            fill: boardColor(`pips${s.turn}`),
            "pointer-events": "none",
          }),
        );
      // Marks remain in the SVG so reversing a draft can fade them away
      // instead of removing them mid-animation. Hidden marks never intercept input.
      // Different shapes and semantic colors distinguish automatic steps from
      // chosen steps, independently of the board theme's selection color.
      for (const [mark, d, stroke, visible] of [
        ["check", "M21 28l6 6 13-17", "var(--played-die, #8ddbad)", consumed && !isForced],
        ["forced", "M20 27H40M32 19l8 8-8 8", "var(--forced-die, #efb365)", isForced],
      ]) body.append(svg("path", {
        d, stroke, fill: "none", class: `die-status-mark die-${mark}`,
        "data-die-mark": mark, "aria-hidden": "true",
        opacity: visible ? 1 : 0, pathLength: 100,
        "stroke-dasharray": 100, "stroke-dashoffset": visible ? 0 : 100,
        "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round",
        "pointer-events": "none",
      }));
      body.append(svg("path", { d: "M-13 -13L13 13 M13 -13L-13 13",
        class: "die-status-mark die-blocked", "data-die-mark": "blocked", "aria-hidden": "true",
        opacity: blocked ? 1 : 0, stroke: "var(--loss-red, #ff8f92)", "stroke-width": 5,
        "stroke-linecap": "round", fill: "none", "pointer-events": "none" }));
      die.append(body);
      group.append(die);
    });
    if (interactive && chooseDie && !historical && !editor && (values.length === 2 || undoAction)) {
      const swap = svg("g", { class: "dice-switch", role: "button", tabindex: 0,
        "aria-label": undoAction ? "Undo draft step" : "Switch selected die", transform: `translate(${center + (values.length === 2 ? 0 : 165)} 330)` });
      swap.append(svg("rect", { class: "dice-switch-surface", x: -19, y: -22, width: 38, height: 44, rx: 9, fill: "var(--panel)", stroke: "var(--line)" }));
      for (const [icon, d, visible] of [
        ["swap", "M-10 -5H10l-4 -4M10 5H-10l4 4", !undoAction],
        ["undo", "M-10 -3H2a7 7 0 0 1 0 14H-4M-4 -9l-6 6 6 6", undoAction],
      ]) swap.append(svg("path", { "data-dice-icon": icon, d, opacity: visible ? 1 : 0,
        fill: "none", stroke: "var(--text)", "stroke-width": 2,
        "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none", "aria-hidden": "true" }));
      const key = shortcuts?.swap?.[0];
      if (key) swap.append(keycapGraphic(key, { x: 0, y: 25, height: 18, maxWidth: 44 }));
      group.append(swap);
    }
    return group;
  }
  coordinates(x, y) {
    return new DOMPoint(x, y).matrixTransform(
      this.svg.getScreenCTM().inverse(),
    );
  }
  dropTarget(position) {
    return closestLegalPoint(position.x, position.y,
      [...this.renderOptions.moves.map(move => move.to), ...(this.pointer ?
        [typeof this.pointer.raw === 'string' ? this.pointer.raw.replace(/[01]$/, '') : this.pointer.raw] : [])],
      this.state.turn, this.options.orientation);
  }
  showDragLanding(target) {
    if (this.dragLandingTarget === target && this.dragLandingContext === this.renderOptions) return;
    const preview = target === null ? null : this.renderOptions.dropPreview?.(target);
    this.dragLandingTarget = target;
    this.dragLandingContext = this.renderOptions;
    if (!preview) { this.clearDragLanding(); return; }
    const { point, count, undo } = preview, top = this.state.turn !== this.options.orientation;
    const g = typeof point === "number" ? pointGeometry(point, this.options.orientation) : null;
    const position = g ? { x: g.x + 30, y: stackY(g.top, Math.min(count, STACK_LIMIT) - 1) }
      : { x: point === "bar" ? 408 : 843, y: point === "bar" ? (top ? 100 : 506) : (top ? 66 : 594) };
    const fresh = !this.dragLanding;
    if (fresh) {
      this.dragLanding = svg("g", { class: "drag-landing-ghost", "pointer-events": "none", "aria-hidden": "true" });
      this.dragLanding.append(
        svg("circle", { class: "drag-landing-face", r: CHECKER_RADIUS, fill: boardColor(`checker${this.state.turn}`) }),
        svg("circle", { class: "drag-landing-inner", r: 16, fill: "none" }),
        svg("circle", { class: "drag-landing-edge", r: CHECKER_RADIUS + 2, fill: "none", pathLength: 120 }),
        svg("circle", { class: "drag-landing-count-bg", r: 12, fill: boardColor(`checker${this.state.turn}`) }),
        svg("text", { class: "drag-landing-count", y: 1, fill: boardColor(`count${this.state.turn}`), "text-anchor": "middle", "dominant-baseline": "middle" }),
      );
      this.svg.insertBefore(this.dragLanding, this.dragGhost);
    }
    const node = this.dragLanding, motion = !this.reducedMotion() && !document.hidden;
    // Read the visible pose before cancelling. Rapid crossings reverse in place;
    // pointer motion within the same destination never restarts the transition.
    const style = getComputedStyle(node), from = style.transform, opacity = style.opacity;
    node.dataset.target = target;
    node.classList.toggle("is-undo", undo);
    const showCount = count > (g ? STACK_LIMIT : 1);
    node.querySelector("text").textContent = showCount ? count : "";
    node.querySelector(".drag-landing-count-bg").style.display = showCount ? "" : "none";
    const transform = `translate(${position.x}px, ${position.y}px)`;
    if (!fresh && node.style.transform === transform && motion) return;
    this.dragLandingMove?.cancel();
    node.style.transform = transform;
    this.dragLandingMove = motion ? node.animate([
      { transform: fresh ? transform : from, opacity: fresh ? 0 : opacity },
      { transform, opacity: 1 },
    ], { duration: fresh ? 140 : 180, easing: "cubic-bezier(.2,.75,.3,1)" }) : null;
  }
  clearDragLanding() {
    this.dragLandingMove?.cancel();
    this.dragLandingMove = null;
    this.dragLanding?.remove();
    this.dragLanding = null;
    this.dragLandingTarget = null;
    this.dragLandingContext = null;
  }
  captureDragLanding() {
    if (!this.dragLanding || this.reducedMotion() || document.hidden) return null;
    const style = getComputedStyle(this.dragLanding);
    return { node: this.dragLanding.cloneNode(true), transform: style.transform,
      opacity: Number(style.opacity), target: this.dragLanding.dataset.target };
  }
  settleDropGhost(snapshot, destination, flight, checkerAnimation) {
    if (!snapshot) return;
    const node = snapshot.node, pose = new DOMMatrix(snapshot.transform);
    node.classList.replace("drag-landing-ghost", "drop-landing-ghost");
    // Retain the visible frame even if release interrupts a destination glide.
    // The ghost and held checker converge on the same slot, on the same clock.
    const frames = checkerDrop({ x: pose.e, y: pose.f }, destination).frames.map(frame => {
      const t = Math.max(0, (frame.offset - .35) / .65);
      const fade = t * t * t * (10 + t * (-15 + 6 * t));
      return { ...frame, opacity: snapshot.opacity * (1 - fade) };
    });
    this.svg.insertBefore(node, checkerAnimation.effect.target);
    const animation = node.animate(frames, {
      duration: flight.duration, fill: "both", easing: "linear", id: "drop-landing-settle",
    });
    if (checkerAnimation.startTime !== null) animation.startTime = checkerAnimation.startTime;
    this.animations.push(animation);
    animation.finished.then(() => { node.remove(); animation.cancel(); }).catch(() => node.remove());
  }
  pickUpChecker(animate = false) {
    const p = this.pointer, group = this.svg.querySelector(`[data-point="${p.raw}"]`);
    if (!group) return;
    const pieces = [...group.querySelectorAll(":scope > .checker")];
    const top = pieces[p.pickIndex] || pieces.at(-1);
    if (!top) return;
    const face = top.firstChild, x = +face.getAttribute("cx"), y = +face.getAttribute("cy");
    // Counts represent hidden checkers: show one fewer, not a translucent copy.
    const point = typeof p.raw === "number" ? p.raw : p.raw.slice(0, -1);
    const count = typeof point === "number" ? Math.abs(this.state.points[point]) : this.state[point][this.state.turn];
    top.classList.add("drag-origin");
    group.classList.add("drag-source");
    if ((typeof point === "number" && count > STACK_LIMIT) || (typeof point === "string" && count > 1)) {
      const remainder = checker(x, y, this.state.turn,
        typeof point === "number" && (count === STACK_LIMIT + 1 || p.pickIndex < STACK_LIMIT - 1) ? 1 : count - 1, this.container.clientWidth < 600);
      remainder.classList.add("drag-remainder"); group.append(remainder);
      if (typeof point === "number" && p.pickIndex < STACK_LIMIT - 1) {
        const cap = pieces.at(-1); cap.classList.add("drag-origin");
        const replacement = checker(+cap.firstChild.getAttribute("cx"), +cap.firstChild.getAttribute("cy"), this.state.turn,
          count === STACK_LIMIT + 1 ? 1 : count - 1, this.container.clientWidth < 600);
        replacement.classList.add("drag-remainder"); group.append(replacement);
      }
    }
    if (point === "off") [...group.querySelectorAll(".off-checker")].at(-1)?.classList.add("drag-origin");
    this.dragGhost = svg("g", { class:"drag-checker", "pointer-events":"none", "aria-hidden":"true" });
    this.dragFace = checker(0, 0, this.state.turn);
    this.dragFace.classList.add("drag-face"); this.dragGhost.append(this.dragFace);
    this.svg.append(this.dragGhost);
    if (animate && !this.reducedMotion()) {
      const down = this.coordinates(p.x, p.y);
      this.dragLift = this.dragFace.animate([
        { transform: `translate(${x - down.x}px, ${y - down.y}px) scale(1)` },
        { transform: `translateY(${p.touch ? -24 / Math.abs(this.svg.getScreenCTM().a) : 0}px) scale(1.1)` },
      ], { duration:160, easing:"cubic-bezier(.2,.75,.3,1)", fill:"forwards" });
    } else this.dragFace.style.transform = `translateY(${p.touch && !this.reducedMotion() ? -24 / Math.abs(this.svg.getScreenCTM().a) : 0}px) scale(${this.reducedMotion() ? 1 : 1.1})`;
  }
  followDrag(clientX, clientY) {
    const p = this.pointer;
    p.clientX = clientX; p.clientY = clientY;
    const position = this.coordinates(clientX, clientY);
    // Read the lift pose before moving the SVG, avoiding a forced layout on
    // every pointer event. Translation still follows the finger immediately.
    const pose = new DOMMatrix(getComputedStyle(this.dragFace).transform);
    this.dragGhost.setAttribute("transform", `translate(${position.x} ${position.y})`);
    this.dragPosition = { x:position.x + pose.e, y:position.y + pose.f, scale:pose.a };
    const target = this.dropTarget(position);
    const hover = this.svg.querySelector(`[data-point="${target}"]`);
    if (!hover?.classList.contains("drop-hover")) {
      this.svg.querySelectorAll(".drop-hover").forEach(n => n.classList.remove("drop-hover"));
      hover?.classList.add("drop-hover");
    }
    this.showDragLanding(target);
  }
  endDrag() {
    const p = this.pointer;
    this.pointer = null;
    this.touchTarget?.removeEventListener("touchmove", this.touchMoveGuard);
    this.touchTarget = null;
    document.removeEventListener("keydown", this.dragKeyDown, true);
    if (p?.dragging) this.suppressClickUntil = performance.now() + 400;
    if (p && this.svg.hasPointerCapture(p.id))
      this.svg.releasePointerCapture(p.id);
    this.dragLift?.cancel();
    this.dragLift = null;
    this.dragGhost?.remove();
    this.dragGhost = null;
    this.dragPosition = null;
    this.clearDragLanding();
    this.svg
      .querySelectorAll(".drag-origin")
      .forEach((n) => n.classList.remove("drag-origin"));
    this.svg.querySelectorAll(".drag-remainder").forEach(n => n.remove());
    this.svg.querySelectorAll(".drag-source").forEach(n => n.classList.remove("drag-source"));
    this.svg.classList.remove("is-dragging");
    this.svg
      .querySelectorAll(".drop-hover")
      .forEach((n) => n.classList.remove("drop-hover"));
  }
  cancelAnimations(keep = []) {
    if (!keep.length) {
      this.feedbackTimers.forEach(clearTimeout);
      this.feedbackTimers = [];
    }
    this.animations?.filter(a => !keep.includes(a.effect?.target)).forEach(a => a.cancel());
    this.animations = this.animations?.filter(a => keep.includes(a.effect?.target)) || [];
    clearHighlightExits(this.svg);
    clearLastMoveExits(this.svg);
    clearPreview(this.svg);
    this.svg
      .querySelectorAll(".moving-checker,.landing-contact,.drop-landing-ghost,.arrival-resident")
      .forEach((n) => { if (!keep.includes(n)) n.remove(); });
    this.svg.querySelectorAll("[data-arriving]").forEach((n) => {
      n.style.opacity = "";
      n.removeAttribute("data-arriving");
    });
  }
  reducedMotion() {
    return !this.motion || reducedMotion();
  }
  destroy() {
    this.lifecycle.abort();
    this.endDrag();
    clearTimeout(this.playbackTimer);
    this.cancelAnimations();
  }
  showPreview(state, options) {
    const key = JSON.stringify([boardKey(state), options.orientation, options.usedDice, options.lastMove]);
    if (this.previewKey === key) return;
    this.previewKey = key;
    const snapshot = this.state && this.options.orientation === options.orientation &&
      !this.reducedMotion() && !document.hidden ? capturePreview(this.svg) : null;
    this.render(state, { ...options, interactive: false, preview: true });
    if (snapshot) animatePreview(this.svg, snapshot, this.animations);
  }
  animateEdit(before, after, from, to, player) {
    if (this.reducedMotion() || document.hidden) return;
    this.flyChecker(this.dropOrigin || checkerPosition(before, from, player, this.options.orientation),
      checkerPosition(after, to, player, this.options.orientation), player, to,
      {drop:!!this.dropOrigin, residentCount:typeof to === 'number' ? Math.max(0, before.points[to] * (player ? -1 : 1)) : 0});
  }
  async waitForPresentation() {
    while (!this.reducedMotion() && !document.hidden &&
      (this.playbackTimer || performance.now() < (this.diceSettledAt || 0))) {
      await new Promise(resolve => setTimeout(resolve, 32));
    }
  }
  playTurn(before, steps, { automatic = false, rolled = false, final = this.state, options = this.renderOptions } = {}) {
    if (!steps.length) return;
    if (this.reducedMotion() || document.hidden) {
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
        lastMove: null,
        usedDice: steps.slice(0, index).map(st => st.die),
        forcedDice: automatic ? steps.slice(0, index).map(st => st.die) : options.forcedDice,
        playback: true,
      });
      const duration = this.animateMove(current, after, step);
      current = after;
      this.playbackTimer = setTimeout(advance, duration + 200);
    };
    if (rolled) {
      this.render(before, {...options, playback:true, interactive:false, lastMove:null,
        selected:null, sources:[], destinations:[], moves:[], usedDice:[], forcedDice:[], presentation:{roll:true}});
      this.playbackTimer = setTimeout(advance, Math.max(0, this.diceSettledAt - performance.now()));
    } else advance();
  }
  animateMove(before, after, step, reverse = false, route = [step]) {
    const cue = reverse
      ? "undo"
      : after.bar[1 - before.turn] > before.bar[1 - before.turn]
        ? "hit"
        : step.to === "off"
          ? "off"
          : "move";
    if (this.reducedMotion() || document.hidden) {
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
            return checkerPosition(
              interim,
              st.to,
              p,
              this.options.orientation,
            );
          })
        : [];
    const flight = this.flyChecker(
      this.dropOrigin ||
        checkerPosition(before, from, p, this.options.orientation),
      checkerPosition(after, to, p, this.options.orientation),
      p,
      to,
      { via: this.dropOrigin ? [] : via, drop: !!this.dropOrigin,
        residentCount: typeof to === 'number' ? Math.max(0, before.points[to] * (p ? -1 : 1)) : 0 },
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
          setTimeout(() => sound.play(name), flight.landings[i] ?? flight.duration),
        );
        current = next;
      });
    }
    let completedAt = flight.duration;
    const animateHit = (origin, destination, target, delay) => {
      const hit = this.flyChecker(origin, destination, 1 - p, target, { delay });
      completedAt = Math.max(completedAt, delay + hit.duration);
    };
    if (!reverse && route.length > 1) {
      let current = before;
      for (const [index, st] of route.entries()) {
        const next = applyStep(current, st);
        if (next.bar[1 - p] > current.bar[1 - p])
          animateHit(
            checkerPosition(current, st.to, 1 - p, this.options.orientation),
            checkerPosition(next, "bar", 1 - p, this.options.orientation),
            "bar", Math.max(0, (flight.landings[index] ?? flight.duration) - 35),
          );
        current = next;
      }
    } else if (before.bar[1 - p] !== after.bar[1 - p]) {
      const source = reverse ? "bar" : step.to,
        dest = reverse ? step.to : "bar";
      animateHit(
        checkerPosition(before, source, 1 - p, this.options.orientation),
        checkerPosition(after, dest, 1 - p, this.options.orientation),
        dest, reverse ? 0 : Math.max(0, flight.landings[0] - 35),
      );
    }
    // Opponent playback waits for every hit checker to reach the bar as well.
    return completedAt;
  }

  flyChecker(
    origin,
    destination,
    player,
    target,
    { via = [], delay = 0, drop = false, residentCount = 0 } = {},
  ) {
    // Bearoff drops settle on the displayed tray marker, matching the ghost.
    if (drop && target === "off") destination = { x: 843, y: player !== this.options.orientation ? 66 : 594 };
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
    piece.arrival = landed;
    piece.arrivalTarget = { raw, destination };
    // The stack cap represents existing checkers too. Keep its previous face
    // and count visible until this arriving checker covers it at touchdown.
    if (landed && typeof target === 'number' && residentCount >= STACK_LIMIT) {
      piece.resident = checker(destination.x, destination.y, player,
        residentCount > STACK_LIMIT ? residentCount : 0);
      piece.resident.classList.add('arrival-resident');
      piece.resident.setAttribute('aria-hidden','true');
      piece.resident.style.pointerEvents = 'none';
      landed.parentElement.insertBefore(piece.resident, landed);
    }
    if (landed) {
      landed.style.opacity = "0";
      landed.dataset.arriving = Number(landed.dataset.arriving || 0) + 1;
    }
    this.svg.append(piece);
    const flight = drop ? checkerDrop(origin, destination) : checkerFlight([origin, ...via, destination]);
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
    if (drop && origin.landing?.target === String(raw))
      this.settleDropGhost(origin.landing, destination, flight, animation);
    const settle = completed => {
        piece.remove();
        piece.resident?.remove();
        const landed = piece.arrival;
        // A newer move can reuse this cached stack before a cancelled flight's
        // rejection runs. Reveal it only after its last live arrival retires.
        const arriving = [...this.svg.querySelectorAll('.moving-checker')]
          .some(node => node.arrival === landed);
        if (landed?.hasAttribute('data-arriving') && !arriving) {
          landed.style.opacity = "";
          landed.removeAttribute("data-arriving");
        }
        if (completed) { animation.cancel(); this.contact(destination); }
    };
    animation.finished.then(() => settle(true), () => settle(false));
    return flight;
  }
  contact(position) {
    if (this.reducedMotion() || document.hidden) return;
    const ring = svg("circle", {
      cx: position.x,
      cy: position.y,
      r: CHECKER_RADIUS + 3,
      class: "landing-contact",
      "pointer-events": "none",
      "aria-hidden": "true",
    });
    this.svg.append(ring);
    const animation = ring.animate([{ opacity: 0.65 }, { opacity: 0 }], {
      duration: 220,
      easing: "ease-out",
    });
    this.animations.push(animation);
    animation.finished.then(() => ring.remove()).catch(() => {});
  }
  animateRestore(before, after, cue = "reset") {
    sound.play(cue);
    if (this.reducedMotion() || document.hidden) return;
    const firstAnimation = this.animations.length;
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
          ...checkerPosition(
            display,
            point,
            player,
            this.options.orientation,
          ),
          point,
        };
      };
      for (const point of [...Array(24).keys(), "bar", "off"]) {
        const a = count(before, point),
          b = count(after, point);
        for (let i = b; i < a; i++)
          origins.push(pose(before, point, i + 1));
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
        if (origin) {
          const raw = typeof dest.point === "number" ? String(dest.point) : `${dest.point}${player}`;
          const held = player === before.turn && this.dropOrigin && !this.dropOrigin.used &&
            (!this.dropOrigin.landing || this.dropOrigin.landing.target === raw);
          this.flyChecker(held ? this.dropOrigin : origin, dest, player, dest.point,
            {drop:!!held, residentCount: typeof dest.point === 'number' ? count(before,dest.point) : 0});
          if (held) this.dropOrigin.used = true;
        }
      }
    }
    return Promise.allSettled(this.animations.slice(firstAnimation).map(animation => animation.finished));
  }
  returnDragged(point) {
    if (!this.dropOrigin || this.reducedMotion() || document.hidden) return;
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
      { drop: true },
    );
  }
  animateDice() {
    sound.play("roll");
    if (this.reducedMotion() || document.hidden) return;
    this.diceSettledAt = performance.now() + 740;
    const faces = [...this.svg.querySelectorAll(".board-die")].map(die => {
      const face = die.querySelector(".board-die-face");
      return {face, restingTransform:getComputedStyle(face).transform};
    });
    faces.forEach(({face, restingTransform}, i) => {
      // The outer SVG transform fixes the die's location. Animate the face inside
      // it, preserving focus/hit targets and displaying only the committed value.
      // Land at the selected die's raised resting pose, without a final snap.
      const sign = i % 2 ? 1 : -1;
      const animation = animateBatched(face,
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
          { transform: restingTransform, opacity: 1 },
        ],
        {
          duration: 560,
          delay: i * 30,
          easing: "cubic-bezier(.2,.75,.3,1)",
          fill: "backwards",
          id: "dice-roll",
        }, this.animations,
      );
      this.animations.push(animation);
    });
  }
  dicePoses() {
    // Snapshot before render cancels animations/removes SVG children. This also
    // captures interrupted lifts/fades, so switching and undo never jump.
    if (this.reducedMotion() || document.hidden) return null;
    const diceNodes = [...this.svg.querySelectorAll('.board-die')];
    const dice = diceNodes.map(die => {
      const face = die.querySelector('.board-die-face');
      const group = die.closest('.board-dice');
      const style = getComputedStyle(face);
      return { value: die.dataset.die, location: die.getAttribute('transform'),
        layout: getComputedStyle(die).transform === 'none' ? diceTransform(die) : getComputedStyle(die).transform,
        opacity: getComputedStyle(die).opacity,
        copy: diceNodes.length === 4 ? die.cloneNode(true) : null,
        player: group.dataset.player, historical: group.classList.contains('last-roll'),
        transform: style.transform, filter: style.filter,
        marks: Object.fromEntries([...face.querySelectorAll('[data-die-mark]')].map(mark => {
          const style = getComputedStyle(mark);
          return [mark.dataset.dieMark, { opacity: style.opacity, strokeDashoffset: style.strokeDashoffset, stroke: style.stroke }];
        })),
        opacities: [...face.children].filter(n => !n.classList.contains('die-status-mark'))
          .map(n => getComputedStyle(n).opacity) };
    });
    const control = this.svg.querySelector('.dice-switch');
    const retiring = [...this.svg.querySelectorAll('.dice-layout-retiring')].map(node => {
      const animation = node.getAnimations()[0];
      return { node, time: animation?.currentTime, frames: animation?.effect.getKeyframes(), timing: animation?.effect.getTiming() };
    });
    return { dice, retiring, control: control && { location: control.getAttribute('transform'),
      player: control.closest('.board-dice').dataset.player,
      opacities: [...control.querySelectorAll('[data-dice-icon]')].map(n => getComputedStyle(n).opacity) } };
  }
  animateDiceLayout(poses) {
    if (this.reducedMotion() || document.hidden) return;
    const dice = [...this.svg.querySelectorAll('.board-die')];
    if (!dice.length) return;
    const group = dice[0].closest('.board-dice');
    const old = poses?.dice || [], samePlayer = old[0]?.player === group.dataset.player;
    const expanding = dice.length === 4 && old.length !== 4;
    const collapsing = dice.length === 2 && old.length === 4 && samePlayer;
    const timing = {duration: 420, easing: 'cubic-bezier(.22,.7,.25,1)', id: 'dice-layout'};
    const animate = (node, from, to, opts = timing) => {
      if (from.transform === to.transform && from.opacity === to.opacity) return;
      this.animations.push(animateBatched(node, [from, to], opts, this.animations));
    };
    dice.forEach((die, i) => {
      // WebKit can report `none` for an SVG transform attribute. Give WAAPI
      // an explicit CSS destination so the dice cannot fly toward (0,0).
      const target = diceTransform(die);
      die.style.transform = target;
      let before = samePlayer ? old[collapsing ? i * 3 : expanding ? (i < 2 ? 0 : 1) : i] : null;
      // Doubles open into two pairs, with the extra faces fading in as they
      // spread. On a new player's roll start within that player's own lane.
      const center = Number(die.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]);
      const pairX = expanding ? center + [48, -24, 24, -48][i] : center;
      const transform = before?.layout || `matrix(1,0,0,1,${pairX},330)`;
      const opacity = expanding && (i === 1 || i === 2) ? '0' : before?.opacity || '1';
      animate(die, {transform, opacity}, {transform:target, opacity:'1'});
    });
    if (collapsing) {
      for (const i of [1, 2]) {
        const before = old[i], ghost = before.copy;
        ghost.classList.remove('board-die'); ghost.classList.add('dice-layout-retiring');
        ghost.removeAttribute('data-die'); ghost.removeAttribute('tabindex'); ghost.removeAttribute('role');
        ghost.setAttribute('aria-hidden', 'true'); ghost.style.pointerEvents = 'none';
        ghost.querySelectorAll('[tabindex]').forEach(n => n.removeAttribute('tabindex'));
        group.append(ghost);
        const target = dice[i - 1].getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
        const targetTransform = `matrix(1,0,0,1,${target[1]},${target[2]})`;
        const animation = animateBatched(ghost, [{transform:before.layout, opacity:before.opacity},
          {transform:targetTransform, opacity:0}], {...timing, id:'dice-layout-exit', fill:'forwards'}, this.animations);
        animation.onfinish = () => ghost.remove(); this.animations.push(animation);
      }
    } else if (samePlayer) {
      // Analysis/status redraws must not cut the two retiring faces short.
      for (const item of poses?.retiring || []) {
        if (!item.frames || item.time >= item.timing.duration) continue;
        group.append(item.node);
        const animation = animateBatched(item.node, item.frames, {...item.timing, id:'dice-layout-exit'}, this.animations);
        resumeAnimation(animation, item.time, this.animations);
        animation.onfinish = () => item.node.remove(); this.animations.push(animation);
      }
    }
  }
  animateDiceSelection(poses) {
    if (!poses?.dice.length || this.reducedMotion() || document.hidden) return;
    // Collect every computed value before starting any animation. WAAPI
    // invalidates style; alternating reads/writes used to relayout once per pip.
    const pending = [];
    const animate = (node, frames, options) => pending.push({node, frames, options});
    const timing = { duration: 280, easing: 'cubic-bezier(.2,.75,.3,1)' };
    this.svg.querySelectorAll('.board-die').forEach((die, index) => {
      const before = poses.dice[index];
      const group = die.closest('.board-dice');
      // A used die changes from a button to an image but keeps its visual slot.
      // Match the roll's player and layout, never a previous player's last roll.
      if (!before || before.player !== group.dataset.player ||
          before.historical !== group.classList.contains('last-roll') ||
          before.value !== die.dataset.die || before.location !== die.getAttribute('transform')) return;
      const face = die.querySelector('.board-die-face'), style = getComputedStyle(face);
      const after = { transform: style.transform, filter: style.filter };
      if (before.transform !== after.transform || before.filter !== after.filter) {
        animate(face, [
          { transform: before.transform, filter: before.filter }, after,
        ], { ...timing, id: 'dice-selection' });
      }
      // Dim the face, pattern and pips together; keep used/forced/blocked marks
      // legible. Capture each part so undo can reverse an in-progress fade.
      [...face.children].filter(n => !n.classList.contains('die-status-mark')).forEach((part, i) => {
        const opacity = getComputedStyle(part).opacity;
        if (before.opacities[i] === undefined || before.opacities[i] === opacity) return;
        animate(part, [
          { opacity: before.opacities[i] }, { opacity },
        ], { ...timing, id: 'dice-opacity' });
      });
      face.querySelectorAll('[data-die-mark]').forEach(mark => {
        const previous = before.marks[mark.dataset.dieMark], style = getComputedStyle(mark);
        if (!previous) return;
        // An invisible mark has no visible color to preserve: a forced arrow
        // should draw orange from its very first visible frame.
        const from = { ...previous, stroke: previous.opacity === '0' ? style.stroke : previous.stroke };
        // Draw on use; on undo fade the current stroke without erasing it backwards.
        // Capturing the visible dash/opacity also makes rapid undo/redo continuous.
        const to = { opacity: style.opacity,
          strokeDashoffset: style.opacity === '0' ? from.strokeDashoffset : style.strokeDashoffset,
          stroke: style.opacity === '0' ? from.stroke : style.stroke };
        if (from.opacity === to.opacity && from.strokeDashoffset === to.strokeDashoffset && from.stroke === to.stroke) return;
        animate(mark, [from, to], { ...timing, id: 'dice-mark' });
      });
    });
    const control = this.svg.querySelector('.dice-switch'), before = poses.control;
    if (control && before && before.location === control.getAttribute('transform') &&
        before.player === control.closest('.board-dice').dataset.player) {
      control.querySelectorAll('[data-dice-icon]').forEach((icon, i) => {
        const opacity = getComputedStyle(icon).opacity;
        if (before.opacities[i] === opacity) return;
        animate(icon, [{ opacity: before.opacities[i] }, { opacity }],
          { ...timing, id: 'dice-control' });
      });
    }
    for (const {node, frames, options} of pending)
      this.animations.push(animateBatched(node, frames, options, this.animations));
  }
  animateCube(before) {
    sound.play("cube");
    if (this.reducedMotion() || document.hidden) return;
    const cube = this.svg.querySelector(".board-cube");
    if (!cube) return;
    const cy = (s) =>
      s.cube.owner === null
        ? 330
        : s.cube.owner === this.options.orientation
          ? 354
          : 306;
    const offset = cy(before) - cy(this.state);
    const animation = cube.animate(
      [
        { transform: `translateY(${offset}px) scale(.9)`, opacity: 0.65 },
        {
          transform: "translateY(0) scale(1.12)",
          opacity: 1,
          offset: 0.68,
        },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(.2,.7,.25,1)" },
    );
    this.animations.push(animation);
  }
  updateChildren(children) {
    // Keep untouched point stacks/frame nodes mounted. Replacing the entire
    // SVG invalidates geometry/paint for every checker on every tap, even when
    // only two points changed. Compare the last *rendered description*, not
    // live markup that animation/focus has decorated in the meantime.
    const counts = new Map(), next = new Map();
    let cursor = this.svg.firstChild;
    for (let node of children) {
      const base = node.dataset.point !== undefined ? `point:${node.dataset.point}`
        : `${node.tagName}:${node.classList[0] || ''}`;
      const index = counts.get(base) || 0;
      counts.set(base, index + 1);
      const key = `${base}:${index}`;
      const old = this.childCache?.get(key);
      const signature = old?.node === node ? old.signature : node.outerHTML;
      // Dice have their own snapshot/animation handoff and may be replaced
      // independently by the advanced die-switch fast path.
      if (old?.signature === signature && old.node.parentNode === this.svg &&
          !node.classList.contains('board-dice')) {
        const tab = node.getAttribute('tabindex');
        node = old.node;
        if (tab !== null && node.getAttribute('tabindex') !== tab) node.setAttribute('tabindex', tab);
      }
      if (node !== cursor) this.svg.insertBefore(node, cursor);
      cursor = node.nextSibling;
      next.set(key, { node, signature });
    }
    while (cursor) { const following = cursor.nextSibling; cursor.remove(); cursor = following; }
    this.childCache = next;
  }
  render(
    s,
    {
      orientation = 0,
      numbers = true,
      cubeOneAsOne = false,
      moveHints = true,
      selected = null,
      destinations = [],
      reachable = [],
      reverseTargets = [],
      undoSources = [],
      revisionTargets = [],
      sources = [],
      moves = [],
      dropPreview = null,
      interactive = true,
      preview = false,
      editor = false,
      diceState = null,
      playback = false,
      presentation = null,
      usedDice = [],
      forcedDice = [], lockedDice = 0, playableDice = null, advanced = false, boardShortcuts: shortcuts = null,
      chooseDie = null,
      preferredDie = null,
      hideDice = false,
      lastMove = null,
    } = {},
  ) {
    const nextOptions = { orientation, numbers, cubeOneAsOne, moveHints, selected, destinations,
      reachable, reverseTargets, undoSources, revisionTargets, sources, moves,
      dropPreview, interactive, preview, editor, diceState, usedDice, forcedDice,
      lockedDice, playableDice, advanced, boardShortcuts: shortcuts, chooseDie,
      preferredDie, hideDice, lastMove };
    if (presentation?.steps?.length) {
      // Start at the first visible move. Building the final board/arrows here
      // only to discard them for playback doubles the work on Confirm.
      const moving = !this.reducedMotion() && !document.hidden;
      this.playTurn(presentation.before, presentation.steps,
        {...presentation, final:s, options:nextOptions});
      if (moving) return;
    }
    // Advanced die switching changes only the dice. Keep the board, flights and
    // their animation clocks alive instead of rebuilding hundreds of SVG nodes.
    const diceOnlyKey = JSON.stringify({ ...nextOptions, preferredDie: null });
    const diceOnly = this.state === s && this.diceOnlyKey === diceOnlyKey &&
      this.renderOptions?.preferredDie !== preferredDie && advanced &&
      !moveHints && selected === null && interactive && !preview && !editor &&
      !playback && !hideDice && !lastMove && !this.pointer?.dragging;
    this.diceOnlyKey = diceOnlyKey;
    if (diceOnly) {
      const poses = this.dicePoses();
      const focused = this.svg.contains(document.activeElement) ? document.activeElement?.dataset.die : null;
      const old = this.svg.querySelector('.board-dice');
      this.renderOptions = nextOptions;
      for (const animation of this.animations)
        if (['dice-layout','dice-selection','dice-opacity','dice-mark','dice-control'].includes(animation.id)) animation.cancel();
      this.animations = this.animations.filter(a => a.playState !== 'idle' && a.playState !== 'finished');
      beginAnimationBatch(this.animations);
      old.replaceWith(this.dice(diceState || s, { ...nextOptions, shortcuts }));
      this.animateDiceLayout(poses);
      this.animateDiceSelection(poses);
      finishAnimationBatch(this.animations);
      if (focused) this.svg.querySelector(`[data-die="${focused}"][role="button"]`)?.focus({preventScroll:true});
      return;
    }
    const compact = this.container.clientWidth < 600;
    const dicePoses = this.dicePoses();
    const highlightMotion = !this.reducedMotion() && !document.hidden;
    const lastMoveEntry = highlightMotion ? captureLastMoveEntry(this.svg) : [];
    const arrowPoses = highlightMotion ? [...this.svg.querySelectorAll('.last-move-arrow > path')].map(path => {
      const a = path.getAnimations().find(a => a.id === 'move-arrow-entry' && a.playState !== 'finished');
      return a ? { time: a.currentTime, frames: a.effect.getKeyframes(), timing: a.effect.getTiming() } : null;
    }) : [];
    const highlights = highlightMotion && this.options?.orientation === orientation
      ? captureHighlights(this.svg) : [];
    const before = this.state;
    const sameTurn = before && before.turn === s.turn && before.gameNumber === s.gameNumber;
    // Analysis/status redraws must not cut a release short. Keep its live
    // sprites and clocks only while the actual position/context is unchanged.
    const settling = highlightMotion && interactive && !preview && !editor && !playback &&
      sameTurn && before.phase === s.phase && before.sequence === s.sequence &&
      this.options?.orientation === orientation && boardKey(before) === boardKey(s) &&
      this.svg.querySelector('.drop-landing-ghost')
      ? [...this.svg.querySelectorAll('.drop-landing-ghost,.moving-checker')] : [];
    const rolling = sameTurn && before.phase === "roll" && s.sequence === before.sequence + 1
      && this.renderOptions?.lastMove && boardKey(before) === boardKey(s);
    const lastMoveExit = highlightMotion && this.options?.orientation === orientation
      && !preview && !editor && !playback && !lastMove && s.phase === "move"
      && sameTurn && (rolling || before.sequence === s.sequence)
      ? captureLastMoveExit(this.svg, rolling) : [];
    if (!playback) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
      this.playbackFinal = null;
    }
    this.cancelAnimations(settling);
    beginAnimationBatch(this.animations);
    if (this.options?.orientation !== orientation || !interactive)
      this.endDrag();
    this.state = s;
    this.options = { orientation, interactive };
    this.renderOptions = nextOptions;
    this.svg.classList.toggle("no-move-hints", !moveHints);
    this.svg.classList.toggle(
      "has-moves",
      interactive && sources.length > 0,
    );
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
    const ghosts = lastMoveGhosts(lastMove, orientation);
    const pointCache = this.pointCache || (this.pointCache = new Map());
    const showShortcuts = numbers && shortcuts && !matchMedia("(pointer: coarse), (max-width: 700px)").matches;
    for (let p = 0; p < 24; p++) {
      const { x, y, top } = pointGeometry(p, orientation),
        v = s.points[p],
        n = Math.abs(v),
        moved =
          n && (v > 0 ? 0 : 1) === lastMove?.player
            ? Math.min(n, lastMove.points[p] || 0)
            : 0;
      const label = `Point ${distance(p, orientation)}, ${n ? `${n} ${playerName(v > 0 ? 0 : 1)} checkers` : "empty"}${sources.includes(p) ? ", movable" : ""}${undoSources.includes(p) ? ", tap checker to undo its draft move" : ""}${reachable.includes(p) ? revisionTargets.includes(p) ? ", dice-revision destination: tap point space to revise the draft" : ", reachable: tap the point or press Shift+Enter to move nearest checker" : ""}${
        destinations.includes(p)
          ? ", legal destination, dice " +
            moves
              .filter((m) => m.to === p)
              .map((m) =>
                m.switchDie
                  ? `revise checker to use dice ${m.steps.map((st) => st.die).join(" then ")}`
                  : m.undo
                    ? "move back"
                    : m.steps?.map((st) => st.die).join(" then ") || m.die,
              )
              .join(" or ")
          : ""
      }${reverseTargets.includes(p) ? ", draft return: tap point space to restore a checker and its dice" : ""}${moved ? `, ${moved} moved last turn` : ""}${lastMove?.origins?.[p] ? `, previous location of ${lastMove.origins[p].count} ${playerName(lastMove.player)} checkers, shown as ghosts` : ""}`;
      const pointKey = JSON.stringify([orientation, numbers, compact, moveHints,
        sources.includes(p) || destinations.includes(p) ? s.turn : null,
        selected === p, selected === null, label, undoSources.includes(p) && interactive,
        showShortcuts && shortcuts, ghosts.filter(ghost => ghost.point === p)]);
      const cached = pointCache.get(p);
      if (cached?.key === pointKey && cached.node.parentNode === this.svg) {
        if (cached.node.getAttribute('aria-disabled') !== String(!interactive))
          cached.node.setAttribute('aria-disabled', !interactive);
        children.push(cached.node);
        continue;
      }
      const g = svg("g", {
        "data-point": p,
        role: "button",
        tabindex: -1,
        "aria-label": label,
        "aria-disabled": !interactive,
        "aria-pressed": selected === p,
        class: `point${reachable.includes(p) ? " reachable" : ""}${sources.includes(p) ? " movable" : ""}${selected === p ? " selected" : ""}${destinations.includes(p) ? " destination" : ""}${reverseTargets.includes(p) || moves.some((m) => m.to === p && m.undo) ? " return-destination" : ""}${revisionTargets.includes(p) || moves.some((m) => m.to === p && m.switchDie) ? " entry-switch-destination" : ""}`,
      });
      if (moved) g.setAttribute("data-last-moved", moved);
      g.append(
        svg("rect", {
          x: x + 2,
          y: top ? 30 : 368,
          width: 56,
          height: 262,
          rx: 6,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      g.append(
        svg("path", {
          d: top
            ? `M${x + 3} 38 L${x + 57} 38 L${x + 30} 262 Z`
            : `M${x + 3} 622 L${x + 57} 622 L${x + 30} 398 Z`,
          class: "point-shape",
          fill: boardColor(p % 2 ? "pointB" : "pointA"),
          "pointer-events": "none",
        }),
      );
      g.append(patternOverlay(g.lastChild, p % 2 ? "pointB" : "pointA"));
      // Hover/focus strokes belong above the point paint. At phone scale the
      // non-scaling border is wider than the gap beside the triangle, so drawing
      // it underneath lets the triangle/pattern cut off the inside of the ring.
      g.append(g.querySelector(".point-hit"));
      if (moveHints && reachable.includes(p)) {
        // One inset rounded outline, rather than a filtered triangle whose
        // sharp corners/blur leave rectangular seams on small Safari boards.
        g.append(svg('rect', {x:x+5, y:top ? 29 : 368, width:50, height:263,
          rx:8, class:'point-glow', fill:'none', 'pointer-events':'none'}));
      }
      if (
        (moveHints && (destinations.includes(p) || reachable.includes(p) || reverseTargets.includes(p))) ||
        selected === p
      )
        g.append(
          svg("rect", {
            x: x + 5,
            y: top ? 29 : 368,
            width: 50,
            height: 263,
            rx: 8,
            class: "point-wash",
            "pointer-events": "none",
          }),
        );
      if (moveHints && reachable.includes(p)) g.append(g.querySelector('.point-glow'));
      if (numbers) {
        // The number lane is destination space too, not a dead strip of frame.
        g.append(svg("rect", {
          x, y: top ? 0 : 632, width: 60, height: 28,
          fill: "transparent", class: "point-number-hit",
        }));
        g.append(
          svg(
            "text",
            {
              x: x + 30,
              y: top ? 15 : 646,
              "dominant-baseline": "central",
              "text-anchor": "middle",
              fill: boardColor("numbers"),
              "font-size": compact ? 20 : 16,
              "font-weight": 500,
              "pointer-events": "none",
            },
            distance(p, orientation),
          ),
        );
      }
      for (const ghost of ghosts.filter((ghost) => ghost.point === p))
        g.append(originGhost(ghost, lastMove.player));
      checkerHitArea(g, x + 30, top, n);
      for (let i = 0; i < Math.min(n, STACK_LIMIT); i++)
        g.append(
          checker(
            x + 30,
            stackY(top, i),
            v > 0 ? 0 : 1,
            i === STACK_LIMIT - 1 && n > STACK_LIMIT ? n : 1,
            compact,
            moved > 0 && (i === STACK_LIMIT - 1 || i >= n - moved),
            interactive && undoSources.includes(p) && i === Math.min(n, STACK_LIMIT) - 1,
          ),
        );
      if (moveHints && destinations.includes(p))
        g.append(
          svg("rect", {
            x: x + 8,
            y: top ? 252 : 376,
            width: 44,
            height: 32,
            rx: 16,
            class: "destination-badge",
            fill: boardColor("destination"),
            stroke: boardColor("surface"),
            "stroke-width": 2,
            "pointer-events": "none",
          }),
        );
      if (
        moveHints && destinations.includes(p) &&
        !(n >= STACK_LIMIT && Math.sign(v) === (s.turn ? -1 : 1))
      ) {
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
            r: CHECKER_RADIUS + 1,
            class: "landing-ring",
            "pointer-events": "none",
          }),
        );
      }
      if (moveHints && destinations.includes(p))
        g.append(
          svg(
            "text",
            {
              x: x + 30,
              y: top ? 276 : 400,
              "text-anchor": "middle",
              fill: boardColor("destinationText"),
              "font-size": 23,
              "font-weight": 700,
              "pointer-events": "none",
              class: "destination-die",
            },
            moves.find((m) => m.to === p)?.switchDie
              ? `↔${moves.find((m) => m.to === p).die}`
              : moves.find((m) => m.to === p)?.undo
                ? "↶"
                : moves.find((m) => m.to === p)?.die || "✓",
          ),
        );
      if (
        ((moveHints && sources.includes(p)) || selected === p) &&
        n &&
        (selected === null || selected === p)
      ) {
        const pos = checkerPosition(s, p, s.turn, orientation);
        g.append(
          svg("circle", {
            cx: pos.x,
            cy: pos.y,
            r: CHECKER_RADIUS + 3,
            class: "source-ring",
            "pointer-events": "none",
          }),
        );
      }
      const returnLabel = [...g.querySelectorAll("text.destination-die")].find(n => n.textContent === "↶");
      if (returnLabel) returnLabel.replaceWith(returnIcon(x + 30, top ? 268 : 392));
      for (const ring of g.querySelectorAll(".source-ring")) {
        const halo = ring.cloneNode(false);
        halo.setAttribute("class", `ring-halo${ring.classList.contains("source-ring") ? " source-ring-halo" : ""}`);
        ring.before(halo);
      }
      if (showShortcuts) {
        const visible = orientation ? 23 - p : p;
        const id = visible >= 12 ? `top${visible - 12}` : `bottom${11 - visible}`;
        const key = shortcuts[id]?.[0];
        if (key) g.append(keycapGraphic(key, { x: x + 30, y: top ? 18 : 648,
          height: 10, maxWidth: 52, className: "point-shortcut" }));
        const label = g.querySelector(":scope > text");
        if (label) { label.setAttribute("y", top ? 10 : 640); label.setAttribute("font-size", "14"); }
      }
      pointCache.set(p, {key:pointKey, node:g});
      children.push(g);
    }
    for (const p of [0, 1]) {
      const top = p !== orientation,
        y = top ? 100 : 506,
        returnToBar = s.turn === p &&
          (destinations.includes("bar") || reverseTargets.includes("bar"));
      const g = svg("g", {
        "data-point": `bar${p}`,
        tabindex: -1,
        role: "button",
        "aria-label": `${playerName(p)} bar, ${s.bar[p]} checkers${returnToBar ? ", return checker and restore its entry die" : ""}`,
        "aria-disabled": !interactive,
        "aria-pressed": selected === "bar" && s.turn === p,
        class: `point${(sources.includes("bar") && s.turn === p) || (editor && s.bar[p]) ? " movable" : ""}${selected === "bar" && s.turn === p ? " selected" : ""}${returnToBar ? " destination return-destination" : ""}`,
      });
      g.append(
        svg("rect", {
          x: 385,
          y: top ? 32 : 387,
          width: 46,
          height: top ? 262 : 245,
          rx: 4,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      if (returnToBar) {
        const accent = g.firstChild.cloneNode(false);
        accent.setAttribute('class', 'point-accent');
        accent.setAttribute('pointer-events', 'none');
        g.append(accent);
      }
      if (lastMove?.player === p && lastMove.origins?.bar) {
        g.setAttribute(
          "aria-label",
          `${g.getAttribute("aria-label")}, previous location of ${lastMove.origins.bar.count} checkers, shown as ghosts`,
        );
        for (const ghost of ghosts.filter((ghost) => ghost.point === "bar"))
          g.append(originGhost(ghost, p));
      }
      if (s.bar[p]) g.append(
        svg('rect', {x:385,y:y-29,width:46,height:58,rx:8,fill:'transparent',class:'checker-hit'}),
        checker(408, y, p, s.bar[p], compact));
      if (
        sources.includes("bar") &&
        s.turn === p &&
        (selected === null || selected === "bar")
      )
        g.append(
          svg("circle", {
            cx: 408,
            cy: y,
            r: CHECKER_RADIUS + 3,
            class: "source-ring",
            "pointer-events": "none",
          }),
        );
      if (returnToBar) {
        g.append(
          svg("rect", {
            x: 390,
            y: top ? 255 : 390,
            width: 36,
            height: 38,
            class: "destination-badge",
            rx: 12,
            fill: boardColor("destination"),
            "pointer-events": "none",
          }),
          svg(
            "text",
            {
              x: 408,
              y: top ? 282 : 417,
              "text-anchor": "middle",
              fill: boardColor("destinationText"),
              "font-size": 29,
              "font-weight": 700,
              "pointer-events": "none",
              class: "destination-die",
            },
            "↶",
          ),
        );
      }
      const returnLabel = [...g.querySelectorAll("text.destination-die")].find(n => n.textContent === "↶");
      if (returnLabel) returnLabel.replaceWith(returnIcon(408, top ? 274 : 409));
      for (const ring of g.querySelectorAll(".source-ring")) {
        const halo = ring.cloneNode(false);
        halo.setAttribute("class", "ring-halo source-ring-halo");
        ring.before(halo);
      }
      children.push(g);
      const off = svg("g", {
        "data-point": `off${p}`,
        tabindex: -1,
        role: "button",
        "aria-disabled": !interactive,
        "aria-pressed": selected === "off" && s.turn === p,
        "aria-label": `${playerName(p)} borne off, ${s.off[p]} checkers${(destinations.includes("off") || reachable.includes("off")) && s.turn === p ? ", legal bearoff destination" : ""}${undoSources.includes("off") && s.turn === p ? ", tap checker to undo its draft bearoff" : sources.includes("off") && s.turn === p ? ", draft return available: select a borne-off checker" : ""}${lastMove?.player === p && lastMove.points.off ? `, ${lastMove.points.off} moved last turn` : ""}`,
        class: `point${reachable.includes("off") && s.turn === p ? " reachable" : ""}${destinations.includes("off") && s.turn === p ? " destination" : ""}${(sources.includes("off") && s.turn === p) || (editor && s.off[p]) ? " movable" : ""}${selected === "off" && s.turn === p ? " selected" : ""}`,
      });
      const movedOff =
        lastMove?.player === p ? lastMove.points.off || 0 : 0;
      if (movedOff) off.setAttribute("data-last-moved", movedOff);
      off.append(
        svg("rect", {
          x: 820,
          y: top ? 35 : 557,
          width: 46,
          height: 68,
          rx: 5,
          fill: boardColor("tray"),
          class: "point-hit",
        }),
      );
      off.append(patternOverlay(off.firstChild, "tray"));
      if (reachable.includes('off') && s.turn === p) {
        const accent = off.firstChild.cloneNode(false);
        accent.setAttribute('class', 'point-accent');
        accent.setAttribute('fill', 'none');
        accent.setAttribute('pointer-events', 'none');
        off.append(accent);
      }
      if (s.off[p])
        off.append(
          svg('rect', {x:820,y:(top ? 66 : 594)-29,width:46,height:58,rx:8,fill:'transparent',class:'checker-hit'}),
          checker(843, top ? 66 : 594, p, s.off[p], compact, movedOff > 0, interactive && s.turn === p && undoSources.includes("off"), true),
        );
      if (sources.includes("off") && s.turn === p &&
          (selected === null || selected === "off"))
        off.append(svg("rect", {
          x: 821, y: top ? 36 : 558, width: 44, height: 66, rx: 5,
          class: "source-ring", "pointer-events": "none",
        }));
      // Make the free side lane as easy to tap as a board point. Leave the
      // visible tray unchanged and keep its checker above this destination
      // target, so tapping that disc still returns it. The cube renders later
      // and retains priority wherever its own hitbox overlaps this lane.
      if (interactive && !editor && s.turn === p &&
          (reachable.includes("off") || destinations.includes("off")))
        off.prepend(svg("rect", {
          x: 800, y: top ? 0 : 366, width: 74, height: 294,
          fill: "transparent", class: "bearoff-hit",
        }));
      children.push(off);
    }
    if (s.rules.cube) {
      const cubeLabel = s.cube.value === 1 && !cubeOneAsOne ? 64 : s.cube.value;
      const cy =
        s.cube.owner === null
          ? 330
          : s.cube.owner === orientation
            ? 500
            : 160;
      const cube = svg("g", {
        class: "board-cube",
        "aria-label": `Doubling cube ${s.cube.value}${this.cubeEnabled ? ", offer double" : ""}`,
        ...(this.cubeEnabled ? { role: "button", tabindex: 0 } : {}),
      });
      cube.append(
        svg("rect", {
          class: 'cube-face',
          x: 817,
          y: cy - 26,
          width: 52,
          height: 52,
          rx: 8,
          fill: boardColor("cube"),
          stroke: boardColor("cubeBorder"),
          "stroke-width": 1,
        }),
        svg(
          "text",
          {
            x: 843,
            y: cy + 1,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": Math.min(36, 44 / (String(cubeLabel).length * .62)),
            fill: boardColor("cubeText"),
            "font-weight": 700,
          },
          cubeLabel,
        ),
      );
      cube.insertBefore(
        patternOverlay(cube.firstChild, "cube"),
        cube.lastChild,
      );
      // The whole free lane is a tap target, without entering either off tray
      // or the neighboring point. Ownership still moves the visible cube.
      cube.prepend(svg('rect', {class:'cube-hit',x:800,y:cy-50,width:74,height:100,
        rx:10,fill:'transparent'}));
      const cubeKey = shortcuts?.double?.[0];
      if (cubeKey) {
        const badge = svg("g", {class:"cube-key", "aria-hidden":"true",
          display:this.cubeEnabled ? "inline" : "none"});
        badge.append(keycapGraphic(cubeKey, { x: 843, y: cy > 330 ? cy - 48 : cy + 30, height: 18, maxWidth: 40 }));
        cube.append(badge);
      }
      children.push(cube);
    }
    const historicalDice =
      !s.dice.length && lastMove?.dice?.length === 2;
    children.push(
      svg(
        "g",
        {
          class: 'board-caption',
          // The caption colour rides on the group so the palette coverage
          // (tests/appearance.cjs) holds even while the caption text is empty.
          fill: boardColor("caption"),
          'data-x': historicalDice
            ? lastMove.player !== orientation
              ? 610
              : 196
            : s.dice.length && s.turn !== orientation
              ? 610
              : 196,
        },
      ),
    );
    children.push(
      this.dice(
        historicalDice
          ? { ...s, dice: lastMove.dice, turn: lastMove.player }
          : diceState || s,
        {
          editor,
          orientation,
          usedDice: historicalDice && lastMove.automatic ? lastMove.steps.map(st => st.die) : usedDice,
          forcedDice: historicalDice && lastMove.automatic ? lastMove.steps.map(st => st.die) : forcedDice,
          lockedDice,
          playableDice: historicalDice && lastMove.automatic ? [] : playableDice, advanced, shortcuts,
          chooseDie,
          preferredDie,
          hideDice,
          interactive: historicalDice ? false : interactive,
          historical: historicalDice,
          preview,
        },
      ),
    );
    if (lastMove?.checkers?.length) {
      const arrows = moveArrowLayer(s, lastMove, orientation, children, this.arrowMaskId);
      // Dice/cube paint over an uninterrupted route, without creating detours
      // or padded holes in it. Only real checker faces belong to the mask.
      const dice = children.pop();
      const cubeIndex = children.findIndex(n => n.classList.contains("board-cube"));
      const cube = cubeIndex < 0 ? [] : children.splice(cubeIndex, 1);
      children.push(arrows, ...cube, dice);
    }
    const arrowKey = JSON.stringify([lastMove?.player, lastMove?.checkers, lastMove?.dice]);
    const newArrows = this.arrowKey !== arrowKey;
    this.arrowKey = arrowKey;
    this.updateChildren(children);
    this.updateCaption();
    animateLastMoveExit(this.svg, lastMoveExit, this.animations);
    this.animateDiceLayout(dicePoses);
    this.animateDiceSelection(dicePoses);
    animateHighlights(this.svg, highlights, this.animations, highlightMotion);
    if (lastMove?.checkers?.length && highlightMotion) {
      animateLastMoveEntry(this.svg, lastMoveEntry, this.animations, newArrows);
      [...this.svg.querySelectorAll('.last-move-arrow > path')].forEach((path, index) => {
        const pose = newArrows ? null : arrowPoses[index];
        if (!newArrows && !pose) return;
        const tip = path.matches(':last-child');
        if (!tip) path.setAttribute('pathLength', '1000');
        const frames = pose?.frames || (tip ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ strokeDasharray: '1000', strokeDashoffset: 1000, opacity: 0 },
            { strokeDasharray: '1000', strokeDashoffset: 0, opacity: getComputedStyle(path).opacity }]);
        const timing = pose?.timing || (tip ? { duration: 240, delay: 520, fill: 'backwards' }
          : LAST_MOVE_ENTRY_TIMING);
        const animation = animateBatched(path, frames, { ...timing, id: 'move-arrow-entry' }, this.animations);
        // Disabling controls while committing the roll also redraws the board.
        // Preserve the entrance until the rolled state starts the exit fade.
        if (pose) resumeAnimation(animation, pose.time, this.animations);
        this.animations.push(animation);
      });
    }
    if (presentation?.roll) this.animateDice();
    finishAnimationBatch(this.animations);
    for (const node of settling) {
      this.svg.append(node);
      if (node.arrivalTarget) {
        const { raw, destination } = node.arrivalTarget;
        const faces = [...this.svg.querySelectorAll(`[data-point="${raw}"] .checker`)];
        const landed = faces.find(n => +n.firstChild.getAttribute('cx') === destination.x &&
          +n.firstChild.getAttribute('cy') === destination.y) || faces.at(-1);
        node.arrival = landed;
        if (landed) {
          if (node.resident) landed.before(node.resident);
          landed.style.opacity = '0';
          landed.dataset.arriving = Number(landed.dataset.arriving || 0) + 1;
        }
      }
    }
    if (this.pointer?.dragging) {
      if (this.dragLanding) this.svg.append(this.dragLanding);
      this.dragLift?.cancel();
      this.pickUpChecker();
      this.followDrag(this.pointer.clientX, this.pointer.clientY);
    }
    this.svg.classList.toggle("is-preview", preview);
    this.svg.classList.toggle("is-editor", editor && interactive);
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
  setRollPrompt(prompt) {
    this.rollPrompt = prompt;
    this.updateCaption();
  }
  updateCaption() {
    const node = this.svg.querySelector('.board-caption');
    if (!node) return;
    const {preview,editor,hideDice} = this.renderOptions || {};
    const prompt = this.rollPrompt || {}, touch = this.touchInput.matches;
    const active = !preview && !editor && !hideDice && prompt.auto;
    const ready = !preview && !editor && !hideDice && prompt.ready && this.state?.phase === 'roll';
    const main = preview ? 'Move preview' : editor ? 'Position editor' :
      active ? 'Auto roll on' : ready ? `${touch ? 'Tap' : 'Click'} to roll` : '';
    const detail = active ? `${touch ? 'Tap' : 'Click'} to stop` :
      ready && prompt.canAutoRoll ? `Double ${touch ? 'tap' : 'click'} to auto roll` : '';
    // Roll instructions stay with the local player’s dice even without a
    // previous roll. While dice are visible, keep the auto-roll stop label
    // in the unused lane so it never overlaps the rolling dice.
    const x = ready || (active && this.state?.phase === 'roll') ? 610 : +node.dataset.x;
    const key = JSON.stringify([main,detail,active,ready,x]);
    if (node.dataset.caption === key) return;
    node.dataset.caption = key;
    node.replaceChildren();
    node.dataset.auto = String(!!active);
    node.setAttribute('role', active || ready ? 'button' : 'img');
    node.setAttribute('tabindex', active || ready ? '0' : '-1');
    node.setAttribute('aria-label', [main,detail].filter(Boolean).join('. '));
    if (!main) return;
    if (active || ready) node.append(svg('rect', {class:'board-caption-hit',x:x-174,y:291,width:348,height:80,rx:12,fill:'transparent'}));
    node.append(svg('text', {class:'board-caption-main',x,y:detail ? 318 : 337,'text-anchor':'middle',fill:boardColor('caption'),
      'font-size':active || ready ? 26 : 14}, main));
    if (detail) node.append(svg('text', {class:'board-caption-detail',x,y:351,'text-anchor':'middle',fill:boardColor('caption')}, detail));
  }
}
