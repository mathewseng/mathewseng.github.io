import test from "node:test";
import assert from "node:assert/strict";
import { FACES, MESH, orientation, apply, dot } from "../dice-geometry.mjs";

test("every scored value is physically uppermost and visually dominant", () => {
  for (let face = 1; face <= 6; face++)
    for (const yaw of [-0.48, -0.3, 0, 0.24, 0.48]) {
      const pose = orientation(face, yaw);
      const normal = apply(pose.world, FACES[face - 1].n);
      assert.ok(
        Math.abs(normal[0]) < 1e-10 &&
          Math.abs(normal[1] - 1) < 1e-10 &&
          Math.abs(normal[2]) < 1e-10,
      );
      const projected = FACES.map((side) => apply(pose.view, side.n)[2]);
      assert.equal(projected.indexOf(Math.max(...projected)), face - 1);
      assert.ok(
        projected[face - 1] > 0.8,
        "The top face has enough projected area to read its pips",
      );
    }
});
test("dice have standard pip counts, opposite faces, and rigid orientations", () => {
  for (let i = 0; i < 6; i++) {
    assert.equal(FACES[i].pips.length, i + 1);
    assert.equal(dot(FACES[i].n, FACES[5 - i].n), -1);
    const pose = orientation(i + 1, 0.31, 3.7, 0.4);
    const sides = FACES.slice(0, 3).map((face) => apply(pose.view, face.n));
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        assert.ok(
          Math.abs(dot(sides[a], sides[b]) - (a === b ? 1 : 0)) < 1e-10,
        );
  }
});
test("rounded dice form one closed solid without open edge or corner seams", () => {
  const edges = new Map();
  const key = (p) =>
    p.map((x) => x.toFixed(8).replace("-0.00000000", "0.00000000")).join(",");
  for (const patch of MESH) {
    assert.ok(Math.abs(Math.hypot(...patch.normal) - 1) < 1e-10);
    for (let i = 0; i < 4; i++) {
      const p = patch.points[i];
      assert.ok(p.every((x) => Math.abs(x) <= 0.500000001));
      const edge = [key(p), key(patch.points[(i + 1) % 4])].sort().join("|");
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok(
    [...edges.values()].every((count) => count === 2),
    "Each edge is shared by exactly two patches",
  );
});
