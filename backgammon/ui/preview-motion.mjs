// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation-only transitions between study positions. Snapshot the visible
// frame before rebuilding the shared SVG; never replay from a different state.
import { checkerFlight, motionTiming } from './motion.mjs';
const NS = 'http://www.w3.org/2000/svg';
const duration = 560, easing = 'cubic-bezier(.4,0,.2,1)';
let serial = 0;
const group = () => document.createElementNS(NS, 'g');

function freeze(node) {
  const clone = node.cloneNode(true);
  const originals = [node, ...node.querySelectorAll('*')];
  [clone, ...clone.querySelectorAll('*')].forEach((part, i) => {
    const style = getComputedStyle(originals[i]);
    for (const property of ['opacity', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset'])
      part.style.setProperty(property, style.getPropertyValue(property));
  });
  return clone;
}

function sprites(svg) {
  const result = [];
  for (const point of svg.querySelectorAll('[data-point]')) {
    const location = point.dataset.point;
    for (const [index, node] of [...point.querySelectorAll(':scope > .checker,:scope > .off-checker')].entries()) {
      if (node.dataset.previewHidden !== undefined) continue;
      const strip = node.matches('.off-checker'), face = strip ? node : node.querySelector('circle');
      const x = Number(face.getAttribute(strip ? 'x' : 'cx')) + (strip ? Number(face.getAttribute('width')) / 2 : 0);
      const y = Number(face.getAttribute(strip ? 'y' : 'cy')) + (strip ? Number(face.getAttribute('height')) / 2 : 0);
      const local = group();
      local.setAttribute('transform', `translate(${-x} ${-y})`);
      local.append(freeze(node));
      const summary = location.startsWith('off') && !strip;
      const count = Number(node.querySelector('text')?.textContent || 1);
      result.push({ key: `${location}:${summary ? 'count' : strip ? `strip${index}` : index}`, node, x, y,
        player: strip ? Number(location.at(-1)) : Number(node.dataset.player),
        summary, units: summary ? 0 : location.startsWith('bar') ? count : !strip && index === 4 ? Math.max(1, count - 4) : 1,
        faces: [{ node: local, opacity: 1 }] });
    }
  }
  return result;
}

export function capturePreview(svg) {
  const pieces = sprites(svg);
  for (const node of svg.querySelectorAll('.preview-motion-piece')) {
    const pose = new DOMMatrix(getComputedStyle(node).transform);
    const faces = [...node.children].map(face => ({ node: face.firstChild.cloneNode(true),
      opacity: Number(getComputedStyle(face).opacity) })).filter(face => face.opacity > .005);
    pieces.push({ ...node.previewSprite, x: pose.e, y: pose.f, scale: pose.a, faces });
  }
  const ink = [...svg.querySelectorAll('.last-move-ghost,.last-move-arrows')]
    .filter(node => !node.closest('.preview-motion-layer') && Number(getComputedStyle(node).opacity) > .005).map(freeze);
  // Preserve outgoing ink as well when another choice interrupts the fade.
  for (const node of svg.querySelectorAll('.preview-motion-ink')) {
    if (Number(getComputedStyle(node).opacity) < .005) continue;
    const clone = freeze(node); clone.removeAttribute('class'); ink.push(clone);
  }
  return { pieces, ink };
}

export function clearPreview(svg) {
  svg.querySelectorAll('.preview-motion-layer').forEach(node => node.remove());
  svg.querySelectorAll('[data-preview-hidden]').forEach(node => {
    node.style.opacity = ''; delete node.dataset.previewHidden;
  });
}

function hidden(node) { node.dataset.previewHidden = ''; node.style.opacity = '0'; }

export function animatePreview(svg, snapshot, animations) {
  // Native last-move entrances belong to live play. Study switches coordinate
  // every new decoration on this transition's clock instead.
  for (const animation of animations)
    if (['last-move-entry', 'move-arrow-entry'].includes(animation.id)) animation.cancel();
  const layer = group();
  layer.classList.add('preview-motion-layer');
  layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('pointer-events', 'none');
  svg.append(layer);
  let pending = 0;
  const animate = (node, frames, done = () => {}, options = {}) => {
    pending++;
    const a = node.animate(frames, motionTiming({ duration, easing, fill: 'both', id: 'preview-transition', ...options }));
    animations.push(a);
    a.finished.then(() => { done(); a.cancel(); if (!--pending) layer.remove(); }).catch(() => {});
  };
  // Copied arrow masks need their own IDs while the next trace is on screen.
  for (const old of snapshot.ink) {
    for (const idNode of old.querySelectorAll('[id]')) {
      const id = idNode.id, next = `${id}-preview-${++serial}`;
      idNode.id = next;
      for (const n of old.querySelectorAll('[mask]'))
        if (n.getAttribute('mask') === `url(#${id})`) n.setAttribute('mask', `url(#${next})`);
    }
    const outgoing = group(); outgoing.classList.add('preview-motion-ink'); outgoing.append(old); layer.append(outgoing);
    animate(outgoing, [{ opacity: 1 }, { opacity: 0 }], () => outgoing.remove(), { duration: 280 });
  }
  for (const node of svg.querySelectorAll('.last-move-ghost,.last-move-arrows')) {
    if (node.closest('.preview-motion-layer')) continue;
    animate(node, [{ opacity: 0 }, { opacity: getComputedStyle(node).opacity }]);
  }

  const targets = sprites(svg), unused = new Set(snapshot.pieces);
  const pairs = targets.map(to => {
    const from = snapshot.pieces.find(p => unused.has(p) && p.key === to.key && p.player === to.player);
    if (from) unused.delete(from);
    return { from, to };
  });
  // Retain stationary stack slots first; only the pieces that changed position
  // travel. Checkers of the same color are interchangeable display identities.
  for (const pair of pairs.filter(pair => !pair.from && !pair.to.summary)) {
    pair.from = [...unused].filter(p => p.player === pair.to.player && !p.summary)
      .sort((a, b) => Math.hypot(a.x - pair.to.x, a.y - pair.to.y) - Math.hypot(b.x - pair.to.x, b.y - pair.to.y))[0];
    if (pair.from) unused.delete(pair.from);
  }
  const donors = pairs.filter(p => p.from && p.from.units > p.to.units)
    .map(p => ({ from: p.from, remaining: p.from.units - p.to.units }));
  for (const pair of pairs.filter(p => !p.from && !p.to.summary)) {
    const donor = donors.find(p => p.remaining && p.from.player === pair.to.player);
    if (donor) {
      donor.remaining--;
      pair.from = { ...donor.from, faces: donor.from.faces.map(face => {
        const node = face.node.cloneNode(true); node.querySelectorAll('text').forEach(n => n.remove());
        return { ...face, node };
      }) };
    }
  }
  const receivers = pairs.filter(p => p.from && p.to.units > p.from.units)
    .map(p => ({ to: p.to, remaining: p.to.units - p.from.units }));
  for (const from of unused) {
    // Compressed stacks/bar counters can absorb a checker without creating a
    // new visible slot. Let it arrive there before fading into the stack.
    const receiver = !from.summary && receivers.find(p => p.remaining && p.to.player === from.player);
    if (receiver) receiver.remaining--;
    const to = receiver?.to;
    pairs.push({ from, to: { ...from, x: to?.x ?? from.x, y: to?.y ?? from.y, node: null, faces: [] } });
  }
  for (const { from, to } of pairs) {
    const unchanged = from && from.x === to.x && from.y === to.y && from.faces.length === 1 &&
      from.faces[0].opacity === 1 && from.faces[0].node.isEqualNode(to.faces[0]?.node);
    if (unchanged) continue;
    if (to.node) hidden(to.node);
    const moving = group(); moving.classList.add('preview-motion-piece');
    moving.style.isolation = 'isolate';
    moving.previewSprite = { key: to.key, player: to.player, summary: to.summary, units: to.units };
    layer.append(moving);
    for (const face of from?.faces || []) {
      const old = group(); old.append(face.node.cloneNode(true)); moving.append(old);
      old.style.mixBlendMode = 'plus-lighter';
      animate(old, [{ opacity: face.opacity }, { opacity: 0 }]);
    }
    for (const face of to.faces) {
      const next = group(); next.append(face.node); moving.append(next);
      next.style.mixBlendMode = 'plus-lighter';
      animate(next, [{ opacity: 0 }, { opacity: 1 }]);
    }
    const start = from || to;
    const frames = start.x === to.x && start.y === to.y
      ? [{ transform: `translate(${to.x}px, ${to.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }]
      : checkerFlight([start, to]).frames.map(frame => {
        const t = frame.offset, u = t * t * t * (10 + t * (-15 + 6 * t));
        return { ...frame, transform: frame.transform.replace(/scale\(([^)]+)\)/,
          (_, scale) => `scale(${Number(scale) + ((start.scale || 1) - 1) * (1 - u)})`) };
      });
    animate(moving, frames, () => {
      moving.remove();
      if (to.node) { to.node.style.opacity = ''; delete to.node.dataset.previewHidden; }
    }, { easing: 'linear' });
  }
  if (!pending) layer.remove();
}
