// SPDX-License-Identifier: GPL-3.0-or-later
export function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// An arc per legal step, with a brief contact at intermediate points. The
// canonical position is already committed: this path is presentation only.
export function checkerFlight(points) {
  const legs = points.length - 1;
  const duration = Math.min(640, 240 + Math.max(0, legs - 1) * 130);
  const frames = [
    {
      transform: `translate(${points[0].x}px, ${points[0].y}px) scale(1)`,
      offset: 0,
      easing: "ease-in-out",
    },
  ];
  const landings = [];
  for (let i = 0; i < legs; i++) {
    const a = points[i],
      b = points[i + 1];
    const lift = Math.min(
      28,
      Math.max(10, Math.hypot(b.x - a.x, b.y - a.y) * 0.07),
    );
    frames.push(
      {
        transform: `translate(${a.x + (b.x - a.x) * 0.48}px, ${a.y + (b.y - a.y) * 0.48 - lift}px) scale(1.07)`,
        offset: (i + 0.44) / legs,
        easing: "cubic-bezier(.25,.6,.35,1)",
      },
      {
        transform: `translate(${b.x}px, ${b.y}px) scale(1.025,.975)`,
        offset: (i + 0.88) / legs,
        easing: "ease-out",
      },
      {
        transform: `translate(${b.x}px, ${b.y}px) scale(1)`,
        offset: (i + 1) / legs,
        easing: "ease-in-out",
      },
    );
    landings.push((duration * (i + 0.88)) / legs);
  }
  return { frames, duration, landings };
}
