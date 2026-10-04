import test from "node:test";
import assert from "node:assert/strict";
import { pointAt, pointGeometry, checkerPosition } from "../ui/board.mjs";
import { initialState } from "../core/rules.mjs";
test("board hit regions identify every point in either orientation without changing canonical indexes", () => {
  for (const orientation of [0, 1])
    for (let p = 0; p < 24; p++) {
      const g = pointGeometry(p, orientation);
      for (const offset of [1, 30, 59])
        assert.equal(pointAt(g.x + offset, g.top ? 90 : 470, orientation), p);
    }
});
test("bar, off, outside drops and the center gap have distinct hit regions", () => {
  for (const orientation of [0, 1]) {
    for (const player of [0, 1]) {
      assert.equal(
        pointAt(408, player !== orientation ? 100 : 446, orientation),
        `bar${player}`,
      );
      assert.equal(
        pointAt(843, player !== orientation ? 100 : 446, orientation),
        `off${player}`,
      );
    }
    for (const [x, y] of [
      [-1, 90],
      [900, 80],
      [100, 300],
      [408, 300],
      [818, 200],
    ])
      assert.equal(pointAt(x, y, orientation), null);
  }
});
test("checker animation geometry remains bounded for tall stacks, the bar and bearoff", () => {
  const s = initialState();
  s.points[12] = 15;
  assert.deepEqual(checkerPosition(s, 12, 0, 0), { x: 54, y: 253 });
  assert.deepEqual(checkerPosition(s, 12, 0, 1), { x: 54, y: 347 });
  assert.deepEqual(checkerPosition(s, "bar", 0, 0), { x: 408, y: 446 });
  assert.equal(checkerPosition(s, "off", 0, 0).x, 843);
});
