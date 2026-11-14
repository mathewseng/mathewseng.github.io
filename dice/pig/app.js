import { mountTable, dieHTML, diceHTML, esc, seatColor } from '../table.js?v=20261114';
import { game } from './engine.mjs?v=20261114';

function render(board, ctx) {
  const { state, canAct, rolled } = ctx;
  const target = state.target;
  const lanes = state.names.map((name, i) => {
    const banked = state.scores[i];
    const risk = i === state.turn && state.winner < 0 ? state.turnTotal : 0;
    return `<li class="pig-lane${i === state.turn && state.winner < 0 ? ' is-turn' : ''}" style="--seat-color: ${seatColor(i)}; --bank: ${Math.min(1, banked / target)}; --risk: ${Math.min(1, (banked + risk) / target)}">
      <span class="pig-lane-name">${esc(name)}</span>
      <span class="pig-track" aria-hidden="true"><span class="pig-risk"></span><span class="pig-bank"></span></span>
      <span class="pig-lane-score">${banked}${risk ? `<small> +${risk}</small>` : ''}</span>
    </li>`;
  }).join('');

  const busted = state.lastRoll === 1;
  const face = state.lastRoll || 1;
  const rollOwner = state.lastSeat >= 0 ? state.names[state.lastSeat] : '';
  const caption = !state.lastRoll ? 'No roll yet' : busted ? `${rollOwner} rolled a 1` : `${rollOwner} rolled ${face}`;
  board.innerHTML = `
    <div class="pig">
      <ol class="pig-race" aria-label="Scores, first to ${target}">${lanes}</ol>
      <div class="pig-play">
        <div class="pig-die${busted ? ' is-bust' : ''}">
          <span class="tdie-slot" role="img" aria-label="${esc(caption)}">${dieHTML(face, { rolling: rolled, hidden: !state.lastRoll })}</span>
          <span class="pig-caption">${esc(caption)}</span>
        </div>
        <div class="pig-turn">
          <span>Turn total</span>
          <strong>${state.turnTotal}</strong>
          ${state.rolls.length ? diceHTML(state.rolls, { small: true, className: 'pig-rolls' }) : '<p class="pig-empty">Nothing at risk yet.</p>'}
        </div>
      </div>
      <div class="dt-actions">
        <button type="button" class="btn btn--primary btn--lg" data-key="roll" data-act='{"type":"roll"}'${canAct ? '' : ' disabled'}>Roll</button>
        <button type="button" class="btn btn--lg" data-key="hold" data-act='{"type":"hold"}'${canAct && state.turnTotal > 0 ? '' : ' disabled'}>Hold${state.turnTotal ? ` ${state.turnTotal}` : ''}</button>
      </div>
    </div>`;
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const k = event.key.toLowerCase();
  if (k === 'r') { event.preventDefault(); ctx.act({ type: 'roll' }); }
  if (k === 'h' && ctx.state.turnTotal > 0) { event.preventDefault(); ctx.act({ type: 'hold' }); }
}

mountTable(game, { render, key });
