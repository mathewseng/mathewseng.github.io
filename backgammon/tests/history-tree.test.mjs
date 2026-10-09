import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalTurns,
  legalPaths,
  boardKey,
  replay,
  clone,
} from "../core/rules.mjs";
import { playAction, undoTurn, validateTakebacks } from "../core/table.mjs";
import { returnToDecision, replacePracticeRoll } from "../core/practice.mjs";
import {
  historyTree,
  historyPath,
  returnToHistory,
  historyStateKey,
} from "../core/history-tree.mjs";
import { itemRecord, validateItem } from "../core/storage.mjs";
function fixture() {
  const initial = initialState({ phase: "move", dice: [3, 1], matchLength: 0 });
  const base = {
    id: "tree-test",
    initial,
    state: initial,
    events: [],
    started: true,
    config: { mode: "local" },
    names: ["You", "Friend"],
  };
  const alternatives = legalTurns(initial);
  let a = playAction(base, { type: "move", steps: alternatives[0].steps });
  a = playAction(a, { type: "roll", dice: [4, 2] });
  a = playAction(a, { type: "move", steps: legalTurns(a.state)[0].steps });
  let b = returnToDecision(a, 0, initial);
  b = playAction(b, { type: "move", steps: alternatives.at(-1).steps });
  return { base, a, b };
}
test("history is a branching trie; exploration is immutable and returning preserves both lines and dice", () => {
  const { a, b } = fixture(),
    before = JSON.stringify(b),
    tree = historyTree(b);
  assert.equal(tree.nodes[0].children.length, 2);
  assert.equal(JSON.stringify(b), before);
  assert.deepEqual(historyPath(tree, tree.current), b.events);
  const old = tree.nodes.find((n) => n.depth === 2 && !n.active);
  assert.deepEqual(old.state.dice, [4, 2]);
  const restored = returnToHistory(b, historyPath(tree, old.id));
  assert.equal(
    historyStateKey(restored.state),
    historyStateKey(replay(a.initial, a.events.slice(0, 2)).at(-1)),
  );
  assert.deepEqual(restored.replayDice, []);
  assert.equal(historyTree(restored).nodes.length, tree.nodes.length);
  assert.equal(restored.undoLog.length, b.undoLog.length + 1);
  assert.equal(JSON.stringify(b), before);
  validateTakebacks(restored, true);
  const item = itemRecord("match", {
    id: restored.id,
    initial: restored.initial,
    events: restored.events,
    undoLog: restored.undoLog,
  });
  validateItem(JSON.parse(JSON.stringify(item)));
  assert.equal(historyTree(item).nodes.length, tree.nodes.length);
  const invalid = clone(item);
  invalid.undoLog[0].events[0].evaluation = {result: {type: "checker", candidates: "invalid"}};
  assert.throws(() => validateItem(invalid));
});
test("nested returns, committed undo and practice rolls retain verified ancestry", () => {
  const { a, b } = fixture();
  const takeback = undoTurn(b, 0, 0);
  assert.deepEqual(takeback.undoLog.at(-1).prefix, []);
  validateTakebacks(takeback, true);
  let nested = returnToHistory(b, a.events.slice(0, 2));
  nested = replacePracticeRoll(nested, nested.state.turn, [5, 1]);
  validateTakebacks(nested, true);
  const tree = historyTree(nested);
  assert.equal(tree.roots.length, 1);
  assert.ok(tree.nodes.filter((n) => n.children.length > 1).length >= 2);
  assert.ok(tree.nodes.some((n) => n.state.dice.join() === "4,2"));
  assert.ok(tree.nodes.some((n) => n.state.dice.join() === "5,1"));
  const corrupted = clone(nested);
  corrupted.undoLog.at(-1).prefix = [];
  assert.throws(() => validateTakebacks(corrupted, true), /does not match/);
  assert.throws(() => historyTree(corrupted), /does not match/);
  assert.throws(
    () => returnToHistory({ ...b, config: { mode: "online" } }, []),
    /local play/,
  );
  assert.throws(
    () =>
      returnToHistory(b, [
        { actor: 0, action: { type: "roll", dice: [6, 6] } },
      ]),
    /not in this game's history/,
  );
});
test("legacy suffixes attach only to unique exact contexts; converging lines are not guessed", () => {
  const { b, base } = fixture(),
    legacy = clone(b);
  for (const entry of legacy.undoLog) delete entry.prefix;
  assert.equal(historyTree(legacy).roots.length, 1);
  const paths = legalPaths(base.state),
    groups = new Map();
  for (const p of paths) {
    const key = boardKey(p.state);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const equivalent = [...groups.values()].find((v) => v.length > 1);
  const first = playAction(base, { type: "move", steps: equivalent[0].steps });
  const second = playAction(base, { type: "move", steps: equivalent[1].steps });
  first.undoLog = [
    {
      initial: base.initial,
      prefix: [],
      events: second.events,
      by: 0,
      acceptedBy: null,
    },
    {
      initial: first.state,
      events: [
        { actor: first.state.turn, action: { type: "roll", dice: [2, 3] } },
      ],
      by: 0,
      acceptedBy: null,
    },
  ];
  const tree = historyTree(first);
  assert.equal(tree.roots.length, 2);
  const detached = tree.nodes.at(-1);
  assert.equal(detached.detached, true);
  assert.throws(() => historyPath(tree, detached.id), /no verified origin/);
});
