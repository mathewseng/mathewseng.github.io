// SPDX-License-Identifier: GPL-3.0-or-later
export function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Each legal step follows one continuous eased arc: no mid-flight keyframe
// stop. Sample minimum-jerk progress at <=20 ms intervals; the next input can
// still cancel immediately. The canonical position is presentation-independent.
export function checkerFlight(points) {
  const legs = points.length - 1;
  const duration = Math.min(1080, 460 + Math.max(0, legs - 1) * 200);
  const frames = [{ transform: `translate(${points[0].x}px, ${points[0].y}px) scale(1)`, offset: 0 }];
  const landings = [];
  const samples = Math.max(16, Math.ceil(duration / legs / 16));
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
