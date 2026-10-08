// Coordinates use a tabletop with +Y up. Opposite faces sum to seven.
export const FACES = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], pips: [[0, 0]] },
  {
    n: [1, 0, 0],
    u: [0, 0, -1],
    v: [0, 1, 0],
    pips: [
      [-1, 1],
      [1, -1],
    ],
  },
  {
    n: [0, 1, 0],
    u: [1, 0, 0],
    v: [0, 0, -1],
    pips: [
      [-1, 1],
      [0, 0],
      [1, -1],
    ],
  },
  {
    n: [0, -1, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
    pips: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    u: [0, 0, 1],
    v: [0, 1, 0],
    pips: [
      [-1, -1],
      [-1, 1],
      [0, 0],
      [1, -1],
      [1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    u: [-1, 0, 0],
    v: [0, 1, 0],
    pips: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ],
  },
];
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const apply = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];
const multiply = (a, b) =>
  a.map((_, i) =>
    [0, 1, 2].reduce(
      (sum, j) => sum + a[Math.floor(i / 3) * 3 + j] * b[j * 3 + (i % 3)],
      0,
    ),
  );
const rotation = (axis, angle) => {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return axis === "x"
    ? [1, 0, 0, 0, c, -s, 0, s, c]
    : axis === "y"
      ? [c, 0, s, 0, 1, 0, -s, 0, c]
      : [c, -s, 0, s, c, 0, 0, 0, 1];
};
const top = [
  null,
  rotation("x", -Math.PI / 2),
  rotation("z", Math.PI / 2),
  identity,
  rotation("x", Math.PI),
  rotation("z", -Math.PI / 2),
  rotation("x", Math.PI / 2),
];
export const CAMERA = rotation("x", (58 * Math.PI) / 180);
export function orientation(face, yaw = 0, tumble = 0, lean = 0) {
  const world = multiply(
    rotation("z", lean),
    multiply(rotation("x", tumble), multiply(rotation("y", yaw), top[face])),
  );
  return { world, view: multiply(CAMERA, world) };
}
export const facePoint = (face, u, v, depth = 0.5) =>
  face.n.map((n, i) => n * depth + face.u[i] * u + face.v[i] * v);

// A single closed rounded cube, including curved edges and spherical corners.
// The same mesh is shared by every die; no image assets or graphics dependency.
const cuts = [
  -0.5, -0.493, -0.472, -0.441, -0.405, -0.38, 0.38, 0.405, 0.441, 0.472, 0.493,
  0.5,
];
const rounded = (p) => {
  const core = p.map((x) => Math.max(-0.38, Math.min(0.38, x)));
  const normal = p.map((x, i) => x - core[i]);
  const length = Math.hypot(...normal);
  return core.map((x, i) => x + (0.12 * normal[i]) / length);
};
export const MESH = FACES.flatMap((face, index) => {
  const patches = [];
  for (let u = 0; u < cuts.length - 1; u++)
    for (let v = 0; v < cuts.length - 1; v++) {
      const points = [
        [u, v],
        [u + 1, v],
        [u + 1, v + 1],
        [u, v + 1],
      ].map(([x, y]) => rounded(facePoint(face, cuts[x], cuts[y])));
      const center = points[0].map(
        (_, i) => points.reduce((sum, p) => sum + p[i], 0) / 4,
      );
      const normal = center.map((x) => x - Math.max(-0.38, Math.min(0.38, x)));
      const length = Math.hypot(...normal);
      patches.push({
        points,
        center,
        normal: normal.map((x) => x / length),
        face: index + 1,
      });
    }
  return patches;
});
