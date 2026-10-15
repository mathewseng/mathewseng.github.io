// SPDX-License-Identifier: GPL-3.0-or-later
// Display geometry only. Prefer a straight line, then one broad quadratic bow:
// a single smooth bend instead of contour-following around individual checkers.
// Clearance discs retain 22px of breathing room around a 22px checker. Only
// crowded routes use the tangent graph with C3 blends as a fallback. Geometric
// smoothness is not a claim of zero physical jerk during an animated move.
export const ARROW_CLEARANCE = 44;
const TAU = Math.PI * 2,
  EPS = 1e-6;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const within = (p) => p.x >= 8 && p.x <= 868 && p.y >= 26 && p.y <= 634;
export function segmentClear(a, b, obstacles) {
  return obstacles.every((o) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    if (o.r !== undefined) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((o.x - a.x) * dx + (o.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) >= o.r - EPS;
    }
    return true; // Dice, cube and other rectangular UI are not checkers.
  });
}
function line(a, b) {
  return { kind: "line", a, b, length: gap(a, b) };
}
function arc(c, a, sweep) {
  return { kind: "arc", c, a, sweep, length: Math.abs(sweep) * c.r };
}
function jet(span, s) {
  if (span.kind === "line") {
    const dx = (span.b.x - span.a.x) / span.length,
      dy = (span.b.y - span.a.y) / span.length;
    return [
      { x: span.a.x + dx * s, y: span.a.y + dy * s },
      { x: dx, y: dy },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }
  const { c } = span,
    sign = Math.sign(span.sweep),
    t = span.a + (sign * s) / c.r,
    co = Math.cos(t),
    si = Math.sin(t);
  return [
    { x: c.x + c.r * co, y: c.y + c.r * si },
    { x: -sign * si, y: sign * co },
    { x: -co / c.r, y: -si / c.r },
    { x: (sign * si) / c.r ** 2, y: (-sign * co) / c.r ** 2 },
  ];
}
function route(from, to, blockers) {
  const circles = [{ ...from, r: 0 }, { ...to, r: 0 }, ...blockers],
    nodes = [],
    edges = [],
    rings = circles.map(() => []);
  function node(i, p) {
    const angle = Math.atan2(p.y - circles[i].y, p.x - circles[i].x);
    const found = rings[i].find((n) => gap(nodes[n], p) < EPS);
    if (found !== undefined) return found;
    const id = nodes.length;
    nodes.push({ ...p, angle, circle: i });
    edges.push([]);
    rings[i].push(id);
    return id;
  }
  node(0, from);
  node(1, to);
  const join = (i, j, span) => edges[i].push({ to: j, span });
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i],
        b = circles[j],
        dx = b.x - a.x,
        dy = b.y - a.y,
        d2 = dx * dx + dy * dy;
      if (d2 < EPS) continue;
      for (const side of [1, -1])
        for (const sign of [-1, 1]) {
          const dr = a.r - side * b.r,
            h2 = d2 - dr * dr;
          if (h2 < -EPS) continue;
          const h = Math.sqrt(Math.max(0, h2)) * sign,
            nx = (dx * dr - dy * h) / d2,
            ny = (dy * dr + dx * h) / d2;
          const p = { x: a.x + nx * a.r, y: a.y + ny * a.r },
            q = { x: b.x + nx * side * b.r, y: b.y + ny * side * b.r };
          if (!within(p) || !within(q) || !segmentClear(p, q, blockers))
            continue;
          const u = node(i, p),
            v = node(j, q);
          join(u, v, line(p, q));
          join(v, u, line(q, p));
        }
    }
  for (let i = 2; i < circles.length; i++) {
    const c = circles[i],
      ring = rings[i].sort((a, b) => nodes[a].angle - nodes[b].angle);
    for (let k = 0; k < ring.length; k++) {
      const u = ring[k],
        v = ring[(k + 1) % ring.length],
        a = nodes[u].angle;
      let sweep = (nodes[v].angle - a + TAU) % TAU;
      if (sweep < EPS) continue;
      const span = arc(c, a, sweep),
        steps = Math.ceil(span.length / 3);
      let clear = true;
      for (let n = 0; n <= steps; n++) {
        const p = jet(span, (span.length * n) / steps)[0];
        if (
          !within(p) ||
          blockers.some((o) => o !== c && gap(o, p) < o.r - EPS)
        ) {
          clear = false;
          break;
        }
      }
      if (clear) {
        join(u, v, span);
        join(v, u, arc(c, a + sweep, -sweep));
      }
    }
  }
  const costs = new Float64Array(nodes.length).fill(Infinity),
    prev = new Array(nodes.length),
    heap = [];
  function push(id, cost) {
    let i = heap.length;
    heap.push(null);
    while (i && heap[(i - 1) >> 1].cost > cost) {
      heap[i] = heap[(i - 1) >> 1];
      i = (i - 1) >> 1;
    }
    heap[i] = { id, cost };
  }
  function pop() {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let j = i * 2 + 1;
        if (j + 1 < heap.length && heap[j + 1].cost < heap[j].cost) j++;
        if (heap[j].cost >= last.cost) break;
        heap[i] = heap[j];
        i = j;
      }
      heap[i] = last;
    }
    return first;
  }
  costs[0] = 0;
  push(0, 0);
  while (heap.length) {
    const { id, cost } = pop();
    if (cost !== costs[id]) continue;
    if (id === 1) {
      const spans = [];
      let at = 1;
      while (at !== 0) {
        spans.push(prev[at].span);
        at = prev[at].from;
      }
      return spans.reverse().filter((s) => s.length > EPS);
    }
    for (const e of edges[id]) {
      const next = cost + e.span.length;
      if (next >= costs[e.to]) continue;
      costs[e.to] = next;
      prev[e.to] = { from: id, span: e.span };
      push(e.to, next);
    }
  }
  return null;
}
// Degree-seven Hermite interpolation matches position, tangent, curvature and
// third derivative at both ends. Coefficients use normalized t in [0,1].
export function smoothJoin(left, right, length) {
  return ["x", "y"].map((axis) => {
    const c = [
      left[0][axis],
      left[1][axis] * length,
      (left[2][axis] * length ** 2) / 2,
      (left[3][axis] * length ** 3) / 6,
    ];
    const a = right[0][axis] - c.reduce((n, v) => n + v, 0),
      b = right[1][axis] * length - c[1] - 2 * c[2] - 3 * c[3],
      d = right[2][axis] * length ** 2 - 2 * c[2] - 6 * c[3],
      e = right[3][axis] * length ** 3 - 6 * c[3];
    return [
      ...c,
      35 * a - 15 * b + 2.5 * d - e / 6,
      -84 * a + 39 * b - 7 * d + e / 2,
      70 * a - 34 * b + 6.5 * d - e / 2,
      -20 * a + 10 * b - 2 * d + e / 6,
    ];
  });
}
function poly(c, t, derivative = 0) {
  return c.reduce((sum, v, i) => {
    if (i < derivative) return sum;
    let k = 1;
    for (let j = 0; j < derivative; j++) k *= i - j;
    return sum + v * k * t ** (i - derivative);
  }, 0);
}
const dot = (a, b) => a.x * b.x + a.y * b.y;
function quadraticRoots(a, b, c) {
  if (Math.abs(a) < EPS) return Math.abs(b) < EPS ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  return d < 0 ? [] : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}
function bowCurve(from, to, height) {
  const length = gap(from, to), dx = to.x - from.x, dy = to.y - from.y;
  const normal = { x: -dy / length, y: dx / length };
  const a = { x: -4 * height * normal.x, y: -4 * height * normal.y };
  const b = { x: dx - a.x, y: dy - a.y };
  return {
    a, b, from, to, length, height,
    at: t => ({ x: from.x + b.x * t + a.x * t * t, y: from.y + b.y * t + a.y * t * t }),
    tangent: t => ({ x: b.x + 2 * a.x * t, y: b.y + 2 * a.y * t }),
  };
}
function bowClear(curve, blockers) {
  const { a, b, from } = curve;
  // Exact coordinate extrema keep the entire curve inside the board.
  const extrema = [0, 1, ...["x", "y"].map(k => -b[k] / (2 * a[k])).filter(t => t > 0 && t < 1)];
  if (extrema.some(t => !within(curve.at(t)))) return false;
  return blockers.every(o => {
    const c = { x: from.x - o.x, y: from.y - o.y };
    // The squared distance's derivative is cubic. Split it at its extrema,
    // then find every root on monotone intervals; no sparse collision samples.
    const coeff = [dot(b, c), dot(b, b) + 2 * dot(a, c), 3 * dot(a, b), 2 * dot(a, a)];
    const cuts = [0, ...quadraticRoots(3 * coeff[3], 2 * coeff[2], coeff[1]).filter(t => t > 0 && t < 1).sort((x, y) => x - y), 1];
    const candidates = [...cuts];
    for (let i = 1; i < cuts.length; i++) {
      let low = cuts[i - 1], high = cuts[i], sign = poly(coeff, low);
      if (sign * poly(coeff, high) >= 0) continue;
      for (let j = 0; j < 32; j++) {
        const mid = (low + high) / 2;
        if (sign * poly(coeff, mid) <= 0) high = mid;
        else low = mid;
      }
      candidates.push((low + high) / 2);
    }
    return candidates.every(t => gap(curve.at(t), o) >= o.r - EPS);
  });
}
function bowRoute(from, to, height) {
  const curve = bowCurve(from, to, height);
  if (gap(curve.at(0.5), from) <= 28) return null;
  let low = 0, high = 0.5;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (gap(curve.at(mid), from) < 28) low = mid;
    else high = mid;
  }
  const start = high, end = 1 - high, first = curve.at(start), tip = curve.at(end);
  const tangent = curve.tangent(start);
  const control = { x: first.x + tangent.x * (end - start) / 2, y: first.y + tangent.y * (end - start) / 2 };
  const format = p => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  const n = Math.ceil((curve.length + 4 * Math.abs(height)) * (end - start) / 2);
  const direction = curve.tangent(end);
  return {
    d: `M${format(first)} Q${format(control)} ${format(tip)}`,
    points: Array.from({ length: n + 1 }, (_, i) => curve.at(start + (end - start) * i / n)),
    tip, angle: Math.atan2(direction.y, direction.x) * 180 / Math.PI,
    routed: true, kind: height ? "bow" : "straight",
  };
}
function broadBow(from, to, blockers) {
  // For this symmetric quadratic family, less deflection also means less
  // total turning. Search both sides and refine the first clear interval.
  // A single bow has no inflections or straight/arc junctions to visibly kink.
  for (let height = 4; height <= 660; height += 4) {
    const options = [];
    for (const sign of [1, -1]) {
      if (!bowClear(bowCurve(from, to, height * sign), blockers)) continue;
      let low = height - 4, high = height;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        if (bowClear(bowCurve(from, to, mid * sign), blockers)) high = mid;
        else low = mid;
      }
      options.push({ height: high, sign });
    }
    if (options.length) {
      const best = options.sort((a, b) => a.height - b.height)[0];
      return bowRoute(from, to, best.height * best.sign);
    }
  }
  return null;
}
export function routeArrow(from, to, obstacles) {
  if (gap(from, to) < 1) return null;
  const blockers = [];
  for (const o of obstacles) {
    if (!Number.isFinite(o.r) || gap(o, from) < 1 || gap(o, to) < 1) continue;
    const c = { ...o, r: Math.max(ARROW_CLEARANCE, o.r) };
    if (!blockers.some((b) => gap(b, c) < EPS && Math.abs(b.r - c.r) < EPS))
      blockers.push(c);
  }
  if (segmentClear(from, to, blockers)) return bowRoute(from, to, 0);
  const bow = broadBow(from, to, blockers);
  if (bow) return bow;
  const spans = route(from, to, blockers),
    routed = !!spans;
  const path = spans || [line(from, to)],
    offsets = [0];
  for (const s of path) offsets.push(offsets.at(-1) + s.length);
  const length = offsets.at(-1);
  const blends = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      w = Math.min(5, a.length / 3, b.length / 3);
    if (w < EPS) continue;
    const left = jet(a, a.length - w),
      right = jet(b, w),
      coeff = smoothJoin(left, right, w * 2);
    // Keep transitions short: numerical clearance error stays subpixel while
    // most of each bend remains an exact 44px-radius circular arc.
    blends.push({ start: offsets[i] - w, end: offsets[i] + w, coeff });
  }
  function sample(s) {
    const blend = blends.find((b) => s >= b.start && s <= b.end);
    if (blend) {
      const t = (s - blend.start) / (blend.end - blend.start);
      return { x: poly(blend.coeff[0], t), y: poly(blend.coeff[1], t) };
    }
    let i = path.findIndex((_, i) => s <= offsets[i + 1]);
    if (i < 0) i = path.length - 1;
    return jet(path[i], Math.max(0, s - offsets[i]))[0];
  }
  let start = 0,
    end = length;
  while (start < length && gap(sample(start), from) < 28) start += 0.25;
  while (end > start && gap(sample(end), to) < 28) end -= 0.25;
  if (end <= start) return null;
  // Hermite cubic sampling of the smooth analytic path (<=2 board pixels per
  // segment). This preserves tangents without visible polyline facets.
  const points = [],
    n = Math.ceil((end - start) / 2),
    format = (p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  let d = "";
  const tangent = (s) => {
    const a = sample(Math.max(0, s - 0.001)),
      b = sample(Math.min(length, s + 0.001));
    return { x: (b.x - a.x) / 0.002, y: (b.y - a.y) / 0.002 };
  };
  for (let i = 0; i <= n; i++) {
    const s = start + ((end - start) * i) / n,
      p = sample(s);
    points.push(p);
    if (!i) {
      d = `M${format(p)}`;
      continue;
    }
    const prev = points[i - 1],
      h = (end - start) / n,
      t0 = tangent(s - h),
      t1 = tangent(s);
    d += ` C${format({ x: prev.x + (t0.x * h) / 3, y: prev.y + (t0.y * h) / 3 })} ${format({ x: p.x - (t1.x * h) / 3, y: p.y - (t1.y * h) / 3 })} ${format(p)}`;
  }
  const tip = points.at(-1),
    dir = tangent(end);
  return {
    d,
    points,
    tip,
    angle: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
    routed,
  };
}
