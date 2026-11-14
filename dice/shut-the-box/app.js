import { mountTable, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game, TILES, isOpen, canRollOne, openSum, tileText, totals } from './engine.mjs?v=20261114';

// Tiles the acting player has picked. Local to this screen; a new roll or turn clears it.
let picked = [];
let pickedFor = '';
// The box drawn last time, so tiles shut since then can flip down.
let drawn = { key: '', open: 0 };
// The shut box celebrated last, so a re-render does not replay it.
let cheered = '';

const possessive = (name) => (name === 'You' ? 'Your' : /s$/i.test(name) ? `${name}’` : `${name}’s`);
const pickedSum = () => picked.reduce((total, n) => total + n, 0);

function syncPicks(state) {
  const key = `${state.rollId}:${state.turn}:${state.round}`;
  if (key !== pickedFor) {
    picked = [];
    pickedFor = key;
  }
  picked = picked.filter((n) => state.roll > 0 && isOpen(state.open, n));
}

function toggle(state, n) {
  if (!(state.roll > 0) || !isOpen(state.open, n)) return false;
  picked = picked.includes(n) ? picked.filter((tile) => tile !== n) : picked.concat(n);
  return true;
}

function shut(ctx) {
  const { state } = ctx;
  if (!ctx.canAct || !(state.roll > 0) || pickedSum() !== state.roll) return false;
  ctx.act({ type: 'shut', tiles: picked.slice().sort((a, b) => a - b) });
  return true;
}

function caption(state, over) {
  const total = state.dice.reduce((a, b) => a + b, 0);
  if (!state.dice.length) return { text: 'No roll yet', tone: '' };
  const turnSeat = over ? -1 : state.turn;
  if (state.turnRolls > 0 && state.lastSeat === turnSeat) {
    const who = state.names[state.lastSeat];
    if (state.roll > 0) return { text: `${who} rolled ${total}`, tone: '' };
    return { text: `${who} shut ${tileText(state.lastShut)}`, tone: '' };
  }
  const last = state.last;
  if (!last) return { text: `${state.names[state.lastSeat]} rolled ${total}`, tone: '' };
  const who = state.names[last.seat];
  if (last.shut) return { text: `${who} shut the box!`, tone: 'is-cheer' };
  return { text: `${who} could not make ${total}`, tone: 'is-stuck' };
}

function scoreTable(state, over, winners) {
  const sums = totals(state);
  const now = over ? -1 : state.round - 1;
  const head = Array.from({ length: state.rounds }, (_, r) => `<th scope="col"${r === now ? ' class="is-now"' : ''}><abbr title="Round ${r + 1}">R${r + 1}</abbr></th>`).join('');
  const rows = state.names.map((name, i) => {
    const cells = state.scores[i].map((score, r) => {
      const cls = [r === now ? 'is-now' : '', score === 0 ? 'is-shut' : ''].filter(Boolean).join(' ');
      const text = score === null ? '<span aria-hidden="true">–</span><span class="visually-hidden">Not played</span>' : score === 0 ? '0<span class="visually-hidden">, shut the box</span>' : score;
      return `<td${cls ? ` class="${cls}"` : ''}>${text}</td>`;
    }).join('');
    const cls = [i === state.turn && !over ? 'is-turn' : '', winners.includes(i) ? 'is-winner' : ''].filter(Boolean).join(' ');
    return `<tr${cls ? ` class="${cls}"` : ''} style="--seat-color: ${seatColor(i)}"><th scope="row"><span class="stb-name"><span class="dt-dot" aria-hidden="true"></span><span>${esc(name)}</span></span></th>${cells}<td class="stb-total">${sums[i]}</td></tr>`;
  }).join('');
  return `
    <table class="stb-scores" aria-label="Scores by round">
      <colgroup><col />${'<col class="stb-col-round" />'.repeat(state.rounds)}<col class="stb-col-total" /></colgroup>
      <thead><tr><th scope="col"><span class="visually-hidden">Player</span></th>${head}<th scope="col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function render(board, ctx) {
  const { state, canAct, rolled, outcome } = ctx;
  syncPicks(state);
  const over = Boolean(outcome);
  const showLast = over && state.last;
  const boxSeat = showLast ? state.last.seat : state.turn;
  const open = showLast ? state.last.open : state.open;
  const pending = !over && state.roll > 0;
  const choosing = canAct && pending;
  const sum = pickedSum();
  const ready = choosing && sum === state.roll;
  const oneDie = canAct && !pending && canRollOne(state.open);

  // Tiles shut since the last drawing of this same box flip down.
  const boxKey = `${showLast ? state.last.round : state.round}:${boxSeat}`;
  const flipping = drawn.key === boxKey ? drawn.open & ~open : 0;
  drawn = { key: boxKey, open };

  const tiles = TILES.map((n) => {
    const isUp = isOpen(open, n);
    const isPicked = isUp && picked.includes(n);
    const cls = ['stb-tile', isUp ? 'is-open' : 'is-shut', isPicked ? 'is-picked' : '', flipping & (1 << (n - 1)) ? 'is-flipping' : ''].filter(Boolean).join(' ');
    const label = `${n}, ${isUp ? (isPicked ? 'selected' : 'open') : 'shut'}`;
    return `<button type="button" class="${cls}" data-tile="${n}" data-key="tile-${n}" aria-label="${label}"${isUp ? ` aria-pressed="${isPicked}"` : ''}${choosing && isUp ? '' : ' disabled'}><span class="stb-face" aria-hidden="true">${n}</span></button>`;
  }).join('');

  const cap = caption(state, over);
  const dice = state.dice.length
    ? diceHTML(state.dice, { rolling: rolled, className: 'stb-dice-row' })
    : diceHTML([1, 1], { hidden: true, className: 'stb-dice-row', aria: () => 'No roll yet' });

  let stat;
  if (choosing) {
    const tone = sum === state.roll ? ' is-match' : sum > state.roll ? ' is-over' : '';
    stat = `<div class="stb-stat${tone}"><span>Selected</span><strong>${sum} <small>of ${state.roll}</small></strong><span class="stb-note">${picked.length > 1 ? esc(tileText(picked)) : ''}</span></div>`;
  } else {
    stat = `<div class="stb-stat"><span>${over ? 'Left open' : 'Open total'}</span><strong>${openSum(open)}</strong></div>`;
  }

  // Celebrate a shut box once: the caption pops, and the box glows when it is the one just shut.
  const cheerKey = cap.tone === 'is-cheer' ? `${state.rollId}:${state.last.round}:${state.last.seat}` : '';
  const fresh = Boolean(cheerKey) && cheerKey !== cheered;
  if (cheerKey) cheered = cheerKey;
  board.innerHTML = `
    <div class="stb${fresh ? ` is-cheering${showLast ? ' is-final' : ''}` : ''}">
      <section class="stb-box" style="--seat-color: ${seatColor(boxSeat)}" aria-labelledby="stb-owner">
        <div class="stb-head">
          <h2 class="stb-owner" id="stb-owner"><span class="dt-dot" aria-hidden="true"></span><span>${boxSeat === ctx.seat ? 'Your' : esc(possessive(state.names[boxSeat]))} box</span></h2>
          <span class="stb-round">Round ${showLast ? state.last.round : state.round} of ${state.rounds}</span>
        </div>
        <div class="stb-tiles" role="group" aria-label="Tiles">${tiles}</div>
      </section>
      <div class="stb-play">
        <div class="stb-dice ${cap.tone}">
          ${dice}
          <span class="stb-caption">${esc(cap.text)}</span>
        </div>
        ${stat}
      </div>
      <div class="dt-actions stb-actions">
        <button type="button" class="btn ${pending ? '' : 'btn--primary '}btn--lg" data-key="roll" data-act='{"type":"roll","dice":2}'${canAct && !pending ? '' : ' disabled'}>Roll</button>
        ${oneDie ? `<button type="button" class="btn btn--lg" data-key="roll-one" data-act='{"type":"roll","dice":1}'>Roll one die</button>` : ''}
        <button type="button" class="btn ${pending ? 'btn--primary ' : ''}btn--lg" data-key="shut" data-shut${ready ? '' : ' disabled'}>Shut tiles</button>
      </div>
      ${scoreTable(state, over, outcome?.winners || [])}
    </div>`;
}

function click(event, ctx) {
  if (!ctx.canAct) return;
  const tile = event.target.closest('[data-tile]');
  if (tile) {
    syncPicks(ctx.state);
    if (toggle(ctx.state, Number(tile.dataset.tile))) ctx.refresh();
    return;
  }
  if (event.target.closest('[data-shut]')) {
    syncPicks(ctx.state);
    shut(ctx);
  }
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const { state } = ctx;
  syncPicks(state);
  const k = event.key.toLowerCase();
  if (/^[1-9]$/.test(k)) {
    event.preventDefault();
    if (toggle(state, Number(k))) ctx.refresh();
  } else if (k === 'enter') {
    // Only take over Enter when it shuts; otherwise a focused button keeps it.
    if (state.roll > 0 && pickedSum() === state.roll) {
      event.preventDefault();
      shut(ctx);
    }
  } else if (k === 'r' && !(state.roll > 0)) {
    event.preventDefault();
    ctx.act({ type: 'roll', dice: 2 });
  } else if (k === 'o' && !(state.roll > 0) && canRollOne(state.open)) {
    event.preventDefault();
    ctx.act({ type: 'roll', dice: 1 });
  }
}

mountTable(game, { render, click, key });
