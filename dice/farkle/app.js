import { mountTable, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game, fmt, scoreSelection, scorableDice } from './engine.mjs?v=20261114';

// The dice picked to set aside: local to this screen, cleared with every new roll or turn.
let picked = new Set();
let pickedFor = '';

function picks(state) {
  const key = `${state.rollId}:${state.turn}:${state.scores.join(',')}`;
  if (key !== pickedFor) {
    pickedFor = key;
    picked = new Set();
  }
  return picked;
}

// What the current selection is worth and which moves it allows.
function selection(state, canAct) {
  const roll = state.phase === 'choose' ? state.roll : null;
  const dice = roll ? [...picks(state)].filter((i) => i < roll.length).sort((a, b) => a - b) : [];
  const points = dice.length ? scoreSelection(dice.map((i) => roll[i])) : 0;
  const total = state.turnTotal + points;
  const left = roll ? roll.length - dice.length || 6 : 6;
  const short = state.opening > 0 && state.scores[state.turn] === 0 && total < state.opening;
  return {
    roll,
    dice,
    points,
    total,
    left,
    short,
    canKeep: Boolean(canAct && roll && points),
    canBank: Boolean(canAct && roll && points && !short),
  };
}

const keepAct = (dice, then) => esc(JSON.stringify({ type: 'keep', dice, then }));

function caption(state, ctx, sel) {
  const { canAct } = ctx;
  if (sel.roll) {
    const name = state.names[state.turn];
    const rolled = state.hot ? `${name} rolled all six again (hot dice).` : `${name} rolled ${sel.roll.length === 1 ? '1 die' : `${sel.roll.length} dice`}.`;
    if (!canAct) return { text: rolled };
    if (!sel.dice.length) return { text: `${state.hot ? 'Hot dice. ' : ''}Pick the scoring dice to set aside.` };
    if (!sel.points) return { text: 'Every die you set aside must score.', tone: 'bad' };
    const worth = `Set aside for ${fmt(sel.points)}.`;
    return { text: sel.short ? `${worth} A first bank needs ${fmt(state.opening)}.` : worth, tone: 'good' };
  }
  const last = state.last;
  if (last?.kind === 'farkle') return { text: `Farkle: ${state.names[last.seat]} ${last.lost ? `lost ${fmt(last.lost)}` : 'scored nothing'}.`, tone: 'bad' };
  if (last?.kind === 'bank') return { text: `${state.names[last.seat]} banked ${fmt(last.amount)}.` };
  return { text: 'No roll yet.' };
}

function render(board, ctx) {
  const { state, canAct, rolled } = ctx;
  const sel = selection(state, canAct);
  const over = Boolean(state.winners);
  const lanes = state.names.map((name, i) => {
    const banked = state.scores[i];
    const live = i === state.turn && !over;
    const risk = live ? state.turnTotal : 0;
    return `<li class="fk-lane${live ? ' is-turn' : ''}" style="--seat-color: ${seatColor(i)}; --bank: ${Math.min(1, banked / state.target)}; --risk: ${Math.min(1, (banked + risk) / state.target)}">
      <span class="fk-lane-name">${esc(name)}</span>
      <span class="fk-track" aria-hidden="true"><span class="fk-risk"></span><span class="fk-bank"></span></span>
      <span class="fk-lane-score">${fmt(banked)}${risk ? `<small> +${fmt(risk)}</small>` : ''}</span>
    </li>`;
  }).join('');

  const farkle = !sel.roll && state.last?.kind === 'farkle' ? state.last : null;
  const scorable = sel.roll && canAct ? scorableDice(sel.roll) : [];
  let dice;
  if (sel.roll) {
    dice = diceHTML(sel.roll, {
      select: canAct,
      held: (i) => picked.has(i),
      mark: (i) => canAct && scorable[i] && !picked.has(i),
      rolling: rolled,
      aria: (i) => `Die ${i + 1} showing ${sel.roll[i]}${picked.has(i) ? ', set aside' : scorable[i] ? ', can score' : ''}`,
      key: 'die',
    });
  } else if (farkle) {
    dice = diceHTML(farkle.dice, { rolling: rolled, aria: (i) => `Farkle die showing ${farkle.dice[i]}` });
  } else {
    dice = `<div aria-hidden="true">${diceHTML([1, 1, 1, 1, 1, 1], { hidden: true })}</div>`;
  }
  const note = caption(state, ctx, sel);

  const kept = state.kept.length
    ? `<ul class="fk-kept" aria-label="Set aside this turn">${state.kept.map((group) => `<li><span class="visually-hidden">${group.faces.join(' ')} for ${fmt(group.points)}</span><span class="fk-group" aria-hidden="true">${diceHTML(group.faces, { small: true })}<span>${fmt(group.points)}</span></span></li>`).join('')}</ul>`
    : '<p class="fk-empty">Nothing set aside yet.</p>';

  const choosing = state.phase === 'choose';
  const actions = choosing
    ? `<button type="button" class="btn btn--primary btn--lg" data-key="go" data-act='${keepAct(sel.dice, 'roll')}'${sel.canKeep ? '' : ' disabled'}>Keep and roll${sel.points ? ` ${sel.left}` : ''}</button>
       <button type="button" class="btn btn--lg" data-key="bank" data-act='${keepAct(sel.dice, 'bank')}'${sel.canBank ? '' : ' disabled'}>Bank${sel.points ? ` ${fmt(sel.total)}` : ''}</button>`
    : `<button type="button" class="btn btn--primary btn--lg" data-key="go" data-act='{"type":"roll"}'${canAct ? '' : ' disabled'}>Roll</button>`;

  board.innerHTML = `
    <div class="fk">
      <ol class="fk-race" aria-label="Scores, first to ${fmt(state.target)}">${lanes}</ol>
      <div class="fk-play">
        <div class="fk-roll${farkle ? ' is-farkle' : ''}${state.hot && sel.roll ? ' is-hot' : ''}">
          ${dice}
          <p class="fk-caption${note.tone ? ` is-${note.tone}` : ''}">${esc(note.text)}</p>
        </div>
        <div class="fk-turn">
          <div class="fk-total">
            <span>Turn total</span>
            <strong>${fmt(state.turnTotal)}${sel.points ? `<em> +${fmt(sel.points)}</em>` : ''}</strong>
          </div>
          ${kept}
        </div>
      </div>
      <div class="dt-actions">${actions}</div>
    </div>`;
}

function toggle(ctx, i) {
  const { state } = ctx;
  if (!ctx.canAct || state.phase !== 'choose' || i < 0 || i >= state.roll.length) return;
  const set = picks(state);
  if (set.has(i)) set.delete(i); else set.add(i);
  ctx.refresh();
}

function click(event, ctx) {
  const die = event.target.closest('[data-die]');
  if (die) toggle(ctx, Number(die.dataset.die));
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const { state } = ctx;
  const k = event.key.toLowerCase();
  if (/^[1-6]$/.test(k)) {
    event.preventDefault();
    toggle(ctx, Number(k) - 1);
    return;
  }
  if (k !== 'r' && k !== 'b') return;
  event.preventDefault();
  if (state.phase === 'start') {
    if (k === 'r') ctx.act({ type: 'roll' });
    return;
  }
  const sel = selection(state, true);
  if (k === 'r' && sel.canKeep) ctx.act({ type: 'keep', dice: sel.dice, then: 'roll' });
  if (k === 'b' && sel.canBank) ctx.act({ type: 'keep', dice: sel.dice, then: 'bank' });
}

mountTable(game, { render, click, key });
