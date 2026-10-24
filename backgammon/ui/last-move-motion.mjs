// SPDX-License-Identifier: GPL-3.0-or-later
// Coordinate decorative previous-move ink. Legal targets and checker faces
// always describe the current board, independently of these transitions.
import { animate, resumeAnimation } from "./animation-batch.mjs";
const NS = 'http://www.w3.org/2000/svg';
export const LAST_MOVE_ENTRY_TIMING = { duration: 760, easing: 'cubic-bezier(.4,0,.2,1)' };
const timing = { duration: 320, easing: 'cubic-bezier(.2,.75,.3,1)',
  fill: 'forwards', id: 'last-move-exit' };

const markers = board => [...board.querySelectorAll('.last-move-ghost,.last-move-ring,.off-checker.last-moved-checker')]
  .filter(node => !node.closest('[data-last-move-exit]'));

export function captureLastMoveEntry(board) {
  return markers(board).map(node => {
    const a = node.getAnimations().find(a => a.id === 'last-move-entry' && a.playState !== 'finished');
    return a ? { time: a.currentTime, frames: a.effect.getKeyframes() } : null;
  });
}

export function animateLastMoveEntry(board, previous, animations, fresh) {
  const targets = markers(board).map(node => {
    const property = node.matches('.off-checker') ? 'strokeOpacity' : 'opacity';
    return { node, property, target: getComputedStyle(node)[property] };
  });
  targets.forEach(({ node, property, target }, index) => {
    const pose = fresh ? null : previous[index];
    if (!fresh && !pose) return;
    // Off-tray strips are real checkers, so fade only their outline. Ghosts
    // and separate checker rings can fade as a whole, retaining their opacity.
    const animation = animate(node, pose?.frames || [{ [property]: 0 }, { [property]: target }],
      { ...LAST_MOVE_ENTRY_TIMING, id: 'last-move-entry' }, animations);
    if (pose) resumeAnimation(animation, pose.time, animations);
    animations.push(animation);
  });
}

export function clearLastMoveExits(board) {
  board.querySelectorAll('[data-last-move-exit]').forEach(node => node.remove());
}

export function captureLastMoveExit(board, starting) {
  if (!starting) return [...board.querySelectorAll('[data-last-move-exit]')].map(node => ({
    node: node.cloneNode(true),
    elapsed: Number(node.getAnimations().find(a => a.id === timing.id)?.currentTime ?? timing.duration),
  }));
  return [...board.querySelectorAll('.last-move-ghost,.last-move-arrows,.last-move-ring,.off-checker.last-moved-checker')].map(source => {
    const ink = source.cloneNode(true), node = document.createElementNS(NS, 'g');
    // A roll can interrupt an arrow drawing in. Preserve its visible length and
    // opacity instead of flashing a fully drawn arrow before fading it out.
    const originals = [source, ...source.querySelectorAll('*')];
    [ink, ...ink.querySelectorAll('*')].forEach((part, index) => {
      const style = getComputedStyle(originals[index]);
      for (const property of ['opacity', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset'])
        part.style.setProperty(property, style.getPropertyValue(property));
    });
    if (source.matches('.off-checker')) ink.setAttribute('fill', 'none');
    node.dataset.lastMoveExit = source.matches('.last-move-arrows') ? 'arrows'
      : source.matches('.last-move-ghost') ? 'ghost' : 'ring';
    if (source.closest('[data-point]')) node.dataset.exitPoint = source.closest('[data-point]').dataset.point;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('pointer-events', 'none');
    node.append(ink);
    return { node, elapsed: 0 };
  });
}

export function animateLastMoveExit(board, previous, animations) {
  for (const { node, elapsed } of previous) {
    if (elapsed >= timing.duration) continue;
    if (node.dataset.lastMoveExit === 'arrows') {
      // New dice are drawn above the old paths. Also mask any checker that the
      // player has already moved during the fade, without changing the path.
      const mask = node.querySelector('mask');
      if (mask) {
        mask.querySelectorAll('[data-exit-mask]').forEach(n => n.remove());
        for (const face of board.querySelectorAll('.checker > circle:first-child')) {
          const disc = document.createElementNS(NS, 'circle');
          for (const attr of ['cx', 'cy']) disc.setAttribute(attr, face.getAttribute(attr));
          disc.setAttribute('r', '25'); disc.setAttribute('fill', 'black');
          disc.dataset.exitMask = '';
          mask.append(disc);
        }
      }
      board.insertBefore(node, board.querySelector('.board-dice'));
    } else {
      const point = board.querySelector(`[data-point="${node.dataset.exitPoint}"]`);
      if (!point) continue;
      point.insertBefore(node, node.dataset.lastMoveExit === 'ghost' ? point.querySelector('.checker') : null);
    }
    const animation = animate(node, [{ opacity: 1 }, { opacity: 0 }], timing, animations);
    // Continue the same curve across selection/undo rerenders, rather than
    // restarting (and potentially prolonging) a fade on every interaction.
    resumeAnimation(animation, elapsed, animations);
    animation.onfinish = () => node.remove();
    animations.push(animation);
  }
}
