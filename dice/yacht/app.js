import { mountTable, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game, UPPER, LOWER, LABELS, ROUNDS, UPPER_TARGET, YACHT_BONUS, scoreBox, legalBoxes, jokerActive, totals, filledCount } from './engine.mjs?v=20261114';

// The acting player's holds live here until the next roll or turn, when they
// reset to the dice the last roll kept.
let holds = { key: null, set: new Set() };

function heldSet(state) {
  const key = `${state.turn}:${state.rollId}:${state.rollsUsed}`;
  if (holds.key !== key) holds = { key, set: new Set(state.kept.flatMap((kept, i) => (kept ? [i] : []))) };
  return holds.set;
}

const actAttr = (action) => `data-act="${esc(JSON.stringify(action))}"`;

function caption(state) {
  if (state.done) return `<strong>All ${ROUNDS} rounds played</strong>`;
  const round = `<strong>Round ${filledCount(state.cards[state.turn]) + 1} of ${ROUNDS}</strong>`;
  if (state.rollsUsed) {
    const joker = jokerActive(state.dice, state.cards[state.turn]);
    return `${round} · Roll ${state.rollsUsed} of 3${joker ? ` · <span class="yt-joker">Yacht bonus +${YACHT_BONUS}</span>` : ''}`;
  }
  const { last } = state;
  if (!last) return round;
  return `${round} · ${esc(state.names[last.seat])} scored ${last.score} in ${LABELS[last.box]}${last.bonus ? ` and a ${last.bonus} Yacht bonus` : ''}.`;
}

function diceRow(state, canAct, rolled) {
  if (!state.rollsUsed) return diceHTML([1, 1, 1, 1, 1], { hidden: true, aria: () => 'Not rolled yet', className: 'yt-dice' });
  const rolling = (i) => rolled && !state.kept[i];
  if (canAct && state.rollsUsed < 3) {
    const held = heldSet(state);
    return diceHTML(state.dice, {
      select: true,
      held: (i) => held.has(i),
      rolling,
      label: (i) => (held.has(i) ? 'Held' : ''),
      aria: (i) => `Die ${i + 1} showing ${state.dice[i]}`,
      key: 'die',
      className: 'yt-dice',
    });
  }
  return diceHTML(state.dice, {
    held: (i) => state.kept[i],
    rolling,
    label: (i) => (state.kept[i] ? 'Kept' : ''),
    aria: (i) => `Die showing ${state.dice[i]}${state.kept[i] ? ', kept' : ''}`,
    className: 'yt-dice',
  });
}

function scorecard(state, canAct) {
  const turn = state.done ? -1 : state.turn;
  const picking = canAct && state.rollsUsed > 0;
  const legal = picking ? legalBoxes(state.dice, state.cards[turn]) : [];
  const sums = state.names.map((_, i) => totals(state, i));
  const best = Math.max(...sums.map((entry) => entry.total));
  const cell = (i, body, extra = '') => `<td class="num${i === turn ? ' is-turn' : ''}${extra}" style="--seat-color: ${seatColor(i)}">${body}</td>`;

  const boxRow = (id, section = false) => `<tr${section ? ' class="yt-section"' : ''}><th scope="row">${LABELS[id]}</th>${state.names.map((_, i) => {
    const value = state.cards[i][id];
    if (value != null) {
      const last = state.last?.seat === i && state.last.box === id;
      return cell(i, last ? `<span class="yt-last" title="Scored last">${value}</span>` : String(value));
    }
    if (!picking || i !== turn) return cell(i, '');
    if (!legal.includes(id)) return cell(i, '<span class="yt-blocked" title="The joker rule sends this Yacht elsewhere">–</span>');
    const score = scoreBox(state.dice, id, state.cards[i]);
    return cell(i, `<button type="button" class="yt-pick${score ? '' : ' is-zero'}" data-key="box-${id}" ${actAttr({ type: 'score', box: id })} aria-label="Score ${score} in ${LABELS[id]}">${score}</button>`, ' yt-open');
  }).join('')}</tr>`;

  const sumRow = (label, value, cls = '') => `<tr class="yt-sum${cls}"><th scope="row">${label}</th>${state.names.map((_, i) => cell(i, value(i))).join('')}</tr>`;
  const upperDone = (i) => UPPER.every((id) => state.cards[i][id] != null);

  return `
    <div class="yt-card table-wrap table-wrap--sticky-col">
      <table class="data-table yt-table" aria-label="Scorecard">
        <thead><tr><th scope="col"><span class="visually-hidden">Box</span></th>${state.names.map((name, i) => `<th scope="col" class="yt-player${i === turn ? ' is-turn' : ''}" style="--seat-color: ${seatColor(i)}"${i === turn ? ' aria-current="true"' : ''}><span>${esc(name)}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${UPPER.map((id) => boxRow(id)).join('')}
          ${sumRow('Upper subtotal', (i) => (sums[i].upper < UPPER_TARGET && !upperDone(i) ? `${sums[i].upper}<span class="yt-of">/${UPPER_TARGET}</span>` : String(sums[i].upper)))}
          ${sumRow('Bonus', (i) => (sums[i].bonus ? String(sums[i].bonus) : upperDone(i) ? '0' : ''))}
          ${LOWER.map((id, n) => boxRow(id, n === 0)).join('')}
          ${sumRow('Yacht bonus', (i) => (sums[i].yachtBonus ? String(sums[i].yachtBonus) : ''), ' yt-section')}
        </tbody>
        <tfoot><tr><th scope="row">Total</th>${state.names.map((_, i) => cell(i, String(sums[i].total), state.done && sums[i].total === best ? ' is-best' : '')).join('')}</tr></tfoot>
      </table>
    </div>`;
}

// A wide scorecard scrolls sideways in its wrapper: keep that position across
// renders, and bring the acting player's column into view when their turn starts.
let shownTurn = null;

function keepCardInView(board, before, state, canAct) {
  const card = board.querySelector('.yt-card');
  if (!card) return;
  card.scrollLeft = before;
  const turnKey = `${state.turn}:${filledCount(state.cards[state.turn])}`;
  if (!canAct || turnKey === shownTurn) return;
  shownTurn = turnKey;
  const column = card.querySelector('thead th.is-turn');
  const labels = card.querySelector('thead th');
  if (!column || !labels) return;
  const left = column.offsetLeft - labels.offsetWidth;
  const right = column.offsetLeft + column.offsetWidth - card.clientWidth;
  if (card.scrollLeft > left) card.scrollLeft = left;
  else if (card.scrollLeft < right) card.scrollLeft = right;
}

function render(board, ctx) {
  const { state, canAct, rolled } = ctx;
  const held = heldSet(state);
  const canRoll = canAct && state.rollsUsed < 3 && (state.rollsUsed === 0 || held.size < 5);
  const label = state.rollsUsed === 0 ? 'Roll' : state.rollsUsed < 3 ? `Roll again · ${3 - state.rollsUsed} left` : 'No rolls left';
  const keep = state.rollsUsed ? [...held].sort((a, b) => a - b) : [];
  const scrolled = board.querySelector('.yt-card')?.scrollLeft || 0;
  board.innerHTML = `
    <div class="yt">
      <div class="yt-layout">
        <section class="yt-play" aria-label="Dice">
          ${diceRow(state, canAct, rolled)}
          <p class="yt-caption">${caption(state)}</p>
          <div class="dt-actions">
            <button type="button" class="btn btn--primary btn--lg" data-key="roll" ${actAttr({ type: 'roll', keep })}${canRoll ? '' : ' disabled'}>${label}</button>
          </div>
        </section>
        ${scorecard(state, canAct)}
      </div>
    </div>`;
  keepCardInView(board, scrolled, state, canAct);
}

function toggle(ctx, i) {
  const { state } = ctx;
  if (!ctx.canAct || !state.rollsUsed || state.rollsUsed >= 3 || !(i >= 0 && i < 5)) return;
  const held = heldSet(state);
  if (held.has(i)) held.delete(i); else held.add(i);
  ctx.refresh();
}

function click(event, ctx) {
  const die = event.target.closest('[data-die]');
  if (die) toggle(ctx, Number(die.dataset.die));
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const k = event.key.toLowerCase();
  if (k >= '1' && k <= '5') {
    event.preventDefault();
    toggle(ctx, Number(k) - 1);
  } else if (k === 'r') {
    event.preventDefault();
    const { state } = ctx;
    const held = heldSet(state);
    if (state.rollsUsed >= 3 || (state.rollsUsed && held.size >= 5)) return;
    ctx.act({ type: 'roll', keep: state.rollsUsed ? [...held].sort((a, b) => a - b) : [] });
  }
}

mountTable(game, { render, click, key });
