// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeMotionScale } from "../core/motion.mjs";

export function motionScale() {
  const value = globalThis.document?.documentElement?.dataset.motionScale;
  return normalizeMotionScale(value === undefined ? undefined : Number(value));
}

export function reducedMotion() {
  return (
    motionScale() === 0 ||
    globalThis.document?.documentElement?.dataset.motion === "reduce" ||
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function motionDuration(milliseconds) {
  return reducedMotion() ? 0 : milliseconds * motionScale();
}

export function motionTiming(options) {
  return { ...options, duration: motionDuration(options.duration),
    ...(options.delay === undefined ? {} : {delay: motionDuration(options.delay)}) };
}

export function applyMotionSettings(settings) {
  const scale = normalizeMotionScale(settings.motionScale, settings.motion);
  const root = document.documentElement;
  root.dataset.motionScale = String(scale);
  root.dataset.motion = scale === 0 ? "reduce" : settings.motion;
  root.style.setProperty("--bg-motion-scale", String(scale));
  dispatchEvent(new Event("bg-motion"));
  if (reducedMotion()) for (const animation of document.getAnimations()) {
    try { animation.finish(); } catch { animation.cancel(); }
  }
}

// Each legal step follows one continuous eased arc: no mid-flight keyframe
// stop. Sample minimum-jerk progress at <=20 ms intervals; the next input can
// still cancel immediately. The canonical position is presentation-independent.
export function checkerFlight(points) {
  const legs = points.length - 1;
  const baseDuration = Math.min(1080, 460 + Math.max(0, legs - 1) * 200);
  const duration = motionDuration(baseDuration);
  const frames = [{ transform: `translate(${points[0].x}px, ${points[0].y}px) scale(1)`, offset: 0 }];
  const landings = [];
  const samples = Math.max(16, Math.ceil(baseDuration / legs / 16));
  for (let i = 0; i < legs; i++) {
    const a = points[i], b = points[i + 1];
    const lift = Math.min(24, Math.max(8, Math.hypot(b.x - a.x, b.y - a.y) * .06));
    for (let j = 1; j <= samples; j++) {
      const t = j / samples;
      const u = t * t * t * (10 + t * (-15 + 6 * t));
      const arc = 16 * u * u * (1 - u) * (1 - u);
      frames.push({
        transform: j === samples ? `translate(${b.x}px, ${b.y}px) scale(1)` :
          `translate(${a.x + (b.x - a.x) * u}px, ${a.y + (b.y - a.y) * u - lift * arc}px) scale(${1 + .045 * arc})`,
        offset: (i + t) / legs,
      });
    }
    landings.push(duration * (i + 1) / legs);
  }
  return { frames, duration, landings };
}

// A held checker settles directly from its current lifted pose. Unlike a tap
// move, it has already travelled with the user's finger and needs no new hop.
export function checkerDrop(origin, destination) {
  const baseDuration = Math.min(300, 150 + Math.hypot(destination.x - origin.x, destination.y - origin.y) * .18);
  const duration = motionDuration(baseDuration);
  const samples = Math.ceil(baseDuration / 16), frames = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = t * t * t * (10 + t * (-15 + 6 * t));
    frames.push({ offset:t, transform:`translate(${origin.x + (destination.x - origin.x) * u}px, ${origin.y + (destination.y - origin.y) * u}px) scale(${(origin.scale || 1) + (1 - (origin.scale || 1)) * u})` });
  }
  return {frames, duration, landings:[duration]};
}
