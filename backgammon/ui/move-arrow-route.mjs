// SPDX-License-Identifier: GPL-3.0-or-later
// Display geometry only. Tangents and circular arcs follow the union of checker
// clearance discs (22px checker + 22px breathing room). Short C3 Hermite blends
// join straight/circular spans; the SVG approximation is subpixel, not a claim
// that a curved path or an animated checker has literally zero jerk.
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
    let low = 0,
      high = 1;
    for (const [s, d, min, max] of [
      [a.x, dx, o.x, o.x + o.width],
      [a.y, dy, o.y, o.y + o.height],
    ]) {
      if (Math.abs(d) < EPS) {
        if (s < min || s > max) return true;
      } else {
        let t0 = (min - s) / d,
          t1 = (max - s) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        low = Math.max(low, t0);
        high = Math.min(high, t1);
        if (low > high) return true;
      }
    }
    return false;
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
export function routeArrow(from, to, obstacles) {
  if (gap(from, to) < 1) return null;
  const blockers = [];
  for (const o of obstacles) {
    if (o.r !== undefined && (gap(o, from) < 1 || gap(o, to) < 1)) continue;
    const c =
      o.r === undefined
        ? {
            x: o.x + o.width / 2,
            y: o.y + o.height / 2,
            r: Math.hypot(o.width, o.height) / 2 + 2,
          }
        : { ...o, r: Math.max(ARROW_CLEARANCE, o.r) };
    if (!blockers.some((b) => gap(b, c) < EPS && Math.abs(b.r - c.r) < EPS))
      blockers.push(c);
  }
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
