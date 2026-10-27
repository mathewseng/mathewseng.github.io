import { SCORING, PAYTABLE, settings, validateDice, scoreHand, settlement, newRound, finishRound } from './engine.mjs';
import { bindDiceStyle, diceStyle } from '../display.js';
import { paintDie } from '../reports/dice-view.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
const sign = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
const STORAGE = 'draw-dice-v1';
const presetKey = c => [c.scoring, c.n, c.scoring === 'poker' ? 'paytable' : c.settlement, c.doubling, c.scoring === 'cribbage' ? c.runs : 'categories'].join(':');
const defaults = (c = {}) => settings({ ...c, fee: c.scoring === 'yahtzee' ? [0, 0, 8, 16, 24, 30, 38, 45][c.n || 5] : [0, 0, 2, 4, 7, 10, 14, 19][c.n || 5], payouts: {} });
let config = defaults(), presets = {}, round = null, pnl = 0, hands = 0, history = [];
let busy = false, animationTimer, worker, solverId = 0, solution = null;
let decisionReview = null, showAllOptions = false, optionStake = 1, displayMode = diceStyle('2d');

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (!saved) return;
    const rules = settings(saved.config);
    const savedPresets = {};
    for (const candidate of Object.values(saved.presets || {})) {
      try { const validated = settings(candidate); savedPresets[presetKey(validated)] = validated; } catch { /* Ignore an outdated preset. */ }
    }
    let savedRound = null;
    if (saved.round) {
      const r = saved.round;
      const roundRules = settings(r.config);
      validateDice(r.dice, roundRules.n);
      if (!['hold', 'settled'].includes(r.phase) || !Array.isArray(r.held) || r.held.length !== r.dice.length || r.held.some(x => typeof x !== 'boolean')) throw new Error('Invalid saved hand.');
      savedRound = { config: roundRules, dice: r.dice, held: r.held, phase: r.phase, result: null };
      if (r.phase === 'settled') {
        const score = scoreHand(r.dice, roundRules);
        savedRound.result = { ...settlement(score.points, roundRules, r.result?.multiplier), score };
      }
    }
    if (!Number.isSafeInteger(saved.pnl) || !Number.isSafeInteger(saved.hands) || saved.hands < 0) throw new Error('Invalid session.');
    config = savedRound?.phase === 'hold' ? savedRound.config : rules;
    presets = savedPresets; round = savedRound; pnl = saved.pnl; hands = saved.hands;
    history = Array.isArray(saved.history) ? saved.history.slice(0, 12).filter(item => {
      try { settings(item.config); validateDice(item.dice, item.config.n); return Number.isSafeInteger(item.net) && Number.isInteger(item.points) && [1, 2].includes(item.multiplier); } catch { return false; }
    }) : [];
  } catch { /* Invalid or inaccessible storage must never prevent play. */ }
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ config, presets, round, pnl, hands, history })); }
  catch { $('storage-note').hidden = false; }
}
restore();

const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function renderDice(animate = []) {
  const focused = document.activeElement?.closest('[data-die]')?.dataset.die;
  const dice = round?.dice || Array.from({ length: config.n }, (_, i) => i % 6 + 1);
  $('dice-tray').dataset.diceStyle = displayMode;
  $('dice-tray').style.setProperty('--draw-columns', config.n <= 5 ? config.n : Math.ceil(config.n / 2));
  $('dice-tray').innerHTML = dice.map((face, i) => {
    const held = round?.held[i] || false, active = round?.phase === 'hold' && !busy;
    const visual = displayMode === '3d' ? `<canvas class="die-face die-face--3d" data-face="${face}" aria-hidden="true"></canvas>` : `<span class="die-face" aria-hidden="true">${Array.from({ length: 9 }, (_, j) => `<span class="pip${pips[face].includes(j) ? '' : ' off'}"></span>`).join('')}</span>`;
    return `<button class="die-slot${!round ? ' empty' : ''}${animate.includes(i) ? ' rolling' : ''}" data-die="${i}" aria-label="Die ${i + 1}${round ? `: ${face}, ${held ? 'held' : 'not held'}` : ': not rolled'}" aria-pressed="${held}" ${active ? '' : 'disabled'}>${visual}<span class="die-label" aria-hidden="true">${!round ? '·' : round.phase === 'settled' ? String(face) : `${held ? 'Held' : 'Hold'}${displayMode === '3d' ? ` · ${face}` : ''}`}</span></button>`;
  }).join('');
  paintCanvases();
  if (focused !== undefined && !busy) document.querySelector(`[data-die="${focused}"]`)?.focus({ preventScroll: true });
}
function paintCanvases() {
  $('dice-tray').querySelectorAll('canvas').forEach((canvas, i) => paintDie(canvas, Number(canvas.dataset.face), { yaw: [-.3, .24, -.12, .4][i % 4], waiting: !round }));
}
function labelRules(c) {
  return c.scoring === 'poker' ? 'Category paytable' : c.settlement === 'net' ? 'Points − fee' : 'Capped loss';
}
function renderPayoutRule() {
  const c = round?.config || config;
  $('payout-title').textContent = labelRules(c);
  if (c.scoring === 'poker') {
    $('payout-rule').textContent = 'Net = best category return − 1. Only the highest paying matching category pays.';
    $('payout-example').textContent = `Maximum loss: ${c.doubling ? '2 at double stake; otherwise 1' : '1'} unit. Edit returns in Game settings.`;
  } else {
    $('payout-rule').textContent = c.settlement === 'net' ? `Net = points − ${c.fee}. ${c.fee} points pushes; ${c.fee + 1} wins +1.` : `Net = max(0, points − ${c.fee}) − 1. ${c.fee + 1} points pushes; ${c.fee + 2} wins +1.`;
    const loss = c.settlement === 'net' ? c.fee : 1;
    $('payout-example').textContent = `Maximum loss: ${loss} ${loss === 1 ? 'unit' : 'units'}${c.doubling ? `, or ${loss * 2} when doubled` : ''}.`;
  }
}
function renderScore() {
  const c = round?.config || config;
  const score = round ? scoreHand(round.dice, c) : c.scoring === 'cribbage'
    ? { points: 0, groups: ['Pairs', 'Sums of six', c.runs === 'longest' ? 'Longest runs' : 'All runs'].map(label => ({ label, points: 0, items: [] })) }
    : { points: 0, groups: [{ label: 'Best category', points: 0, items: [] }] };
  $('score-total').textContent = score.points;
  $('tray-score').textContent = round ? score.points : '—';
  $('tray-score-label').textContent = c.scoring === 'poker' ? 'Return' : 'Points';
  $('score-unit').textContent = c.scoring === 'poker' ? 'return / 1 unit' : 'points';
  $('score-state').textContent = !round ? 'Waiting for a roll' : round.phase === 'hold' ? 'Before reroll' : 'Final hand';
  const openGroups = new Set([...document.querySelectorAll('.score-group[open]')].map(el => el.dataset.group));
  $('score-breakdown').innerHTML = score.groups.map(group => {
    const combined = new Map();
    for (const item of group.items) {
      const existing = combined.get(item.label) || { ...item, count: 0, points: 0 };
      existing.count++; existing.points += item.points; combined.set(item.label, existing);
    }
    return `<details class="score-group" data-group="${escape(group.label)}" ${openGroups.has(group.label) ? 'open' : ''}><summary><span>${escape(group.label)}</span><strong>${group.points}</strong></summary>${group.items.length ? `<ul>${[...combined.values()].map(item => `<li><span>${escape(item.label)}${item.count > 1 ? ` × ${item.count}` : ''}</span><span>${item.points}</span></li>`).join('')}</ul>` : `<p class="empty-score">${round ? 'No scoring combinations.' : 'Roll to see the combinations.'}</p>`}</details>`;
  }).join('');
  if (c.scoring === 'poker') $('score-breakdown').insertAdjacentHTML('beforeend', `<div class="paytable-reference"><h3>Paytable <span>Return / 1 unit</span></h3>${PAYTABLE.filter(row => row.minimum <= c.n).map(row => `<div${score.category === row.label ? ' class="current-category"' : ''}><span>${row.label}</span><strong>${c.payouts[row.key]}</strong></div>`).join('')}</div>`);
  renderPayoutRule();
}
function renderActions() {
  const holding = round?.phase === 'hold', count = round?.held.filter(Boolean).length || 0;
  $('open-settings').disabled = busy;
  $('open-settings').title = holding ? 'View this hand’s settings. Complete the hand to edit.' : '';
  $('stand').hidden = !holding;
  $('stand').disabled = busy;
  $('double').hidden = !holding || !config.doubling;
  $('double').disabled = busy || count === config.n;
  $('roll').disabled = busy;
  $('roll').innerHTML = `${holding ? count === config.n ? 'Score hand' : `Reroll ${config.n - count} ${config.n - count === 1 ? 'die' : 'dice'}` : round ? 'Next hand' : `Roll ${config.n} dice`} <span aria-hidden="true">↗</span>`;
  $('solve').disabled = !holding || busy || !!worker;
  $('apply-hold').hidden = !holding || !solution;
  $('apply-hold').disabled = busy;
  $('reset-session').disabled = !hands || !!holding || busy;
  if (holding) {
    const points = scoreHand(round.dice, config, false).points;
    const net = settlement(points, config).net;
    $('payout-preview').textContent = `Keep: ${signed(net)} ${Math.abs(net) === 1 ? 'unit' : 'units'} · 1× stake`;
    $('hold-instruction').textContent = `${count} of ${config.n} held. ${count === config.n ? 'Score the hand, or release dice to reroll.' : 'Tap dice to keep them. One reroll left.'}`;
    if (solution) {
      const mask = round.held.reduce((mask, held, i) => mask | (held ? 1 << i : 0), 0);
      const selected = solution.decisions.find(d => d.mask === mask && d.multiplier === 1);
      $('payout-preview').textContent = `Keep: ${signed(net)} · Reroll EV ${formatEV(selected.ev)} · 1×`;
    }
  }
  renderStrategy();
}
const formatEV = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
const holdKey = (dice, mask) => dice.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b).join(',');
function renderStrategy() {
  const reviewing = round?.phase === 'settled' && decisionReview;
  const solved = reviewing ? decisionReview.solution : solution;
  $('strategy-title').textContent = reviewing ? 'Decision review' : 'Hold options & EV';
  $('ev-summary').hidden = !solved;
  $('show-options').hidden = !solved;
  $('strategy-note').hidden = !solved;
  if (!solved) {
    $('strategy-note').textContent = worker ? 'Checking every hold and every possible replacement roll…' : 'Solve your opening roll to compare holds, standing pat, and optional doubling.';
    $('strategy-results').innerHTML = '';
    return;
  }
  const dice = reviewing ? decisionReview.dice : round.dice;
  const mask = reviewing ? decisionReview.mask : round.held.reduce((mask, held, i) => mask | (held ? 1 << i : 0), 0);
  const multiplier = reviewing ? decisionReview.multiplier : optionStake;
  const selected = solved.decisions.find(d => d.mask === mask && d.multiplier === multiplier) || solved.decisions.find(d => d.mask === mask && d.multiplier === 1);
  const gap = Math.max(0, solved.best.ev - selected.ev);
  const unique = new Map();
  for (const d of solved.decisions) {
    const key = `${holdKey(dice, d.mask)}:${d.multiplier}`;
    if (!unique.has(key)) unique.set(key, d);
  }
  const options = [...unique.values()], chosenKey = `${holdKey(dice, mask)}:${selected.multiplier}`;
  $('strategy-note').textContent = reviewing ? `Opening roll: ${dice.join(' · ')}. EVs describe your decision before the reroll, not the final result.` : `${options.length} distinct options · net units after fees and stakes. Select a row to set its hold.`;
  $('ev-summary').innerHTML = `<div><span>${reviewing ? 'Your decision' : 'Selected hold'} · ${selected.multiplier}×</span><strong>${formatEV(selected.ev)}</strong></div><div><span>Best available</span><strong>${formatEV(solved.best.ev)}</strong></div><div><span>EV given up</span><strong>${gap.toFixed(3)}</strong></div>`;
  $('show-options').textContent = showAllOptions ? 'Show top 5' : `Show all ${options.length}`;
  $('show-options').hidden = options.length <= 5;
  const rows = showAllOptions ? options : options.slice(0, 5);
  $('strategy-results').innerHTML = `<table class="strategy-table"><caption class="visually-hidden">Holds ranked by exact expected net profit. Gap is the expected profit lost compared with the best option.</caption><thead><tr><th scope="col">Hold</th><th scope="col">Stake</th><th scope="col">Net EV</th><th scope="col">Gap</th></tr></thead><tbody>${rows.map((d, i) => {
    const key = holdKey(dice, d.mask), kept = key ? key.split(',') : [];
    const label = kept.length === dice.length ? 'Keep all' : kept.length ? `Hold ${kept.join(' · ')}` : 'Reroll all';
    const chosen = `${key}:${d.multiplier}` === chosenKey;
    return `<tr class="${i === 0 ? 'best ' : ''}${chosen ? 'chosen' : ''}"><td>${reviewing ? `<span>${label}</span>` : `<button class="option-button" data-option="${d.mask}" data-stake="${d.multiplier}" aria-pressed="${chosen}" aria-label="${label}, ${d.multiplier} times stake, net EV ${formatEV(d.ev)}">${label}</button>`}<small>${i === 0 ? 'Best' : ''}${i === 0 && chosen ? ' · ' : ''}${chosen ? reviewing ? 'Played' : 'Selected' : ''}</small></td><td>${d.multiplier}×</td><td>${formatEV(d.ev)}</td><td>${Math.max(0, solved.best.ev - d.ev).toFixed(3)}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function render(animate = []) {
  document.body.dataset.phase = round?.phase || 'ready';
  $('game-name').textContent = SCORING[config.scoring];
  $('game-description').textContent = `${config.n} dice · ${config.scoring === 'cribbage' ? `${config.runs === 'longest' ? 'Longest runs' : 'All runs'} · ` : ''}${labelRules(config)}${config.doubling ? ' · 2× available' : ''}`;
  $('pnl').textContent = signed(pnl); $('pnl').dataset.sign = sign(pnl);
  $('hands').textContent = hands;
  $('last-net').textContent = history.length ? signed(history[0].net) : '—';
  $('last-net').dataset.sign = history.length ? sign(history[0].net) : 'zero';
  $('history-empty').hidden = !!history.length;
  $('history-list').innerHTML = history.map((item, i) => `<li class="history-row"><div><span class="history-dice">${item.dice.join(' ')}</span><small>${escape(SCORING[item.config.scoring])} · ${item.points} ${item.config.scoring === 'poker' ? 'return' : 'pts'} · ${escape(labelRules(item.config))}${item.config.scoring !== 'poker' ? ` · fee ${item.config.fee}` : ''} · ${item.multiplier}×</small></div><span class="muted">#${hands - i}</span><strong data-sign="${sign(item.net)}">${signed(item.net)}</strong></li>`).join('');
  $('round-step').textContent = !round ? 'YOUR NEXT HAND' : round.phase === 'hold' ? 'CHOOSE YOUR HOLD' : 'HAND COMPLETE';
  $('hand-status').dataset.sign = round?.result ? sign(round.result.net) : 'zero';
  if (!round) {
    $('hand-status').textContent = 'Find your next combination.';
    $('hold-instruction').textContent = `Start with ${config.n} dice and see what adds up.`;
    $('payout-preview').textContent = 'Practice units · One reroll per hand';
  } else if (round.phase === 'hold') {
    $('hand-status').textContent = 'What will you keep?';
  } else {
    const r = round.result;
    $('hand-status').textContent = r.net === 0 ? 'A push. Even on this hand.' : `${signed(r.net)} ${Math.abs(r.net) === 1 ? 'unit' : 'units'}. ${r.net > 0 ? 'Nicely played.' : 'On to the next hand.'}`;
    $('hold-instruction').textContent = `${r.points} ${round.config.scoring === 'poker' ? 'return per unit' : 'points'} · ${r.multiplier}× stake · ${SCORING[round.config.scoring]}`;
    $('payout-preview').textContent = round.config.scoring === 'poker' ? `(${r.points} − 1) × ${r.multiplier} = ${signed(r.net)} net` : round.config.settlement === 'net' ? `(${r.points} − ${round.config.fee}) × ${r.multiplier} = ${signed(r.net)} net` : `(max(0, ${r.points} − ${round.config.fee}) − 1) × ${r.multiplier} = ${signed(r.net)} net`;
  }
  renderDice(animate); renderScore(); renderActions();
}
function cancelSolver() {
  worker?.terminate(); worker = null; solverId++; solution = null;
  optionStake = 1; showAllOptions = false;
  $('advice-text').textContent = 'Roll to compare the exact EV of every hold.';
}
function endAnimation() {
  clearTimeout(animationTimer); busy = false;
  document.querySelectorAll('.rolling').forEach(el => el.classList.remove('rolling'));
  renderActions();
  document.querySelectorAll('[data-die]').forEach(el => { el.disabled = round?.phase !== 'hold'; });
}
function play({ stand = false, double = false } = {}) {
  if (busy) return;
  try {
    const starting = !round || round.phase === 'settled';
    const animated = starting ? Array.from({ length: config.n }, (_, i) => i) : stand ? [] : round.held.flatMap((held, i) => held ? [] : [i]);
    const next = starting ? newRound(config) : finishRound(round, { stand, double });
    decisionReview = !starting && solution ? { dice: [...round.dice], solution, mask: stand ? 2 ** config.n - 1 : round.held.reduce((mask, held, i) => mask | (held ? 1 << i : 0), 0), multiplier: double ? 2 : 1 } : null;
    cancelSolver(); round = next;
    if (round.phase === 'settled') {
      pnl += round.result.net; hands++;
      history.unshift({ dice: [...round.dice], ...round.result, score: undefined, config: round.config });
      history = history.slice(0, 12);
      $('advice-text').textContent = 'Next hand, another decision.';
    } else $('advice-text').textContent = 'Compare every hold and possible reroll.';
    // Save the sampled result before animation, so a reload cannot replay a draw.
    save();
    busy = animated.length > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    render(busy ? animated : []);
    if (busy) animationTimer = setTimeout(endAnimation, 370);
    else $('roll').focus({ preventScroll: true });
    if (matchMedia('(max-width: 900px)').matches) {
      const tray = document.querySelector('.table-center').getBoundingClientRect();
      const dockElement = document.querySelector('.action-dock'), dock = dockElement.getBoundingClientRect();
      const available = getComputedStyle(dockElement).position === 'fixed' ? dock.top : innerHeight;
      if (tray.bottom > available) window.scrollBy({ top: tray.bottom - available + 12, behavior: 'instant' });
      else if (tray.top < 0) window.scrollBy({ top: tray.top - 12, behavior: 'instant' });
    } else {
      document.querySelector('.play-column').scrollTo({ top: 0, behavior: 'instant' });
      document.querySelector('.analysis-column').scrollTo({ top: 0, behavior: 'instant' });
    }
  } catch (error) { $('hand-status').textContent = error.message; }
}
function toggleHold(index) {
  if (busy || round?.phase !== 'hold' || index < 0 || index >= round.dice.length) return;
  round.held[index] = !round.held[index];
  optionStake = 1;
  save(); renderDice(); renderActions();
}
$('dice-tray').addEventListener('click', event => {
  const die = event.target.closest('[data-die]');
  if (die) toggleHold(Number(die.dataset.die));
});
$('roll').addEventListener('click', () => play());
$('stand').addEventListener('click', () => play({ stand: true }));
$('double').addEventListener('click', () => play({ double: true }));
$('reset-session').addEventListener('click', () => {
  if (round?.phase === 'hold' || busy) return;
  pnl = 0; hands = 0; history = []; round = null; decisionReview = null; cancelSolver(); save(); render();
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (/^[1-7]$/.test(event.key)) { event.preventDefault(); toggleHold(Number(event.key) - 1); }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); play(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && busy) endAnimation(); });

$('solve').addEventListener('click', () => {
  if (round?.phase !== 'hold' || busy || worker) return;
  const id = ++solverId;
  $('advice-text').textContent = 'Checking every hold…';
  const failed = () => {
    if (id !== solverId) return;
    worker?.terminate(); worker = null;
    $('advice-text').textContent = 'Advice could not load. You can keep playing or try again.';
    renderActions();
  };
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = failed;
    worker.onmessage = ({ data }) => {
      if (id !== solverId || data.id !== id || round?.phase !== 'hold') return;
      if (data.error) { failed(); return; }
      worker.terminate(); worker = null; solution = data.result;
      const best = solution.best, kept = round.dice.filter((_, i) => best.mask & (1 << i));
      $('advice-text').textContent = `${kept.length === config.n ? 'Keep all' : kept.length ? `Hold ${kept.join(', ')}` : 'Reroll all'}${best.multiplier === 2 ? ' · double' : ''}. Exact net EV ${signed(Number(best.ev.toFixed(3)))} units.`;
      renderActions();
      if (matchMedia('(max-width: 900px)').matches) document.querySelector('.strategy').scrollIntoView({ block: 'start', behavior: 'instant' });
      else document.querySelector('.analysis-column').scrollTo({ top: 0, behavior: 'instant' });
    };
    worker.postMessage({ id, dice: round.dice, config: round.config });
    renderActions();
  } catch { failed(); }
});
$('apply-hold').addEventListener('click', () => {
  if (!solution || round?.phase !== 'hold' || busy) return;
  round.held = round.dice.map((_, i) => !!(solution.best.mask & (1 << i)));
  optionStake = solution.best.multiplier;
  save(); renderDice(); renderActions();
});
$('show-options').addEventListener('click', () => { showAllOptions = !showAllOptions; renderStrategy(); });
$('strategy-results').addEventListener('click', event => {
  const button = event.target.closest('[data-option]');
  if (!button || !solution || round?.phase !== 'hold' || busy) return;
  round.held = round.dice.map((_, i) => !!(Number(button.dataset.option) & (1 << i)));
  optionStake = Number(button.dataset.stake);
  $('advice-text').textContent = optionStake === 2 ? 'Holds set. Choose Double & reroll to play the 2× option.' : 'Holds set. Reroll or keep the hand when you are ready.';
  save(); renderDice(); renderActions();
  // Rebuilding the list must not drop keyboard focus back to the document.
  $('strategy-results').querySelector(`[data-option="${button.dataset.option}"][data-stake="${optionStake}"]`)?.focus({ preventScroll: true });
});

let draft;
function readDraft() {
  return settings({ n: Number($('dice-count').value), scoring: $('scoring').value, settlement: $('settlement').value, fee: Number($('fee').value), doubling: $('doubling').checked, runs: $('runs').value,
    payouts: { ...draft.payouts, ...Object.fromEntries([...document.querySelectorAll('[data-payout]')].map(input => [input.dataset.payout, Number(input.value)])) },
  });
}
function fillSettings(c) {
  draft = c;
  $('scoring').value = c.scoring; $('dice-count').value = c.n; $('settlement').value = c.settlement;
  $('fee').value = c.fee; $('doubling').checked = c.doubling; $('runs').value = c.runs;
  $('settlement-field').hidden = $('fee-field').hidden = c.scoring === 'poker';
  $('fee').disabled = c.scoring === 'poker';
  $('runs-field').hidden = c.scoring !== 'cribbage';
  $('paytable-editor').hidden = c.scoring !== 'poker';
  $('paytable-fields').innerHTML = PAYTABLE.filter(row => row.minimum <= c.n).map(row => `<label class="field">${row.label}<input type="number" min="0" max="1000" step="1" value="${c.payouts[row.key]}" data-payout="${row.key}" required ${c.scoring === 'poker' ? '' : 'disabled'} /></label>`).join('');
  $('settings-description').textContent = c.scoring === 'cribbage' ? 'Add every pair, every sum of six, and your runs. Duplicate faces multiply run combinations.' : c.scoring === 'poker' ? 'Pairs, sets, full houses, and straights. Build a paytable for your selected number of dice.' : 'One hand, one reroll, best category. Chance always scores the sum. This variation uses the rules listed in How to play.';
  $('settings-error').textContent = '';
}
$('open-settings').addEventListener('click', () => {
  if (busy) return;
  const locked = round?.phase === 'hold';
  fillSettings(config);
  $('settings-fields').disabled = !!locked;
  $('apply-settings').hidden = $('restore-defaults').hidden = !!locked;
  $('settings-note').textContent = locked ? 'This hand’s rules are locked. You can review them here; finish the hand to make changes.' : 'Choose your next game. Settings lock while a hand is in play.';
  $('settings-dialog').showModal();
});
for (const id of ['scoring', 'dice-count', 'settlement', 'doubling', 'runs']) $(id).addEventListener('change', () => {
  const selector = { n: Number($('dice-count').value), scoring: $('scoring').value, settlement: $('settlement').value, doubling: $('doubling').checked, runs: $('runs').value };
  const key = presetKey(selector);
  const sameGame = selector.n === draft.n && selector.scoring === draft.scoring;
  let candidate = defaults(selector);
  if (sameGame) {
    try { candidate = readDraft(); } catch { /* Use this variant's defaults if an unfinished field is invalid. */ }
  }
  fillSettings(presets[key] || candidate);
});
$('restore-defaults').addEventListener('click', () => fillSettings(defaults(draft)));
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  if (round?.phase === 'hold' || busy) return;
  try {
    config = readDraft(); presets[presetKey(config)] = config;
    round = null; decisionReview = null; cancelSolver(); save(); render(); $('settings-dialog').close();
  } catch (error) { $('settings-error').textContent = error.message; }
});
$('open-rules').addEventListener('click', () => $('rules-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
bindDiceStyle($('draw-dice-style'), { fallback: '2d', onChange(value) { displayMode = value; renderDice(); } });
new ResizeObserver(paintCanvases).observe($('dice-tray'));
new ResizeObserver(() => document.documentElement.style.setProperty('--draw-dock-height', `${document.querySelector('.action-dock').getBoundingClientRect().height}px`)).observe(document.querySelector('.action-dock'));
render();
