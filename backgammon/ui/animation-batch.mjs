// SPDX-License-Identifier: GPL-3.0-or-later
// Read every resting SVG pose before starting any animation. Starting WAAPI
// between computed-style reads invalidates style repeatedly within one frame.
const batches = new WeakMap();
export function beginAnimationBatch(animations) { batches.set(animations, []); }
export function animate(node, frames, options, animations) {
  const pending = batches.get(animations);
  if (!pending) return node.animate(frames, options);
  const animation = new Animation(new KeyframeEffect(node, frames, options), node.ownerDocument.timeline);
  animation.id = options.id || "";
  pending.push({animation, time:null});
  return animation;
}
export function resumeAnimation(animation, time, animations) {
  const entry = batches.get(animations)?.find(item => item.animation === animation);
  if (entry) entry.time = time;
  else animation.currentTime = time;
}
export function finishAnimationBatch(animations) {
  const pending = batches.get(animations) || [];
  batches.delete(animations);
  for (const {animation, time} of pending) {
    animation.play();
    if (time !== null) animation.currentTime = time;
  }
}
