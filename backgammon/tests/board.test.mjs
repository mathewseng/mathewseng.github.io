import test from "node:test";
import assert from "node:assert/strict";
import {
  pointAt,
  pointGeometry,
  checkerPosition,
  lastMoveGhosts,
} from "../ui/board.mjs";
import { initialState } from "../core/rules.mjs";
test("board hit regions identify every point in either orientation without changing canonical indexes", () => {
  for (const orientation of [0, 1])
    for (let p = 0; p < 24; p++) {
      const g = pointGeometry(p, orientation);
      for (const offset of [1, 30, 59])
        assert.equal(
          pointAt(g.x + offset, g.top ? 90 : 470, orientation),
          p,
        );
      assert.equal(pointAt(g.x + 30, g.top ? 14 : 646, orientation), p,
        "point-number lane accepts destination drops too");
    }
});
test("bar, off, outside drops and the center gap have distinct hit regions", () => {
  for (const orientation of [0, 1]) {
    for (const player of [0, 1]) {
      assert.equal(
        pointAt(408, player !== orientation ? 100 : 446, orientation),
        `bar${player}`,
      );
      // The entire return badge, including its arrow below the top hit region.
      for (const y of player !== orientation ? [255, 282, 293] : [390, 417, 427])
        assert.equal(pointAt(408, y, orientation), `bar${player}`);
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
  assert.deepEqual(checkerPosition(s, 12, 0, 0), { x: 54, y: 230 });
  assert.deepEqual(checkerPosition(s, 12, 0, 1), { x: 54, y: 430 });
  assert.deepEqual(checkerPosition(s, "bar", 0, 0), { x: 408, y: 506 });
  assert.equal(checkerPosition(s, "off", 0, 0).x, 843);
});

test("last-move ghosts use original slots in either orientation and compress tall stacks", () => {
  for (const orientation of [0, 1]) {
    const ghosts = lastMoveGhosts(
      {
        player: 0,
        origins: {
          5: { count: 2, before: 3 },
          12: { count: 4, before: 15 },
          bar: { count: 2, before: 2 },
        },
      },
      orientation,
    );
    assert.equal(ghosts.length, 4);
    assert.deepEqual(
      ghosts.map((g) => g.count),
      [1, 1, 4, 2],
    );
    const top = pointGeometry(5, orientation).top;
    assert.deepEqual(
      ghosts.slice(0, 2).map((g) => g.y),
      top ? [98, 142] : [562, 518],
    );
    assert.equal(ghosts[3].y, orientation ? 100 : 506);
    for (const g of ghosts)
      assert.ok(g.x > 0 && g.x < 876 && g.y > 28 && g.y < 632);
  }
  assert.deepEqual(lastMoveGhosts(null), []);
});
