import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  positionKey,
  legalPaths,
  clone,
} from "../core/rules.mjs";
import {
  defaultPlayRules,
  humanControls,
  changeControl,
  studyGame,
  matchesPlayContext,
  lastMove,
} from "../core/play-session.mjs";

function table(state = initialState({ phase: "move", dice: [3, 1] })) {
  return {
    id: "table-1",
    initial: clone(state),
    state,
    events: [],
    started: true,
    config: {
      mode: "computer",
      humanSide: 0,
      strength: "standard",
      name: "Ada",
      opponent: "Friend",
    },
    names: ["Ada", "GNUbg"],
  };
}
function commit(game, action) {
  const actor = game.state.turn;
  game.state = transition(game.state, action, actor);
  game.events.push({ actor, action });
  return game;
}
test("new money sessions default to one centered opening double; matches keep Crawford rules", () => {
  let s = initialState({ matchLength: 0, rules: defaultPlayRules(0) });
  assert.equal(s.rules.jacoby, true);
  assert.equal(s.rules.immediateRedoubles, 0);
  s = transition(s, { type: "opening", dice: [3, 3] });
  assert.deepEqual(s.cube, { value: 2, owner: null });
  s = transition(s, { type: "opening", dice: [6, 6] });
  assert.equal(s.cube.value, 2);
  s = transition(s, { type: "opening", dice: [2, 5] });
  assert.deepEqual(s.dice, [2, 5]);
  assert.equal(s.turn, 1);
  for (const length of [1, 5, 7]) {
    const match = initialState({
      matchLength: length,
      rules: defaultPlayRules(length),
    });
    assert.equal(
      transition(match, { type: "opening", dice: [4, 4] }).cube.value,
      1,
    );
    assert.equal(match.rules.jacoby, false);
    assert.equal(match.rules.automaticDoubles, 0);
  }
});
test("switching sides or adding/removing a bot preserves the entire committed game", () => {
  const original = table(),
    frozen = clone(original);
  const other = changeControl(original, 1);
  assert.equal(other.config.humanSide, 1);
  assert.deepEqual(other.names, ["GNUbg", "Ada"]);
  assert.equal(humanControls(other.config, other.state), false);
  const both = changeControl(other, null);
  assert.equal(both.config.mode, "local");
  assert.equal(humanControls(both.config, both.state), true);
  const botAgain = changeControl(both, 0);
  assert.equal(botAgain.config.strength, "standard");
  assert.deepEqual(botAgain.names, ["Ada", "GNUbg"]);
  for (const game of [other, both, botAgain]) {
    assert.deepEqual(game.state, original.state);
    assert.deepEqual(game.events, original.events);
    assert.deepEqual(game.initial, original.initial);
  }
  assert.deepEqual(original, frozen);
});
test("control assignments use the responder for cube and resignation decisions", () => {
  assert.equal(
    humanControls({ mode: "computer", humanSide: 1 }, initialState()),
    true,
    "either human side can initiate the shared opening roll",
  );
  const state = initialState({ phase: "roll", turn: 0 });
  for (const action of [{ type: "double" }, { type: "resign", level: 1 }]) {
    const offered = transition(state, action, 0);
    assert.equal(
      humanControls({ mode: "computer", humanSide: 0 }, offered),
      false,
    );
    assert.equal(
      humanControls({ mode: "computer", humanSide: 1 }, offered),
      true,
    );
    assert.equal(humanControls({ mode: "local" }, offered), true);
  }
});
test("Solver handoff verifies the original table and inherits controls while using edited context", () => {
  const game = changeControl(table(), 1),
    before = clone(game);
  const context = {
    game,
    positionKey: positionKey(game.state),
    draft: legalPaths(game.state)[0].steps.slice(0, 1),
  };
  assert.equal(matchesPlayContext(context, game.id, game.state), true);
  assert.equal(matchesPlayContext(context, "stale-table", game.state), false);
  const edited = initialState({
    phase: "move",
    dice: [6, 2],
    matchLength: 0,
    rules: defaultPlayRules(0),
  });
  assert.equal(matchesPlayContext(context, game.id, edited), false);
  const study = studyGame(edited, context, "new-study");
  assert.equal(study.config.mode, "computer");
  assert.equal(study.config.humanSide, 1);
  assert.equal(study.config.strength, "standard");
  assert.equal(study.config.matchLength, 0);
  assert.deepEqual(study.config.rules, edited.rules);
  assert.deepEqual(study.state, edited);
  assert.deepEqual(study.events, []);
  study.state.points[0]++;
  assert.deepEqual(game, before);
  assert.equal(studyGame(edited, null, "standalone").config.mode, "local");
  assert.equal(
    matchesPlayContext(
      { ...context, game: { ...game, config: { mode: "online" } } },
      game.id,
      game.state,
    ),
    false,
  );
});
test("last-turn markers track final checker destinations and clear on a committed roll", () => {
  const game = table();
  const chain = legalPaths(game.state).find(
    (p) => p.steps[0].to === p.steps[1].from,
  );
  commit(game, { type: "move", steps: chain.steps });
  assert.deepEqual(lastMove(game).points, { [chain.steps[1].to]: 1 });
  assert.deepEqual(lastMove(game).origins, {
    [chain.steps[0].from]: {
      count: 1,
      before: game.initial.points[chain.steps[0].from],
    },
  });
  assert.deepEqual(lastMove(game).dice, [3, 1]);
  const history = clone(game);
  game.state = transition(game.state, { type: "double" }, game.state.turn);
  game.events.push({ actor: game.state.turn, action: { type: "double" } });
  assert.deepEqual(lastMove(game), lastMove(history));
  game.state = transition(game.state, { type: "take" }, 1 - game.state.turn);
  game.events.push({ actor: 1 - game.state.turn, action: { type: "take" } });
  assert.deepEqual(lastMove(game), lastMove(history));
  commit(game, { type: "roll", dice: [2, 6] });
  assert.equal(lastMove(game), null);
});
test("last-turn markers count separate checkers and bearing off; passes retain dice without ghosts", () => {
  const s = initialState({ phase: "move", dice: [1, 1] });
  const game = table(s);
  const steps = Array.from({ length: 4 }, () => ({ from: 5, to: 4, die: 1 }));
  commit(game, { type: "move", steps });
  assert.deepEqual(lastMove(game).points, { 4: 4 });
  assert.deepEqual(lastMove(game).origins, { 5: { count: 4, before: 5 } });
  assert.deepEqual(lastMove(game).dice, [1, 1]);
  const points = Array(24).fill(0);
  points[0] = 3;
  points[23] = -15;
  const bearoff = table(
    initialState({ points, off: [12, 0], phase: "move", dice: [2, 1] }),
  );
  commit(bearoff, { type: "move", steps: legalPaths(bearoff.state)[0].steps });
  assert.deepEqual(lastMove(bearoff).points, { off: 2 });
  assert.deepEqual(lastMove(bearoff).origins, { 0: { count: 2, before: 3 } });
  const blocked = Array(24).fill(0);
  blocked[5] = 14;
  blocked[23] = -2;
  blocked[22] = -2;
  blocked[18] = -11;
  const pass = table(
    initialState({ points: blocked, bar: [1, 0], phase: "move", dice: [1, 2] }),
  );
  commit(pass, { type: "move", steps: legalPaths(pass.state)[0].steps });
  assert.deepEqual(lastMove(pass).origins, {});
  assert.deepEqual(lastMove(pass).points, {});
  assert.deepEqual(lastMove(pass).dice, [1, 2]);
});

test("last move keeps original committed opening/regular dice and bar origins through hits for either player", () => {
  const opening = table(initialState());
  commit(opening, { type: "opening", dice: [4, 4] });
  commit(opening, { type: "opening", dice: [6, 1] });
  commit(opening, { type: "move", steps: legalPaths(opening.state)[0].steps });
  assert.deepEqual(lastMove(opening).dice, [6, 1]);
  commit(opening, { type: "roll", dice: [2, 5] });
  commit(opening, { type: "move", steps: legalPaths(opening.state)[0].steps });
  assert.deepEqual(lastMove(opening).dice, [2, 5]);
  assert.deepEqual(lastMove(clone(opening)), lastMove(opening));
  for (const turn of [0, 1]) {
    let points = Array(24).fill(0);
    points[5] = 14;
    points[23] = -1;
    points[18] = -14;
    if (turn) points = points.reverse().map((n) => -n);
    const game = table(
      initialState({
        phase: "move",
        dice: [1, 2],
        points,
        turn,
        bar: turn ? [0, 1] : [1, 0],
      }),
    );
    const path = legalPaths(game.state).find(
      (p) => p.steps[0].die === 1 && p.steps[1].from === p.steps[0].to,
    );
    commit(game, { type: "move", steps: path.steps });
    assert.deepEqual(lastMove(game).origins, { bar: { count: 1, before: 1 } });
    assert.deepEqual(lastMove(game).dice, [1, 2]);
    assert.equal(game.state.bar[1 - turn], 1);
    assert.equal(lastMove(game).player, turn);
  }
});
