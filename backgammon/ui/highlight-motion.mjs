// SPDX-License-Identifier: GPL-3.0-or-later
// Decorative SVG fragments only. The live point classes/hit regions always
// describe the current legal actions, even while an old highlight fades away.
import { motionTiming } from "./motion.mjs";
import { animate } from "./animation-batch.mjs";
const fragments = '.draft-undo-tint,.draft-undo-mark,.point-glow,.point-accent,.point-wash,.source-ring,.landing-ring,.ring-halo,.destination-badge,.destination-die';
const paint = ['display', 'fill', 'fill-opacity', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'filter', 'vector-effect', 'font-family', 'font-size',
  'font-weight', 'text-anchor'];
const timing = { duration: 280, easing: 'cubic-bezier(.2,.75,.3,1)', id: 'board-highlight' };

// Chromium reports a stroke width written as calc(…·var(--ring-scale)) as
// "calc(1.85px)" on the live node but as "1.85px" once frozen inline, which
// would stop an outgoing ring from matching its returning twin.
const resolved = value => value.replace(/^calc\((-?[\d.]+px)\)$/, "$1");

function snapshot(node) {
  const style = getComputedStyle(node);
  if (style.display === 'none') return null;
  const clone = node.cloneNode(true);
  clone.removeAttribute('data-highlight-exit');
  // Freeze inherited paint so an outgoing selection does not acquire the new
  // destination's colors/styles. Opacity is tracked separately for interruption.
  for (const property of paint) clone.style.setProperty(property, resolved(style.getPropertyValue(property)));
  clone.style.opacity = '1';
  clone.style.pointerEvents = 'none';
  clone.style.transition = 'none';
  clone.setAttribute('aria-hidden', 'true');
  return { key: node.dataset.highlight, point: node.closest('[data-point]').dataset.point,
    opacity: Number(style.opacity), clone, signature: clone.outerHTML };
}

export function captureHighlights(board) {
  return [...board.querySelectorAll('[data-highlight]')].map(snapshot).filter(Boolean);
}

export function clearHighlightExits(board) {
  board.querySelectorAll('[data-highlight-exit]').forEach(node => node.remove());
}

export function animateHighlights(board, previous, animations, enabled) {
  const old = [...previous], nodes = [];
  // Finish DOM writes before reading paint, then start animations together.
  // Reading after each animate() forces a fresh style/layout pass on mobile.
  for (const point of board.querySelectorAll('.point')) {
    const counts = new Map();
    for (const node of point.querySelectorAll(fragments)) {
      const kind = node.classList[0], index = counts.get(kind) || 0;
      counts.set(kind, index + 1);
      const key = `${point.dataset.point}:${kind}:${index}`;
      if (node.dataset.highlight !== key) {
        node.dataset.highlight = key;
        node.setAttribute('aria-hidden', 'true');
        node.style.pointerEvents = 'none';
      }
      nodes.push(node);
    }
  }
  const targets = enabled ? nodes.map(node => ({ node, current: snapshot(node) })) : [];
  for (const { node, current } of targets) {
    if (!current) continue;
    const found = old.findIndex(item => item.key === current.key && item.signature === current.signature);
    const from = found < 0 ? 0 : old.splice(found, 1)[0].opacity;
    if (from !== current.opacity) animations.push(animate(node,
      [{ opacity: from }, { opacity: current.opacity }], motionTiming(timing), animations));
  }
  if (!enabled) return;
  for (const item of old) {
    if (item.opacity <= 0) continue;
    const point = board.querySelector(`[data-point="${item.point}"]`);
    if (!point) continue;
    const node = item.clone;
    node.dataset.highlightExit = '';
    // Washes/glows stay behind the checkers. Rings and labels stay above them.
    const beneath = node.matches('.point-glow,.point-accent,.point-wash');
    point.insertBefore(node, beneath ? point.querySelector('.checker') : null);
    const animation = animate(node, [{ opacity: item.opacity }, { opacity: 0 }], { ...motionTiming(timing), fill: 'forwards' }, animations);
    animation.onfinish = () => node.remove();
    animations.push(animation);
  }
}
