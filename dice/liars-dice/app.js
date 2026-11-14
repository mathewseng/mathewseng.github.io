import { mountTable, dieHTML, diceHTML, esc, seatColor, icon } from '../table.js?v=20261114';
import { game, bidText, countText, bidProblem, minimumBid, minFace, diceInPlay, isMatch } from './engine.mjs?v=20261114';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// The bid the acting player is composing; it resets at each new decision.
let draft = null;

const plural = (count) => `${count} ${count === 1 ? 'die' : 'dice'}`;

// A flat face for the picker, whatever the 2D/3D setting.
const faceHTML = (face) => `<span class="tdie tdie--sm" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<span class="pip${PIPS[face].includes(i) ? '' : ' off'}"></span>`).join('')}</span>`;

function defaultDraft(state, seat) {
  if (state.bid) return minimumBid(state);
  // Open on the face you hold most (ties go to the higher face).
  const hand = state.dice[seat] || [];
  let best = 6;
  for (let face = 6; face >= minFace(state); face -= 1) {
    if (hand.filter((die) => die === face).length > hand.filter((die) => die === best).length) best = face;
  }
  return { quantity: 1, face: best };
}

function currentDraft(state, seat) {
  const key = `${state.rollId}:${state.bids.length}:${seat}`;
  if (!draft || draft.key !== key || bidProblem(state, draft.quantity, draft.face)) {
    const start = defaultDraft(state, seat);
    draft = start ? { key, ...start } : null;
  }
  return draft;
}

// The lowest face that can be bid at `quantity`, or 0.
function lowestFace(state, quantity) {
  for (let face = minFace(state); face <= 6; face += 1) if (!bidProblem(state, quantity, face)) return face;
  return 0;
}

function setQuantity(state, quantity) {
  if (!draft) return false;
  const face = bidProblem(state, quantity, draft.face) ? lowestFace(state, quantity) : draft.face;
  if (!face) return false;
  draft.quantity = quantity;
  draft.face = face;
  return true;
}

function setFace(state, face) {
  if (!draft || bidProblem(state, draft.quantity, face)) return false;
  draft.face = face;
  return true;
}

function cupHTML(state, i, ctx, open) {
  const hand = state.dice[i] || [];
  const out = state.counts[i] <= 0 && !hand.length;
  const result = state.result;
  const face = result?.face;
  const turn = state.phase === 'bid' && state.turn === i;
  const loser = result && result.loser === i;
  const cls = ['ld-cup', turn ? 'is-turn' : '', out ? 'is-out' : '', loser ? 'is-loser' : ''].filter(Boolean).join(' ');
  const count = out || (loser && result.out) ? 'Out' : loser ? 'Lost a die' : plural(state.counts[i]);
  const dice = hand.length
    ? diceHTML(hand, {
      small: true,
      hidden: !open,
      rolling: ctx.rolled,
      mark: (k) => open && face != null && isMatch(face, hand[k], state.wild),
      aria: (k) => (open ? `Die showing ${hand[k]}` : 'Hidden die'),
      className: 'ld-cup-dice',
    })
    : '';
  return `<li class="${cls}" style="--seat-color: ${seatColor(i)}"${turn ? ' aria-current="true"' : ''}>
    <span class="ld-cup-head"><span class="dt-dot" aria-hidden="true"></span><strong>${esc(state.names[i])}</strong></span>
    <span class="ld-cup-count">${esc(count)}</span>
    ${dice}
  </li>`;
}

function bidBlock(state) {
  const bid = state.bid;
  if (!bid) {
    return `<div class="ld-bid is-empty">
      <span class="ld-label">No bid yet</span>
      <span class="ld-bid-value"><strong>${diceInPlay(state)}</strong><span class="ld-bid-unit">dice in play</span></span>
    </div>`;
  }
  return `<div class="ld-bid" style="--seat-color: ${seatColor(bid.seat)}" role="img" aria-label="${esc(`${state.names[bid.seat]} bid ${bidText(bid.quantity, bid.face)}`)}">
    <span class="ld-label"><span class="dt-dot" aria-hidden="true"></span>${esc(state.names[bid.seat])} bid</span>
    <span class="ld-bid-value" aria-hidden="true"><strong>${bid.quantity}</strong><span class="ld-times">×</span>${dieHTML(bid.face)}</span>
  </div>`;
}

function foundBlock(state) {
  const result = state.result;
  if (!result) return '';
  return `<div class="ld-bid ld-found ${result.held ? 'is-held' : 'is-short'}" role="img" aria-label="${esc(countText(result.actual, result.face))}">
    <span class="ld-label">There ${result.actual === 1 ? 'was' : 'were'}</span>
    <span class="ld-bid-value" aria-hidden="true"><strong>${result.actual}</strong><span class="ld-times">×</span>${dieHTML(result.face)}</span>
  </div>`;
}

function historyHTML(state) {
  if (!state.bids.length) return '';
  const bids = state.bids.slice(-8);
  return `<ol class="ld-history" aria-label="Bids this round">
    ${bids.map((bid, k) => `<li style="--seat-color: ${seatColor(bid.seat)}"${k === bids.length - 1 && state.phase === 'bid' ? ' class="is-current"' : ''}><strong>${esc(state.names[bid.seat])}</strong> ${esc(bidText(bid.quantity, bid.face))}</li>`).join('')}
  </ol>`;
}

// A name inside a sentence: the default single player is called "You".
const inline = (name) => (name === 'You' ? 'you' : name);

function resultLine(state) {
  const result = state.result;
  if (!result) return '';
  const { names } = state;
  const called = `${names[result.caller]} called Liar on ${inline(names[result.bidder])}.`;
  const verdict = `The bid ${result.held ? 'stood' : 'fell short'}, so ${inline(names[result.loser])} lost a die${result.out ? ' and dropped out' : ''}.`;
  return `<p class="ld-result">${esc(called)} <strong>${esc(verdict)}</strong></p>`;
}

function pickerHTML(state, seat, canAct) {
  const current = currentDraft(state, seat);
  if (!current) {
    return `<div class="dt-actions ld-actions"><button type="button" class="btn btn--lg" data-key="liar" data-act='{"type":"liar"}'${canAct ? '' : ' disabled'}>Liar!</button></div>`;
  }
  const { quantity, face } = current;
  const total = diceInPlay(state);
  const canDown = canAct && quantity > 1 && lowestFace(state, quantity - 1) > 0;
  const canUp = canAct && quantity < total;
  const faces = [];
  for (let f = minFace(state); f <= 6; f += 1) {
    const legal = canAct && !bidProblem(state, quantity, f);
    faces.push(`<button type="button" class="btn ld-face" data-face="${f}" data-key="face-${f}" aria-pressed="${f === face}" aria-label="Face ${f}"${legal ? '' : ' disabled'}>${faceHTML(f)}</button>`);
  }
  const action = JSON.stringify({ type: 'bid', quantity, face });
  return `<div class="ld-picker" role="group" aria-label="Your bid">
    <div class="ld-controls">
      <div class="ld-qty" role="group" aria-label="Quantity">
        <button type="button" class="btn btn--icon btn--lg" data-step="-1" data-key="qty-down" aria-label="One die fewer"${canDown ? '' : ' disabled'}>${icon('minus')}</button>
        <output class="ld-qty-value" aria-live="polite" aria-label="Quantity ${quantity}">${quantity}</output>
        <button type="button" class="btn btn--icon btn--lg" data-step="1" data-key="qty-up" aria-label="One die more"${canUp ? '' : ' disabled'}>${icon('plus')}</button>
      </div>
      <div class="ld-faces" role="group" aria-label="Face">${faces.join('')}</div>
    </div>
    <div class="dt-actions ld-actions">
      <button type="button" class="btn btn--primary btn--lg" data-key="bid" data-act='${esc(action)}'${canAct ? '' : ' disabled'}>Bid ${esc(bidText(quantity, face))}</button>
      <button type="button" class="btn btn--lg" data-key="liar" data-act='{"type":"liar"}'${canAct && state.bid ? '' : ' disabled'}>Liar!</button>
    </div>
  </div>`;
}

function render(board, ctx) {
  const { seat, canAct } = ctx;
  // The host of an online room is handed the full state; show it only what its seat may see.
  const state = game.view(ctx.state, seat);
  const open = state.phase !== 'bid';
  const seats = state.names.map((_, i) => i);
  const order = seat >= 0 ? seats.slice(seat + 1).concat(seats.slice(0, seat)) : seats;
  const cups = order.map((i) => cupHTML(state, i, ctx, open)).join('');

  let mine = '';
  if (seat >= 0) {
    const hand = state.dice[seat] || [];
    const markFace = open ? state.result?.face : canAct ? currentDraft(state, seat)?.face : state.bid?.face;
    const handHTML = hand.length
      ? diceHTML(hand, { rolling: ctx.rolled, mark: (k) => markFace != null && isMatch(markFace, hand[k], state.wild), className: 'ld-hand-dice' })
      : '';
    const loser = state.result?.loser === seat;
    const label = hand.length ? 'Your dice' : 'You are out of dice.';
    mine = `<div class="ld-hand${loser ? ' is-loser' : ''}" style="--seat-color: ${seatColor(seat)}">
      <p class="ld-label"><span class="dt-dot" aria-hidden="true"></span>${esc(label)}</p>
      ${handHTML}
    </div>`;
  }

  let controls = '';
  if (state.phase === 'reveal') {
    controls = seat >= 0 && seat === state.turn
      ? `<div class="dt-actions ld-actions"><button type="button" class="btn btn--primary btn--lg" data-key="next" data-act='{"type":"next"}'${canAct ? '' : ' disabled'}>Next round</button></div>`
      : `<p class="ld-next">${esc(`${state.names[state.turn]} to open round ${state.round + 1}.`)}</p>`;
  } else if (state.phase === 'bid' && seat >= 0 && state.counts[seat] > 0) {
    controls = pickerHTML(state, seat, canAct);
  }

  board.innerHTML = `
    <div class="ld${open ? ' is-open' : ''}">
      <ol class="ld-cups" aria-label="Dice at the table">${cups}</ol>
      <section class="ld-table" aria-label="Bidding">
        <div class="ld-stats">${bidBlock(state)}${foundBlock(state)}</div>
        <div class="ld-round">
          ${state.bid || open ? `<p class="ld-total">${diceInPlay(state)} dice in play</p>` : ''}
          ${historyHTML(state)}
        </div>
        ${resultLine(state)}
      </section>
      ${mine || controls ? `<div class="ld-me">${mine}${controls}</div>` : ''}
    </div>`;
}

function click(event, ctx) {
  if (!ctx.canAct) return;
  const state = game.view(ctx.state, ctx.seat);
  if (state.phase !== 'bid') return;
  currentDraft(state, ctx.seat);
  const step = event.target.closest('[data-step]');
  const face = event.target.closest('[data-face]');
  if (step && setQuantity(state, draft.quantity + Number(step.dataset.step))) ctx.refresh();
  if (face && setFace(state, Number(face.dataset.face))) ctx.refresh();
}

function key(event, ctx) {
  if (!ctx.canAct) return;
  const state = game.view(ctx.state, ctx.seat);
  const k = event.key;
  const onButton = event.target.closest?.('button, a, [role="button"]');
  if (state.phase === 'reveal') {
    if (k === 'Enter' && !onButton) { event.preventDefault(); ctx.act({ type: 'next' }); }
    return;
  }
  if (state.phase !== 'bid') return;
  const current = currentDraft(state, ctx.seat);
  if ((k === 'l' || k === 'L') && state.bid) {
    event.preventDefault();
    ctx.act({ type: 'liar' });
  } else if (k === 'Enter' && !onButton && current) {
    event.preventDefault();
    ctx.act({ type: 'bid', quantity: current.quantity, face: current.face });
  } else if ((k === '+' || k === '=' || k === '-' || k === '−') && current) {
    event.preventDefault();
    if (setQuantity(state, current.quantity + (k === '-' || k === '−' ? -1 : 1))) ctx.refresh();
  } else if (/^[1-6]$/.test(k) && current) {
    event.preventDefault();
    if (setFace(state, Number(k))) ctx.refresh();
  }
}

mountTable(game, { render, click, key });
