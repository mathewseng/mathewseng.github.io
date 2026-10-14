// SPDX-License-Identifier: GPL-3.0-or-later
// Decorative SVG fragments only. The live point classes/hit regions always
// describe the current legal actions, even while an old highlight fades away.
const fragments = '.point-glow,.point-accent,.point-wash,.source-ring,.landing-ring,.ring-halo,.destination-badge,.destination-die';
const paint = ['display', 'fill', 'fill-opacity', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'filter', 'vector-effect', 'font-family', 'font-size',
  'font-weight', 'text-anchor'];
const timing = { duration: 280, easing: 'cubic-bezier(.2,.75,.3,1)', id: 'board-highlight' };

function snapshot(node) {
  const style = getComputedStyle(node);
  if (style.display === 'none') return null;
  const clone = node.cloneNode(true);
  clone.removeAttribute('data-highlight-exit');
  // Freeze inherited paint so an outgoing selection does not acquire the new
  // destination's colors/styles. Opacity is tracked separately for interruption.
  for (const property of paint) clone.style.setProperty(property, style.getPropertyValue(property));
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
  const old = [...previous];
  for (const point of board.querySelectorAll('.point')) {
    const counts = new Map();
    for (const node of point.querySelectorAll(fragments)) {
      const kind = node.classList[0], index = counts.get(kind) || 0;
      counts.set(kind, index + 1);
      node.dataset.highlight = `${point.dataset.point}:${kind}:${index}`;
      node.setAttribute('aria-hidden', 'true');
      node.style.pointerEvents = 'none';
      if (!enabled) continue;
      const current = snapshot(node);
      if (!current) continue;
      const found = old.findIndex(item => item.key === current.key && item.signature === current.signature);
      const from = found < 0 ? 0 : old.splice(found, 1)[0].opacity;
      if (from !== current.opacity) animations.push(node.animate(
        [{ opacity: from }, { opacity: current.opacity }], timing));
    }
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
    const animation = node.animate([{ opacity: item.opacity }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    animation.onfinish = () => node.remove();
    animations.push(animation);
  }
}
