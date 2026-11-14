import test from 'node:test';
import assert from 'node:assert/strict';
import { game, RANKING, MIA, rank, valueOf, legalValues, atLeast, chance, truthChance, loadTable, adviseWith, classicBot } from '../engine.mjs';
import { exploitability, simplex } from '../scripts/solve.mjs';
import { seededRng } from '../../table-core.mjs';

// Hard plays from the solver table; with it loaded, bots answer synchronously.
const table = await loadTable();

// An rng that rolls the given faces in order.
const fixed = (...faces) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};
const NAMES = ['Ann', 'Ben', 'Cat', 'Dan', 'Eve', 'Fay'];
const start = ({ players = 3, lives = 6, first = 0 } = {}) => game.setup({ names: NAMES.slice(0, players), options: { lives }, first });
const act = (state, action, rng = fixed(1)) => game.apply(state, game.actor(state), action, rng);
const rollAndAnnounce = (state, dice, value) => act(act(state, { type: 'roll' }, fixed(...dice)), { type: 'announce', value });
const believeAndAnnounce = (state, dice, value) => rollAndAnnounce(state, dice, value);

test('values read high die first and rank 31 up to Mia', () => {
  assert.deepEqual(RANKING, [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21]);
  assert.equal(valueOf([1, 3]), 31);
  assert.equal(valueOf([3, 1]), 31);
  assert.equal(valueOf([2, 1]), 21);
  assert.equal(valueOf([1, 2]), MIA);
  assert.equal(valueOf([4, 4]), 44);
  assert.equal(valueOf([4, 6]), 64);
  assert.equal(rank(31), 0);
  assert.equal(rank(MIA), 20);
  assert.ok(rank(65) < rank(11) && rank(66) < rank(MIA) && rank(43) < rank(51));
  assert.equal(rank(12), -1);
  assert.ok(Math.abs(RANKING.reduce((sum, value) => sum + chance(value), 0) - 1) < 1e-12);
  assert.ok(Math.abs(atLeast(31) - 1) < 1e-12);
  assert.ok(Math.abs(atLeast(MIA) - 2 / 36) < 1e-12);
  assert.deepEqual(legalValues(66), [MIA]);
  assert.equal(legalValues(null).length, 21);
  // Every one of the 36 rolls lands on a ranked value.
  for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) assert.ok(rank(valueOf([a, b])) >= 0);
});

test('each announcement must beat the last one', () => {
  let state = start();
  state = act(state, { type: 'roll' }, fixed(3, 1));
  assert.equal(game.actor(state), 0);
  assert.throws(() => act(state, { type: 'announce', value: 12 }), /not a Mia value/);
  assert.throws(() => act(state, { type: 'announce', value: 77 }));
  state = act(state, { type: 'announce', value: 54 }); // any value opens, truth or not
  assert.equal(state.phase, 'decide');
  assert.equal(game.actor(state), 1);
  state = act(state, { type: 'roll' }, fixed(6, 6));
  assert.equal(state.phase, 'announce');
  assert.throws(() => act(state, { type: 'announce', value: 54 }), /more than 54/);
  assert.throws(() => act(state, { type: 'announce', value: 43 }));
  state = act(state, { type: 'announce', value: 61 });
  assert.deepEqual(state.history.map((entry) => entry.value), [54, 61]);
  assert.equal(game.actor(state), 2);
});

test('a call costs the announcer a life for a bluff and the caller otherwise', () => {
  // Bluff: 43 announced as 54.
  let state = act(rollAndAnnounce(start(), [4, 3], 54), { type: 'call' });
  assert.deepEqual(state.lives, [5, 6, 6]);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.result.actual, 43);
  assert.equal(state.result.truth, false);
  assert.deepEqual(state.result.dice, [4, 3]);
  assert.match(state.log.at(-1).text, /It was 43\. Ann lost a life\./);

  // Exactly as announced: the caller pays.
  state = act(rollAndAnnounce(start(), [5, 4], 54), { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.truth, true);

  // Better than announced: still the caller.
  state = act(rollAndAnnounce(start(), [1, 6], 54), { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.actual, 61);

  // Later in a round only the latest roll counts.
  state = rollAndAnnounce(start(), [5, 4], 54);
  state = believeAndAnnounce(state, [3, 2], 61);
  assert.equal(game.actor(state), 2);
  state = act(state, { type: 'call' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.announcer, 1);
});

test('Mia costs 2 lives when called true, 1 when it was a bluff or conceded', () => {
  let state = act(rollAndAnnounce(start(), [1, 2], MIA), { type: 'call' });
  assert.deepEqual(state.lives, [6, 4, 6]);
  assert.match(state.log.at(-1).text, /It was Mia\. Ben lost 2 lives\./);

  state = act(rollAndAnnounce(start(), [3, 1], MIA), { type: 'call' });
  assert.deepEqual(state.lives, [5, 6, 6]);

  const mia = rollAndAnnounce(start(), [3, 1], MIA);
  assert.throws(() => act(mia, { type: 'roll' }), /Nothing beats Mia/);
  state = act(mia, { type: 'concede' });
  assert.deepEqual(state.lives, [6, 5, 6]);
  assert.equal(state.result.kind, 'concede');
  assert.equal(state.result.dice, null);
  assert.equal(state.result.actual, null);
  assert.equal(state.dice, null);
  assert.match(state.log.at(-1).text, /conceded Mia and lost a life/);
  for (let seat = -1; seat < 3; seat += 1) {
    const shown = game.view(state, seat);
    assert.equal(shown.dice, null);
    assert.equal(shown.result.dice, null);
  }

  // A true Mia can only take the lives a caller has left.
  const last = clone(rollAndAnnounce(start(), [2, 1], MIA));
  last.lives[1] = 1;
  state = act(last, { type: 'call' });
  assert.deepEqual(state.lives, [6, 0, 6]);
  assert.equal(state.result.taken, 1);
  assert.equal(state.result.out, true);
});

test('the loser starts the next round, or the next player still in', () => {
  let state = act(rollAndAnnounce(start(), [4, 3], 54), { type: 'call' });
  assert.equal(game.actor(state), 0);
  assert.throws(() => game.apply(state, 1, { type: 'next' }, fixed(1)));
  state = act(state, { type: 'next' });
  assert.equal(state.phase, 'roll');
  assert.equal(state.round, 2);
  assert.equal(state.claim, null);
  assert.deepEqual(state.history, []);
  assert.equal(game.actor(state), 0);

  state = act(rollAndAnnounce(start(), [5, 4], 54), { type: 'call' });
  assert.equal(game.actor(state), 1);

  // Ann bluffs on her last life: she is out, Ben starts and turns skip her.
  const fragile = start();
  fragile.lives = [1, 3, 3];
  state = act(rollAndAnnounce(fragile, [4, 3], 54), { type: 'call' });
  assert.deepEqual(state.lives, [0, 3, 3]);
  assert.ok(state.log.some((entry) => entry.seat === 0 && entry.text === 'ran out of lives.'));
  assert.equal(game.outcome(state), null);
  assert.equal(game.actor(state), 1);
  state = act(state, { type: 'next' });
  state = rollAndAnnounce(state, [3, 1], 31);
  assert.equal(game.actor(state), 2);
  state = believeAndAnnounce(state, [3, 2], 32);
  assert.equal(game.actor(state), 1);
  assert.equal(game.summary(state, 0), 'Out');
  assert.equal(game.summary(state, 1), '3 lives');
});

test('the last player standing wins', () => {
  const duel = start({ players: 2, lives: 3 });
  duel.lives = [1, 2];
  const state = act(rollAndAnnounce(duel, [4, 3], 54), { type: 'call' });
  assert.equal(game.actor(state), -1);
  assert.deepEqual(game.outcome(state), { winners: [1], text: 'Ben won with 2 lives left.' });
  assert.throws(() => game.apply(state, 1, { type: 'next' }, fixed(1)), /over/);
});

const clone = (value) => JSON.parse(JSON.stringify(value));

// Collects every value stored under a `dice` key anywhere in an object.
function diceFields(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => diceFields(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'dice' && item != null) found.push(item);
      diceFields(item, found);
    }
  }
  return found;
}

test('views never show a hidden roll to anyone but its roller', () => {
  let state = act(start(), { type: 'roll' }, fixed(6, 2));
  assert.deepEqual(game.view(state, 0).dice, [6, 2]);
  for (const seat of [-1, 1, 2]) {
    assert.equal(game.view(state, seat).dice, null);
    assert.deepEqual(diceFields(game.view(state, seat)), []);
    assert.equal(game.view(state, seat).cup, true);
  }
  state = act(state, { type: 'announce', value: 64 });
  assert.equal(game.view(state, 1).dice, null);
  state = act(state, { type: 'call' });
  for (let seat = -1; seat < 3; seat += 1) assert.deepEqual(game.view(state, seat).result.dice, [6, 2]);

  // Across whole bot games, what any other seat sees never depends on the
  // dice under the cup, and no `dice` field reaches it before a call.
  const rng = seededRng(5);
  const swaps = [[1, 1], [2, 1], [6, 5], [4, 3], [6, 6]];
  for (let g = 0; g < 12; g += 1) {
    const players = 2 + (g % 5);
    let s = game.setup({ names: NAMES.slice(0, players), options: { lives: 3 }, first: g % players });
    while (!game.outcome(s)) {
      for (let seat = -1; seat < players; seat += 1) {
        const owner = seat >= 0 && seat === s.diceSeat;
        if (owner) continue;
        const seen = JSON.stringify(game.view(s, seat));
        if (s.phase !== 'reveal') assert.deepEqual(diceFields(game.view(s, seat)), []);
        for (const dice of swaps) {
          if (!s.dice) break;
          assert.equal(JSON.stringify(game.view({ ...s, dice }, seat)), seen);
        }
      }
      const seat = game.actor(s);
      s = game.apply(s, seat, game.bot(game.view(s, seat), seat, ['easy', 'normal', 'hard'][seat % 3], rng), rng);
    }
  }
});

test('the hand-over curtain guards every decision except the reveal', () => {
  let state = start();
  assert.equal(game.needsPrivacy(state, 0), true);
  state = act(state, { type: 'roll' }, fixed(5, 2));
  assert.equal(game.needsPrivacy(state, 0), true);
  state = act(state, { type: 'announce', value: 52 });
  assert.equal(game.needsPrivacy(state, 1), true);
  state = act(state, { type: 'call' });
  assert.equal(game.needsPrivacy(state, 1), false);
});

test('illegal moves throw and leave the state alone', () => {
  const opening = start();
  const before = JSON.stringify(opening);
  assert.throws(() => game.apply(opening, 1, { type: 'roll' }, fixed(1)), /not your turn/);
  assert.throws(() => act(opening, { type: 'announce', value: 31 }), /Roll before/);
  assert.throws(() => act(opening, { type: 'call' }), /no announcement/);
  assert.throws(() => act(opening, { type: 'concede' }));
  assert.throws(() => act(opening, { type: 'next' }));
  assert.throws(() => act(opening, { type: 'hold' }), /Unknown/);
  assert.equal(JSON.stringify(opening), before);

  const rolled = act(opening, { type: 'roll' }, fixed(4, 2));
  assert.throws(() => act(rolled, { type: 'roll' }));
  assert.throws(() => act(rolled, { type: 'call' }));

  const claimed = act(rolled, { type: 'announce', value: 42 });
  const frozen = JSON.stringify(claimed);
  assert.throws(() => act(claimed, { type: 'concede' }), /only concede to Mia/);
  assert.throws(() => act(claimed, { type: 'announce', value: 43 }), /Roll before/);
  assert.throws(() => game.apply(claimed, 0, { type: 'call' }, fixed(1)), /not your turn/);
  assert.equal(JSON.stringify(claimed), frozen);
  const believed = act(claimed, { type: 'roll' }, fixed(1, 1));
  assert.throws(() => act(believed, { type: 'announce', value: 41 }));
  assert.throws(() => act(believed, { type: 'announce', value: 42 }));
  assert.equal(JSON.stringify(claimed), frozen);
});

test('bot games end, and the log never names a roll before the cup is lifted', () => {
  const rng = seededRng(21);
  const levels = ['easy', 'normal', 'hard'];
  for (let g = 0; g < 90; g += 1) {
    const players = 2 + (g % 5);
    const seats = NAMES.slice(0, players).map(() => levels[Math.floor(rng() * 3)]);
    let state = game.setup({ names: NAMES.slice(0, players), options: { lives: g % 2 ? 3 : 6 }, first: g % players });
    let steps = 0;
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      const action = game.bot(game.view(state, seat), seat, seats[seat], rng);
      const next = game.apply(state, seat, action, rng);
      if (state.log.length < 110) {
        for (const entry of next.log.slice(state.log.length)) {
          if (/It was/.test(entry.text)) assert.equal(action.type, 'call');
          if (/announced/.test(entry.text)) assert.equal(action.type, 'announce');
        }
      }
      state = next;
      steps += 1;
      assert.ok(steps < 4000, 'game did not finish');
    }
    assert.equal(state.lives.filter((lives) => lives > 0).length, 1);
  }
});

test('hard reads bluffs: the smallest raise is the least believable', () => {
  assert.ok(truthChance(61, 54) < truthChance(63, 54));
  assert.ok(truthChance(MIA, 66) < 0.2);
  assert.ok(truthChance(MIA, null) > 0.5);
});

// Seat-rotated bot matches: the share of games each level won.
function rates(levels, games, { lives = 6, seed = 2026 } = {}) {
  const rng = seededRng(seed);
  const wins = levels.map(() => 0);
  const n = levels.length;
  for (let g = 0; g < games; g += 1) {
    // Every level sits in every seat and, at three or more, in both orders round the table.
    const order = levels.map((_, i) => (i + g) % n);
    if (n > 2 && Math.floor(g / n) % 2) order.reverse();
    let state = game.setup({ names: order.map((i) => `P${i}`), options: { lives }, first: Math.floor(g / (2 * n)) % n });
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      const level = levels[order[seat]];
      const view = game.view(state, seat);
      const action = level === 'classic' ? classicBot(view, seat, rng) : game.bot(view, seat, level, rng);
      state = game.apply(state, seat, action, rng);
    }
    wins[order[game.outcome(state).winners[0]]] += 1;
  }
  return wins.map((w) => w / games);
}
const pct = (p) => `${(p * 100).toFixed(1)}%`;

test('hard beats easy, normal and the old hard bot heads-up, and normal beats easy', (t) => {
  const [hardEasy] = rates(['hard', 'easy'], 600);
  const [hardNormal] = rates(['hard', 'normal'], 1500);
  const [hardClassic] = rates(['hard', 'classic'], 1500);
  const [normalEasy] = rates(['normal', 'easy'], 400);
  t.diagnostic(`two players, 6 lives: hard beat easy in ${pct(hardEasy)} of 600, normal in ${pct(hardNormal)} of 1500 and the old hard bot in ${pct(hardClassic)} of 1500; normal beat easy in ${pct(normalEasy)} of 400`);
  // The equilibrium cannot lose on average, but it does not exploit weak play either.
  assert.ok(hardEasy > 0.62, `hard beat easy in ${hardEasy}`);
  assert.ok(hardNormal > 0.5, `hard beat normal in ${hardNormal}`);
  assert.ok(hardClassic > 0.5, `hard beat the old hard bot in ${hardClassic}`);
  assert.ok(normalEasy > 0.65, `normal beat easy in ${normalEasy}`);
});

test('at three players hard wins more often than the old hard bot and normal', (t) => {
  const [hard, classic, normal] = rates(['hard', 'classic', 'normal'], 600, { seed: 7 });
  t.diagnostic(`three players, 6 lives, 600 games: hard ${pct(hard)}, old hard ${pct(classic)}, normal ${pct(normal)}`);
  assert.ok(hard > classic && hard > normal && hard > 0.4, `hard ${hard}, old hard ${classic}, normal ${normal}`);
});

// ---------- Solver ----------

test('the simplex solves a known game', () => {
  // Rock-paper-scissors for the row player: value 0 at (1/3, 1/3, 1/3); shift payoffs by 1.
  const A = [[1, 0, 2], [2, 1, 0], [0, 2, 1]];
  // maximize z s.t. z ≤ Σ_i x_i A[i][j] for every column j, Σ x = 1.
  const rows = A[0].map((_, j) => ({ a: [-A[0][j], -A[1][j], -A[2][j], 1], op: '<=', b: 0 }));
  rows.push({ a: [1, 1, 1, 0], op: '=', b: 1 });
  const { x, value, duals } = simplex([0, 0, 0, 1], rows);
  assert.ok(Math.abs(value - 1) < 1e-9);
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(x[i] - 1 / 3) < 1e-9);
  for (let j = 0; j < 3; j += 1) assert.ok(Math.abs(duals[j] - 1 / 3) < 1e-9, 'column player mixes evenly');
});

test('the heads-up table is an equilibrium: best responses gain almost nothing', (t) => {
  const { worst, at } = exploitability(table);
  t.diagnostic(`worst exploitability ${(worst * 100).toFixed(5)} points of match-win chance; 6 v 6 opener ${pct(at(6, 6).value)}, 3 v 3 opener ${pct(at(3, 3).value)}`);
  assert.ok(worst >= -1e-9 && worst < 1e-4, `exploitability ${worst}`);
  // The measure has teeth: a decider who never calls is easy to exploit.
  const lax = JSON.parse(JSON.stringify(table));
  for (const pair of Object.values(lax.lives)) for (const node of pair.nodes) node.y = node.y.map(() => 0);
  assert.ok(exploitability(lax).worst > 0.1);
});

const duel = (lives, history, phase, extra = {}) => ({
  names: ['A', 'B'], lives, maxLives: 6, winner: -1, turn: 0, round: 1, phase,
  history, claim: history.at(-1) || null, dice: null, diceSeat: -1, cup: true, ...extra,
});

test('advice reads the view only: hidden dice never change it', () => {
  // Deciding on a claim: the announcer's dice are not the decider's to see.
  for (const history of [[{ seat: 1, value: 54 }], [{ seat: 1, value: 31 }, { seat: 0, value: 43 }, { seat: 1, value: 62 }], [{ seat: 1, value: MIA }]]) {
    const base = duel([4, 5], history, 'decide', { diceSeat: 1 });
    const seen = JSON.stringify(adviseWith(table, base, 0));
    for (const dice of [[2, 1], [6, 6], [3, 1], [5, 4]]) {
      assert.equal(JSON.stringify(adviseWith(table, { ...base, dice }, 0)), seen);
      assert.equal(JSON.stringify(adviseWith(table, game.view({ ...base, dice }, 0), 0)), seen);
    }
  }
  // Three players: same for the model.
  const crowd = { ...duel([3, 3, 3], [{ seat: 2, value: 52 }], 'decide', { diceSeat: 2 }), names: ['A', 'B', 'C'] };
  const seen = JSON.stringify(adviseWith(table, crowd, 0));
  for (const dice of [[2, 1], [1, 1], [4, 3]]) assert.equal(JSON.stringify(adviseWith(table, { ...crowd, dice }, 0)), seen);
  // Through whole games: what a seat is advised never depends on dice it cannot see.
  const rng = seededRng(17);
  for (let g = 0; g < 16; g += 1) {
    const players = 2 + (g % 3);
    let state = game.setup({ names: ['A', 'B', 'C', 'D'].slice(0, players), options: { lives: 3 }, first: g % players });
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      if (state.dice && state.diceSeat !== seat) {
        const seen2 = JSON.stringify(adviseWith(table, game.view(state, seat), seat));
        for (const dice of [[2, 1], [6, 5], [3, 1]]) assert.equal(JSON.stringify(adviseWith(table, game.view({ ...state, dice }, seat), seat)), seen2);
      }
      state = game.apply(state, seat, game.bot(game.view(state, seat), seat, 'hard', rng), rng);
    }
  }
});

test('advice lists only legal moves, best first, and the hard bot plays them', async () => {
  const rng = seededRng(33);
  let decisions = 0;
  let exact = 0;
  for (let g = 0; g < 30; g += 1) {
    const players = 2 + (g % 4);
    const levels = ['hard', 'normal', 'easy'];
    let state = game.setup({ names: ['A', 'B', 'C', 'D', 'E'].slice(0, players), options: { lives: g % 2 ? 3 : 6 }, first: g % players });
    while (!game.outcome(state)) {
      const seat = game.actor(state);
      const view = game.view(state, seat);
      const advice = await game.advise(view, seat);
      assert.ok(advice && advice.options.length >= 1);
      assert.equal(advice.exact, state.lives.filter((l) => l > 0).length === 2);
      assert.deepEqual(advice.best, advice.options[0].action);
      for (const option of advice.options) {
        assert.doesNotThrow(() => game.apply(state, seat, option.action, rng), JSON.stringify(option.action));
        assert.equal(typeof option.label, 'string');
        assert.equal(typeof option.display, 'string');
      }
      if (state.phase === 'announce') assert.equal(advice.options.length, legalValues(state.claim?.value ?? null).length);
      if (state.phase === 'decide') assert.equal(advice.options.length, 2);
      decisions += 1;
      if (advice.exact) exact += 1;
      const action = game.bot(view, seat, levels[seat % 3], rng);
      if (levels[seat % 3] === 'hard') assert.ok(advice.options.some((option) => game.sameAction(option.action, action)));
      state = game.apply(state, seat, action, rng);
    }
  }
  assert.ok(decisions > 500 && exact > 100);
});

test('heads-up advice shows the equilibrium mix, and hard samples it', () => {
  // 6 v 6, the opener announced 54: the equilibrium believes about 76% of the time.
  const state = duel([6, 6], [{ seat: 1, value: 54 }], 'decide', { diceSeat: 1 });
  const advice = adviseWith(table, state, 0);
  assert.equal(advice.exact, true);
  assert.match(advice.metric, /win the match/);
  assert.match(advice.options[0].label, /^Believe and roll \(play \d+% of the time\)$/);
  assert.match(advice.options[1].label, /^Call bluff \(play \d+% of the time\)$/);
  assert.equal(advice.options[0].display, advice.options[1].display, 'mixed moves are worth the same');
  assert.match(advice.options[0].display, /^\d+\.\d% to win the match$/);
  const y = advice.options[1].mix;
  assert.ok(y > 0.1 && y < 0.4);
  const rng = seededRng(4);
  let calls = 0;
  for (let i = 0; i < 4000; i += 1) if (game.bot(state, 0, 'hard', rng).type === 'call') calls += 1;
  assert.ok(Math.abs(calls / 4000 - y) < 0.03, `called ${calls / 4000}, equilibrium ${y}`);

  // Announcing: every legal value, the equilibrium's choices first, labelled truth or bluff.
  const roll = duel([6, 6], [], 'announce', { dice: [3, 1], diceSeat: 0 });
  const announce = adviseWith(table, roll, 0);
  assert.equal(announce.options.length, 21);
  assert.ok(announce.options.every((option) => /\((truth|bluff)/.test(option.label)));
  const played = announce.options.filter((option) => option.mix > 0.0005);
  assert.ok(played.length > 1 && played.every((option) => /bluff, play \d+% of the time/.test(option.label)));
  assert.ok(announce.options.slice(played.length).every((option) => option.value <= played[0].value + 1e-9));

  // A plain best move when the equilibrium does not mix: a real Mia is announced as Mia.
  const mia = adviseWith(table, duel([2, 5], [{ seat: 1, value: 43 }], 'announce', { dice: [2, 1], diceSeat: 0 }), 0);
  assert.equal(mia.options.filter((option) => option.mix > 0.0005).length, 1);
});

test('three or more players get a model estimate in chances of losing a life', () => {
  const state = { ...duel([6, 6, 6], [{ seat: 2, value: 65 }], 'decide', { diceSeat: 2 }), names: ['A', 'B', 'C'] };
  const advice = adviseWith(table, state, 0);
  assert.equal(advice.exact, false);
  assert.match(advice.metric, /lose a life/);
  assert.match(advice.note, /No exact solution/);
  for (const option of advice.options) assert.match(option.display, /^\d+\.\d% to lose a life$/);
  const mia = adviseWith(table, { ...state, history: [{ seat: 2, value: MIA }], claim: { seat: 2, value: MIA } }, 0);
  assert.deepEqual(mia.options.map((option) => option.action.type).sort(), ['call', 'concede']);
  assert.ok(mia.options.some((option) => /2 lives/.test(option.display)));
});

test('sameAction compares the move and its value', () => {
  assert.equal(game.sameAction({ type: 'announce', value: 54 }, { type: 'announce', value: '54' }), true);
  assert.equal(game.sameAction({ type: 'announce', value: 54 }, { type: 'announce', value: 61 }), false);
  assert.equal(game.sameAction({ type: 'call' }, { type: 'call' }), true);
  assert.equal(game.sameAction({ type: 'call' }, { type: 'roll' }), false);
});

test('a new host recovers a playable round from the spectator view', () => {
  const rng = seededRng(9);
  let state = game.setup({ names: ['A', 'B', 'C'], options: { lives: 6 }, first: 0 });
  state = game.apply(state, 0, { type: 'roll' }, rng);
  const pending = game.recover(game.view(state, -1), rng);
  assert.equal(pending.phase, 'announce');
  assert.equal(pending.diceSeat, 0);
  assert.equal(pending.dice.length, 2);
  state = game.apply(state, 0, { type: 'announce', value: 43 }, rng);
  const restarted = game.recover(game.view(state, -1), rng);
  assert.equal(restarted.phase, 'roll');
  assert.equal(restarted.turn, 1);
  assert.equal(restarted.claim, null);
  assert.equal(restarted.dice, null);
  assert.equal('cup' in restarted, false);
});
