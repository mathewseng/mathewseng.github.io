// SPDX-License-Identifier: GPL-3.0-or-later
// Pure display routing, never move legality. A small, fixed board-space grid
// keeps arrows in the gaps between stacks; string pulling removes grid zigzags.
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function segmentClear(a, b, obstacles) {
  return obstacles.every(o => {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (o.r !== undefined) {
      const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) >= o.r;
    }
    let low = 0, high = 1;
    for (const [start, delta, min, max] of [[a.x, dx, o.x, o.x + o.width], [a.y, dy, o.y, o.y + o.height]]) {
      if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return true; }
      else {
        let t0 = (min - start) / delta, t1 = (max - start) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        low = Math.max(low, t0); high = Math.min(high, t1);
        if (low > high) return true;
      }
    }
    return false;
  });
}
function search(from, to, obstacles) {
  const width = 85, height = 60, size = width * height;
  const pos = id => ({ x: 24 + id % width * 10, y: 34 + Math.floor(id / width) * 10 });
  const id = p => Math.max(0, Math.min(height - 1, Math.round((p.y - 34) / 10))) * width +
    Math.max(0, Math.min(width - 1, Math.round((p.x - 24) / 10)));
  const start = id(from), end = id(to), heap = [];
  const costs = new Float64Array(size).fill(Infinity), parent = new Int32Array(size).fill(-1), closed = new Uint8Array(size);
  function push(node, cost) {
    const entry = { node, cost }; let i = heap.length;
    heap.push(entry);
    while (i && heap[(i - 1) >> 1].cost > cost) { heap[i] = heap[(i - 1) >> 1]; i = (i - 1) >> 1; }
    heap[i] = entry;
  }
  function pop() {
    const best = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return best.node;
  }
  costs[start] = 0; push(start, gap(from, to));
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === end) {
      const points = [to]; let at = current;
      while (at !== -1) { points.push(pos(at)); at = parent[at]; }
      points.push(from); points.reverse();
      const simple = [from]; let i = 0;
      while (i < points.length - 1) {
        let next = points.length - 1;
        while (next > i + 1 && !segmentClear(points[i], points[next], obstacles)) next--;
        simple.push(points[next]); i = next;
      }
      return simple;
    }
    const a = pos(current);
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const x = current % width + dx, y = Math.floor(current / width) + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const next = y * width + x, b = pos(next), cost = costs[current] + gap(a, b);
      if (closed[next] || cost >= costs[next] || !segmentClear(a, b, obstacles)) continue;
      costs[next] = cost; parent[next] = current; push(next, cost + gap(b, to));
    }
  }
  return null;
}
function trim(points, radius) {
  const center = points[0];
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (gap(center, b) <= radius) continue;
    const a = points[i - 1], dx = b.x - a.x, dy = b.y - a.y;
    const ox = a.x - center.x, oy = a.y - center.y;
    const length2 = dx * dx + dy * dy, dot = ox * dx + oy * dy;
    const t = (-dot + Math.sqrt(Math.max(0, dot * dot - length2 *
      (ox * ox + oy * oy - radius * radius)))) / length2;
    return [{ x: a.x + dx * t, y: a.y + dy * t }, ...points.slice(i)];
  }
  return [points.at(-1)];
}
export function routeArrow(from, to, obstacles) {
  if (gap(from, to) < 1) return null;
  const blockers = obstacles.filter(o => o.r === undefined || (gap(o, from) > 1 && gap(o, to) > 1));
  let points, bowed = false;
  // A small bow into the open part of the board keeps adjacent-point arrows
  // legible instead of squeezing the whole arrow into the gap between rims.
  const sameHalf = (from.y < 330) === (to.y < 330);
  if (sameHalf) {
    const via = { x: (from.x + to.x) / 2,
      y: from.y < 330 ? Math.max(from.y, to.y) + 48 : Math.min(from.y, to.y) - 48 };
    // Check a broad rounding as well as the legs, since rounding cuts inward.
    // On longer transfers a gentle arc is easier to follow than a hard angle.
    const roundClear = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20, u = 1 - t;
      return { x: u*u*from.x + 2*u*t*via.x + t*t*to.x,
        y: u*u*from.y + 2*u*t*via.y + t*t*to.y };
    }).every((p,i,all) => !i || segmentClear(all[i-1],p,blockers));
    if (roundClear && segmentClear(from, via, blockers) && segmentClear(via, to, blockers)) {
      points = [from, via, to]; bowed = true;
    }
  }
  points ||= segmentClear(from, to, blockers) ? [from, to] : search(from, to, blockers);
  const routed = !!points;
  // A mask in the renderer protects checker faces even in a sealed cluster
  // where no continuous route fits. The arrow is never a new board hit target.
  points ||= [from, to];
  points = points.filter((p, i) => !i || gap(p, points[i - 1]) > 0.01);
  points = trim(trim(points, 28).reverse(), 28).reverse();
  if (points.length < 2) return null;
  const n = v => Number(v.toFixed(2)), coord = p => `${n(p.x)} ${n(p.y)}`;
  let d = `M${coord(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], a = points[i - 1], b = points[i + 1];
    let radius = Math.min(bowed ? 80 : 14, gap(a, p) / 2, gap(p, b) / 2);
    const near = (other) => ({ x: p.x + (other.x - p.x) * radius / gap(other, p),
      y: p.y + (other.y - p.y) * radius / gap(other, p) });
    let before, after;
    for (;;) {
      before = near(a); after = near(b);
      const samples = Array.from({ length: 17 }, (_, j) => {
        const t = j / 16, u = 1 - t;
        return { x: u*u*before.x + 2*u*t*p.x + t*t*after.x,
          y: u*u*before.y + 2*u*t*p.y + t*t*after.y };
      });
      if (!routed || samples.every((q, j) => !j || segmentClear(samples[j-1], q, blockers))) break;
      radius /= 2;
      if (radius < 0.5) { before = p; after = p; break; }
    }
    d += ` L${coord(before)} Q${coord(p)} ${coord(after)}`;
  }
  const tip = points.at(-1), prior = points.at(-2);
  d += ` L${coord(tip)}`;
  return { d, points, tip, angle: Math.atan2(tip.y - prior.y, tip.x - prior.x) * 180 / Math.PI, routed };
}
