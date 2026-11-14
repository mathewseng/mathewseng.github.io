import { mountTable, dieHTML, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game, ROLES, ROLLS, qualified, cargoOf, rollsLeft, joinNames } from './engine.mjs?v=20261114';

// Cargo dice picked for the next reroll. Local to this screen; a new roll or turn clears it.
let picks = { key: '', set: new Set() };
function picked(state) {
  const key = `${state.round}:${state.turn}:${state.rollId}`;
  if (picks.key !== key) picks = { key, set: new Set() };
  return picks.set;
}

const canPick = (state, canAct) => canAct && qualified(state) && rollsLeft(state) > 0;

// No pick means both cargo dice; otherwise just the picked ones.
function rollAction(state, canAct) {
  if (!qualified(state)) return { type: 'roll', reroll: [] };
  const set = picked(state);
  return { type: 'roll', reroll: set.size && canAct ? [...set].sort((a, b) => a - b) : [0, 1] };
}

function rollLabel(state, canAct) {
  if (!canAct) return 'Roll';
  if (!qualified(state)) return `Roll ${ROLES.length + 2 - state.stage} dice`;
  const count = rollAction(state, canAct).reroll.length;
  return `Reroll ${count} cargo ${count === 1 ? 'die' : 'dice'}`;
}

function turnText(names, turn) {
  if (turn.cargo) return `${names[turn.seat]} loaded ${turn.cargo}.`;
  return `${names[turn.seat]} missed the ${ROLES[turn.stage].name}.`;
}

function roundText(state, result) {
  if (!result.winners.length) return 'Nobody loaded cargo.';
  const who = joinNames(result.winners.map((seat) => state.names[seat]));
  return result.winners.length > 1 ? `${who} shared it with ${result.best}.` : `${who} won it with ${result.best}.`;
}

function render(board, ctx) {
  const { state, canAct, rolled } = ctx;
  const over = state.winners.length > 0;
  // Until the next roll, the board keeps the turn that just ended in view.
  const done = state.rolls === 0 && state.last ? state.last : null;
  const turn = done || { seat: state.turn, stage: state.stage, dice: state.dice, cargo: cargoOf(state), rolls: state.rolls, fresh: state.fresh, freshSlots: state.freshSlots };
  const finished = over || (done && done.round !== state.round) ? state.rounds[state.rounds.length - 1] : null;
  const loaded = turn.stage === ROLES.length;

  // This round's cargos in playing order, or the round that just finished.
  const cargos = finished ? finished.cargos : state.cargos;
  const starter = finished ? finished.starter : state.starter;
  const best = Math.max(0, ...cargos.map((value) => value ?? 0));
  const leaders = finished ? finished.winners : best > 0 ? cargos.map((value, i) => (value === best ? i : -1)).filter((i) => i >= 0) : [];
  const order = state.names.map((_, i) => (starter + i) % state.names.length);
  const seats = order.map((i) => {
    const value = cargos[i];
    const live = !finished && i === state.turn;
    const wins = Array.from({ length: state.target }, (_, w) => `<span class="scc-pip${w < state.wins[i] ? ' is-won' : ''}"></span>`).join('');
    return `<li class="scc-seat${live ? ' is-turn' : ''}${leaders.includes(i) ? ' is-best' : ''}" style="--seat-color: ${seatColor(i)}">
      <span class="scc-seat-name"><span class="dt-dot" aria-hidden="true"></span><span>${esc(state.names[i])}</span></span>
      <strong class="scc-seat-cargo${value === null ? ' is-empty' : ''}">${value === null ? '—' : value}</strong>
      <span class="scc-pips" role="img" aria-label="${state.wins[i]} of ${state.target} round wins">${wins}</span>
    </li>`;
  }).join('');

  // Ship, captain and crew: set-aside dice, or an outlined slot for the next one needed.
  const slots = ROLES.map((role, i) => {
    const filled = i < turn.stage;
    const body = filled
      ? `<span class="tdie-slot" role="img" aria-label="${role.label}: ${role.face}">${dieHTML(role.face, { rolling: rolled && turn.freshSlots.includes(i) })}</span>`
      : `<span class="scc-ghost" role="img" aria-label="${role.label}: needs a ${role.face}">${role.face}</span>`;
    return `<div class="scc-slot${filled ? ' is-filled' : i === turn.stage && !done ? ' is-next' : ''}">${body}<span class="scc-slot-label">${role.label}</span></div>`;
  }).join('');

  const pick = !done && canPick(state, canAct);
  const set = picked(state);
  let hold;
  if (turn.dice.length) {
    hold = diceHTML(turn.dice, {
      select: pick,
      held: (i) => pick && set.has(i),
      rolling: (i) => rolled && turn.fresh.includes(i),
      label: pick ? (i) => (set.has(i) ? 'Reroll' : '') : null,
      aria: (i) => `${loaded ? 'Cargo die' : 'Die'} showing ${turn.dice[i]}${pick ? (set.has(i) ? ', picked to reroll' : ', tap to reroll only this die') : ''}`,
      key: 'cargo',
      className: 'scc-dice',
    });
  } else {
    hold = `<div class="tdice scc-dice" aria-hidden="true">${'<span class="scc-ghost scc-ghost--blank"></span>'.repeat(5)}</div>`;
  }

  let note;
  if (done) note = turnText(state.names, done);
  else if (!state.rolls) note = 'Roll for a 6, then a 5, then a 4.';
  else if (!loaded) note = `Need a ${ROLES[turn.stage].face} for the ${ROLES[turn.stage].name}.`;
  else if (pick) note = set.size ? 'Only the picked dice reroll.' : 'Pick cargo dice to reroll, or stand.';
  else note = 'Ship, captain and crew aboard.';

  const left = rollsLeft(state);
  const rollsMeter = done
    ? ''
    : `<span class="scc-rolls"><span class="scc-roll-pips" aria-hidden="true">${Array.from({ length: ROLLS }, (_, i) => `<span class="scc-pip${i < left ? ' is-won' : ''}"></span>`).join('')}</span>${left} ${left === 1 ? 'roll' : 'rolls'} left</span>`;

  const action = rollAction(state, canAct);
  const cargo = cargoOf(state);
  board.innerHTML = `
    <div class="scc">
      <section class="scc-round" aria-labelledby="scc-round-title">
        <div class="scc-round-head">
          <h2 id="scc-round-title">Round ${finished ? finished.round : state.round}</h2>
          <span class="scc-round-note">${esc(finished ? roundText(state, finished) : `First to ${state.target} round wins`)}</span>
        </div>
        <ol class="scc-cargos${state.names.length > 4 ? ' scc-cargos--tight' : ''}">${seats}</ol>
      </section>
      <div class="scc-play${done ? ' is-done' : ''}" style="--seat-color: ${seatColor(turn.seat)}">
        <div class="scc-row">
          <div class="scc-ship" role="group" aria-label="Ship, captain and crew">${slots}</div>
          <div class="scc-hold" role="group" aria-label="${loaded ? 'Cargo' : 'Dice in play'}">${hold}</div>
          <div class="scc-cargo"><span>Cargo</span><strong${loaded || done ? '' : ' class="is-empty"'}>${loaded || done ? turn.cargo : '—'}</strong></div>
        </div>
        <div class="scc-foot">
          <p class="scc-note"><span class="dt-dot" aria-hidden="true"></span>${esc(note)}</p>
          ${rollsMeter}
        </div>
      </div>
      <div class="dt-actions scc-actions">
        <button type="button" class="btn btn--primary btn--lg" data-key="roll" data-act='${esc(JSON.stringify(action))}'${canAct ? '' : ' disabled'}>${esc(rollLabel(state, canAct))}</button>
        <button type="button" class="btn btn--lg" data-key="stand" data-act='{"type":"stand"}'${canAct && qualified(state) ? '' : ' disabled'}>${canAct && qualified(state) ? `Stand on ${cargo}` : 'Stand'}</button>
      </div>
    </div>`;
}

function toggle(ctx, index) {
  if (!canPick(ctx.state, ctx.canAct) || index < 0 || index >= ctx.state.dice.length) return;
  const set = picked(ctx.state);
  if (set.has(index)) set.delete(index); else set.add(index);
  ctx.refresh();
}

function click(event, ctx) {
  const die = event.target.closest('[data-die]');
  if (die) toggle(ctx, Number(die.dataset.die));
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const k = event.key.toLowerCase();
  if (/^[1-5]$/.test(k)) {
    event.preventDefault();
    toggle(ctx, Number(k) - 1);
  } else if (k === 'r') {
    event.preventDefault();
    ctx.act(rollAction(ctx.state, ctx.canAct));
  } else if (k === 's' && qualified(ctx.state)) {
    event.preventDefault();
    ctx.act({ type: 'stand' });
  }
}

mountTable(game, { render, click, key });
