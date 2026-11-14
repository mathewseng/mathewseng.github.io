import { mountTable, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game, RANKING, MIA, rank, label, valueOf, atLeast, chance, legalValues } from './engine.mjs?v=20261114';

const COLUMNS = 7;

// The value picked in the announce picker, for one roll only.
let pick = { key: '', value: null };
// The last reveal shown, so the lifted cup animates once.
let shownReveal = '';

const rollKey = (state) => `${state.round}:${state.rollId}:${state.dice || ''}`;
const pct = (p) => `${Math.round(p * 100)}%`;
const beats = (value) => (value === MIA ? 0 : atLeast(value) - chance(value));
const beatsClaim = (value, claim) => !claim || rank(value) > rank(claim.value);

function syncPick(state) {
  const key = rollKey(state);
  if (pick.key === key) return;
  const mine = state.dice ? valueOf(state.dice) : null;
  pick = { key, value: mine != null && beatsClaim(mine, state.claim) ? mine : null };
}

function seatsHTML(state, actor, outcome) {
  return state.names.map((name, i) => {
    const lives = state.lives[i];
    const lost = state.phase === 'reveal' && state.result?.loser === i ? state.result.taken : 0;
    const pips = Array.from({ length: state.maxLives }, (_, p) => {
      const cls = p < lives ? 'is-on' : p < lives + lost ? 'is-lost' : '';
      return `<i${cls ? ` class="${cls}"` : ''}></i>`;
    }).join('');
    const cls = ['mia-seat'];
    if (i === actor && !outcome) cls.push('is-turn');
    if (!lives) cls.push('is-out');
    if (outcome?.winners.includes(i)) cls.push('is-winner');
    return `<li class="${cls.join(' ')}" style="--seat-color: ${seatColor(i)}">
      <span class="mia-seat-name">${esc(name)}</span>
      <span class="mia-pips" role="img" aria-label="${esc(`${name}: ${lives ? `${lives} of ${state.maxLives} lives` : 'out'}`)}">${pips}</span>
    </li>`;
  }).join('');
}

function cupHTML(state, rolled, fresh) {
  const result = state.phase === 'reveal' ? state.result : null;
  const owner = state.cup ? state.diceSeat : -1;
  let faces = [1, 1];
  let hidden = true;
  let caption = 'No roll yet';
  let tone = '';
  if (result?.kind === 'call') {
    faces = result.dice;
    hidden = false;
    caption = `${state.names[result.announcer]} rolled ${label(result.actual)}`;
    tone = result.truth ? 'is-true' : 'is-bluff';
  } else if (result) {
    caption = 'Never shown';
  } else if (state.dice) {
    faces = state.dice;
    hidden = false;
    caption = `You rolled ${label(valueOf(state.dice))}`;
    tone = 'is-mine';
  } else if (owner >= 0) {
    caption = `${state.names[owner]} rolled`;
  }
  const aria = hidden ? () => 'Hidden die' : (i) => `Die showing ${faces[i]}`;
  return `<div class="mia-cup ${tone}">
    ${diceHTML(faces, { hidden, rolling: rolled || fresh, aria, className: 'mia-dice' })}
    <p class="mia-cup-caption">${esc(caption)}</p>
  </div>`;
}

function claimHTML(state) {
  const claim = state.claim;
  const result = state.phase === 'reveal' ? state.result : null;
  const history = state.history.length > 1
    ? `<ol class="mia-history" aria-label="Announcements this round">${state.history.map((entry, i) => `<li style="--seat-color: ${seatColor(entry.seat)}"${i === state.history.length - 1 ? ' class="is-last"' : ''}><span class="dt-dot" aria-hidden="true"></span><span class="visually-hidden">${esc(state.names[entry.seat])}:</span> ${esc(label(entry.value))}</li>`).join('')}</ol>`
    : '';
  if (!claim) {
    return `<div class="mia-claim is-empty">
      <p class="mia-claim-who">Round ${state.round}</p>
      <p class="mia-claim-value">No announcement yet</p>
      <p class="mia-claim-odds">Any value can open the round</p>
    </div>`;
  }
  let odds = claim.value === MIA ? 'Nothing beats Mia' : `${pct(beats(claim.value))} of rolls beat ${label(claim.value)}`;
  let verdict = '';
  if (result?.kind === 'call') verdict = `<p class="mia-verdict ${result.truth ? 'is-true' : 'is-bluff'}">${result.truth ? 'True' : 'Bluff'}</p>`;
  else if (result) verdict = '<p class="mia-verdict">Conceded</p>';
  if (verdict) odds = '';
  return `<div class="mia-claim" style="--seat-color: ${seatColor(claim.seat)}">
    <p class="mia-claim-who">${esc(state.names[claim.seat])} announced</p>
    <p class="mia-claim-value">${esc(label(claim.value))}</p>
    ${verdict || `<p class="mia-claim-odds">${esc(odds)}</p>`}
    ${history}
  </div>`;
}

function ladderHTML(state, picking) {
  const claim = state.claim;
  const floor = claim ? rank(claim.value) : -1;
  const mine = state.dice ? valueOf(state.dice) : null;
  const actual = state.phase === 'reveal' && state.result?.kind === 'call' ? state.result.actual : null;
  const cells = RANKING.map((value, i) => {
    const cls = ['mia-cell'];
    if (value === MIA) cls.push('is-mia');
    if (i <= floor) cls.push('is-below');
    if (claim?.value === value) cls.push('is-claim');
    if (value === mine) cls.push('is-mine');
    if (value === actual) cls.push('is-actual');
    const text = `<span class="mia-cell-value">${esc(label(value))}</span>${value === mine ? '<span class="mia-cell-tag" aria-hidden="true">Rolled</span>' : ''}`;
    if (!picking) return `<span class="${cls.join(' ')}">${text}</span>`;
    const selected = pick.value === value;
    const name = `${label(value)}${value === mine ? ', your roll' : ''}`;
    return `<button type="button" class="${cls.join(' ')}" data-pick="${value}" data-key="pick-${value}" aria-pressed="${selected}" aria-label="${esc(name)}"${i <= floor ? ' disabled' : ''}>${text}</button>`;
  }).join('');
  const color = claim ? ` style="--seat-color: ${seatColor(claim.seat)}"` : '';
  return `<div class="mia-ladder${picking ? ' is-picking' : ''}"${color} role="group" aria-label="${picking ? 'Pick a value to announce' : 'Values from lowest to highest'}">${cells}</div>`;
}

function noteHTML(state, canAct) {
  const claim = state.claim;
  let text = 'Low to high: doubles beat 65, and Mia beats all.';
  let tone = '';
  if (canAct && state.phase === 'announce' && state.dice) {
    const mine = valueOf(state.dice);
    if (pick.value == null) {
      text = claim ? `Pick a value above ${label(claim.value)}.` : 'Pick any value.';
    } else if (rank(pick.value) <= rank(mine)) {
      text = pick.value === mine ? `${label(pick.value)} is the truth.` : `${label(pick.value)} is true: you rolled ${label(mine)}.`;
      tone = 'is-true';
    } else {
      text = `${label(pick.value)} is a bluff: you rolled ${label(mine)}.`;
      tone = 'is-bluff';
    }
  } else if (state.phase === 'decide' && claim?.value === MIA) {
    text = 'A true Mia costs the caller 2 lives. Conceding costs 1.';
  } else if (canAct && state.phase === 'decide') {
    text = `Believe it and you must announce more than ${label(claim.value)}.`;
  }
  return `<p class="mia-note${tone ? ` ${tone}` : ''}">${esc(text)}</p>`;
}

function actionsHTML(state, canAct, outcome) {
  if (outcome) return '';
  const btn = (text, action, key, primary = false, disabled = false) =>
    `<button type="button" class="btn btn--lg${primary ? ' btn--primary' : ''}" data-key="${key}" data-act='${esc(JSON.stringify(action))}'${disabled || !canAct ? ' disabled' : ''}>${esc(text)}</button>`;
  let buttons = '';
  if (state.phase === 'roll') buttons = btn('Roll', { type: 'roll' }, 'roll', true);
  else if (state.phase === 'decide' && state.claim.value === MIA) buttons = btn('Call', { type: 'call' }, 'call') + btn('Concede', { type: 'concede' }, 'concede', true);
  else if (state.phase === 'decide') buttons = btn('Call bluff', { type: 'call' }, 'call') + btn('Believe and roll', { type: 'roll' }, 'roll', true);
  else if (state.phase === 'announce') {
    const ready = canAct && pick.value != null && beatsClaim(pick.value, state.claim);
    buttons = ready
      ? btn(`Announce ${label(pick.value)}`, { type: 'announce', value: pick.value }, 'announce', true)
      : `<button type="button" class="btn btn--lg btn--primary" data-key="announce" disabled>Announce</button>`;
  } else buttons = btn('Next round', { type: 'next' }, 'next', true);
  return `<div class="dt-actions">${buttons}</div>`;
}

function render(board, ctx) {
  const { state, actor, canAct, rolled, outcome } = ctx;
  const picking = canAct && state.phase === 'announce' && Boolean(state.dice);
  if (picking) syncPick(state);
  let fresh = false;
  if (state.phase === 'reveal' && state.result?.kind === 'call') {
    const key = rollKey(state);
    fresh = shownReveal !== '' && shownReveal !== key;
    shownReveal = key;
  } else if (!shownReveal) {
    shownReveal = '-';
  }
  board.innerHTML = `
    <div class="mia${fresh ? ' is-fresh' : ''}" data-phase="${state.phase}">
      <ol class="mia-seats" aria-label="Lives">${seatsHTML(state, actor, outcome)}</ol>
      <div class="mia-table">
        ${cupHTML(state, rolled, fresh)}
        ${claimHTML(state)}
      </div>
      <div class="mia-pick">
        ${ladderHTML(state, picking)}
        ${noteHTML(state, canAct)}
      </div>
      ${actionsHTML(state, canAct, outcome)}
    </div>`;
}

function click(event, ctx) {
  const cell = event.target.closest('[data-pick]');
  if (!cell || cell.disabled || !ctx.canAct || ctx.state.phase !== 'announce') return;
  syncPick(ctx.state);
  pick.value = Number(cell.dataset.pick);
  ctx.refresh();
}

function movePick(ctx, step) {
  const legal = legalValues(ctx.state.claim?.value ?? null);
  syncPick(ctx.state);
  const lowest = rank(legal[0]);
  const current = pick.value == null ? lowest - (step > 0 ? 1 : 0) : rank(pick.value);
  const next = Math.min(RANKING.length - 1, Math.max(lowest, current + step));
  pick.value = RANKING[next];
  ctx.refresh();
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const { state } = ctx;
  const k = event.key.toLowerCase();
  const onButton = event.target.closest?.('button');
  if (state.phase === 'roll' && k === 'r') { event.preventDefault(); ctx.act({ type: 'roll' }); return; }
  if (state.phase === 'decide') {
    if (k === 'c') { event.preventDefault(); ctx.act({ type: 'call' }); }
    if (k === 'r' && state.claim.value !== MIA) { event.preventDefault(); ctx.act({ type: 'roll' }); }
    return;
  }
  if (state.phase === 'announce') {
    const steps = { arrowleft: -1, arrowright: 1, arrowup: -COLUMNS, arrowdown: COLUMNS };
    if (k in steps) { event.preventDefault(); movePick(ctx, steps[k]); return; }
    if (k === 'enter' && !onButton) {
      syncPick(state);
      if (pick.value != null && beatsClaim(pick.value, state.claim)) { event.preventDefault(); ctx.act({ type: 'announce', value: pick.value }); }
    }
    return;
  }
  if (state.phase === 'reveal' && (k === 'enter' || k === 'n') && !onButton) { event.preventDefault(); ctx.act({ type: 'next' }); }
}

mountTable(game, { render, click, key });
