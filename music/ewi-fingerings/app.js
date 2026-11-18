import { KEY_RULES, isEligibleFingering, keyPitch, toggleKey, signedSteps } from './key-rules.mjs?v=20261118-key-labels';
import { KEY_SYMBOLS, KEY_LAYOUT, keySideEdge } from './key-artwork.mjs?v=20261118-manual-keys';
import { staffSvg } from './notation.mjs';
import { SHARPS, FLATS, KEYS, supportsMidi, candidates, noteName, registerName, changes, optimize, parseMelody } from './engine.mjs?v=20261118-layout';
import { rankedFingerings } from './ranking.mjs?v=20261118-layout';
import { bestNoteMoves, noteMoveCounts, MOVE_PITCHES } from './note-moves.mjs?v=20261118-keys';
import { SCALE_GROUPS, scalePhrase } from './scales.mjs?v=20261118-scales';

const $ = id => document.getElementById(id);
const storageKey = 'ewi-practice-v3';
const defaultPhrase = scalePhrase(0, SCALE_GROUPS[0][1][0][1]);
const openKeys = '0'.repeat(KEYS.length);
const openPitch = keyPitch(openKeys).midi;
const pitchDropGroups = [[0, 1, 2], [3, 7]];
const pitchDropKeys = pitchDropGroups.flat();
const state = { pitch: 7, selected: null, flats: true, view: 'guide', melody: parseMelody(defaultPhrase), usePhraseOctave: false, plan: null, step: 1, locks: {}, chartChoices: {}, key: 0, keyBits: openKeys, keyRegister: 0, keyFilter: 'all' };
const referenceMidi = () => 60 + state.pitch;
const pianoColumn = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];
const pianoPlacement = pitch => `class="${pianoColumn[pitch] % 2 === 0 ? 'accidental' : ''}" style="--piano-column:${pianoColumn[pitch]}"`;
const moveSelection = { from: 70, to: 71, option: 0, result: null };
const scaleSelection = { root: 0, group: 0, custom: new Set(SCALE_GROUPS[0][1][0][1]) };
try {
  const current = localStorage.getItem(storageKey);
  const versioned = current || localStorage.getItem('ewi-practice-v2');
  const saved = JSON.parse(versioned || localStorage.getItem('ewi-practice-v1'));
  // v1 persisted the implicit sharps default; migrate note / melody, then use flats.
  if (supportsMidi(saved?.midi)) state.pitch = saved.midi % 12;
  if (versioned && typeof saved?.flats === 'boolean') state.flats = saved.flats;
  if (typeof saved?.phrase === 'string' && saved.phrase.length < 1000
    && (current || saved.phrase !== 'B4 C5 D5 C5 B4')) {
    $('melody').value = saved.phrase;
    state.usePhraseOctave = saved.usePhraseOctave ?? true;
  }
} catch { /* Storage is optional in private browsing and offline wrappers. */ }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ midi: referenceMidi(), flats: state.flats, phrase: $('melody').value, usePhraseOctave: state.usePhraseOctave })); } catch { /* Optional. */ }
}
const keyList = bits => KEYS.filter((_, i) => bits[i] === '1').map(k => k.id).join(', ') || 'none';
const name = midi => noteName(midi, state.flats);
const weights = () => Object.fromEntries(
  [...document.querySelectorAll('[data-weight][aria-pressed="true"]')].map(button => [button.dataset.weight, Number(button.dataset.value)])
);
function markChoice(button) {
  button.closest('.choice-buttons, .note-picker').querySelectorAll('button').forEach(choice => {
    choice.setAttribute('aria-pressed', String(choice === button));
  });
}
function navigateButtons(container, selector, arrows) {
  $(container).addEventListener('keydown', event => {
    const step = arrows[event.key];
    const current = event.target.closest(selector);
    if (!current || (step === undefined && !['Home', 'End'].includes(event.key))) return;
    const buttons = [...$(container).querySelectorAll(selector)].filter(button => button.getClientRects().length);
    const index = buttons.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + step;
    event.preventDefault();
    const button = buttons[Math.min(buttons.length - 1, Math.max(0, next))];
    button.focus();
    button.click();
  });
}
function updateSpellingButtons() {
  document.querySelectorAll('[data-spelling]').forEach(button => {
    button.setAttribute('aria-pressed', String((button.dataset.spelling === 'flats') === state.flats));
  });
}
function thumbOffset(shift) {
  const steps = Math.abs(shift);
  return `Thumb ${steps} octave${steps === 1 ? '' : 's'} ${shift > 0 ? 'higher' : 'lower'}`;
}
function say(message) { $('app-status').textContent = message; }
function melodyDraft() {
  const input = $('melody').value.trim();
  return input ? parseMelody(input) : [];
}
function chartMidi(melody) {
  const last = melody.at(-1);
  return !state.usePhraseOctave || last === undefined ? referenceMidi() : last - last % 12 + state.pitch;
}
function updateChartActions() {
  let midi;
  try { midi = chartMidi(melodyDraft()); } catch { /* The planner reports invalid input. */ }
  $('add-note').textContent = midi === undefined ? 'Add to melody' : `Add ${name(midi)} to melody`;
  $('hear-note').textContent = midi === undefined ? 'Hear note' : `Hear ${name(midi)}`;
}
function showView(view) {
  stopAudio();
  const changed = state.view !== view;
  state.view = view;
  ['explore', 'plan', 'guide', 'moves'].forEach(id => { $(id).hidden = id !== view; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  if (view === 'plan' && !state.plan) calculate();
  if (view === 'explore') updateChartActions();
  if (view === 'moves') renderMoveMatrix();
  if (changed) window.scrollTo(0, 0);
  say('');
}

function physicalKeys(bits, { interactive = false, before } = {}) {
  return KEY_LAYOUT.map(({ shape, x, y, width, height }, i) => {
    const interactiveKey = interactive ? ` data-key-shape="${i}"` : '';
    const keyShape = `<use class="key-shape" href="#ewi-key-${shape}" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}"/>`;
    const hitTarget = interactive && i === 1
      ? `<rect fill="transparent" x="${-width / 2 - 1}" y="${-height / 2 - 2}" width="${width + 2}" height="${height + 4}"/>` : '';
    const outline = before && before[i] !== bits[i]
      ? `<rect class="change-outline" x="${-width / 2 - 2}" y="${-height / 2 - 2}" width="${width + 4}" height="${height + 4}" rx="3"/>` : '';
    return `<g class="diagram-key ${bits[i] === '1' ? 'on' : ''}" transform="translate(${x} ${y})"${interactiveKey}>${keyShape}${outline}${hitTarget}</g>`;
  }).join('');
}
function keyDiagram(bits, { horizontal = false, before, decorative = false, viewBox } = {}) {
  const keys = physicalKeys(bits, { before });
  const accessibility = decorative ? 'aria-hidden="true"' : `role="img" aria-label="Touch ${keyList(bits)}"`;
  const box = viewBox ?? (horizontal ? '16 -216 387 113' : '103 16 113 387');
  return `<svg class="${horizontal ? 'mini-diagram' : 'upright-diagram'}" viewBox="${box}" ${accessibility}>${horizontal ? `<g transform="rotate(-90)">${keys}</g>` : keys}</svg>`;
}
function renderMoveMatrix() {
  const head = MOVE_PITCHES.map(midi => `<th scope="col" class="${midi % 12 === 0 ? 'octave-edge' : ''}">${name(midi)}</th>`).join('');
  $('move-matrix').innerHTML = `<caption class="sr-only">Minimum key toggles at a fixed thumb position. Starting notes in rows, destination notes in columns, highest to lowest.</caption>
    <thead><tr><td></td>${head}</tr></thead><tbody>
    ${noteMoveCounts().map((row, r) => {
      const from = MOVE_PITCHES[r];
      return `<tr class="${from % 12 === 0 ? 'octave-edge' : ''}"><th scope="row">${name(from)}</th>${row.map((count, c) => {
        const to = MOVE_PITCHES[c];
        return count === null
          ? '<td class="same-note" aria-label="Same note">–</td>'
          : `<td><button type="button" data-from="${from}" data-to="${to}" data-toggles="${count}" aria-label="${name(from)} to ${name(to)}, ${count} key toggles" aria-pressed="false" tabindex="-1">${count}</button></td>`;
      }).join('')}</tr>`;
    }).join('')}
    </tbody>`;
  selectMovePair(moveSelection.from, moveSelection.to, moveSelection.option);
}
function selectMovePair(from, to, option = 0) {
  Object.assign(moveSelection, { from, to, option, result: bestNoteMoves(from, to) });
  const matrix = $('move-matrix');
  const previous = matrix.querySelector('[aria-pressed="true"]');
  if (previous) {
    previous.setAttribute('aria-pressed', 'false');
    previous.tabIndex = -1;
  }
  const chosen = matrix.querySelector(`[data-from="${from}"][data-to="${to}"]`);
  chosen.setAttribute('aria-pressed', 'true');
  chosen.tabIndex = 0;
  renderMoveResult();
}
function renderMoveResult() {
  const { from, to, option, result } = moveSelection;
  const move = result.options[option];
  const diff = changes(move.from, move.to);
  const line = (pitch, f) => `<div class="move-key-line"><div><strong>${name(pitch)}</strong><span class="small-label">Rank ${f.rank}</span></div>${keyDiagram(f.bits, { horizontal: true })}</div>`;
  $('move-result').innerHTML = `
    <div class="section-title"><h2 aria-live="polite">${name(from)} → ${name(to)}</h2><span class="move-count">${result.toggles} key ${result.toggles === 1 ? 'toggle' : 'toggles'}</span></div>
    <div class="move-choices">
      <span class="small-label">${result.total > result.options.length ? 'Simplest ' + result.options.length + ' of ' + countLabel(result.total) : 'Best fingerings'}</span>
      <div class="choice-buttons" role="group" aria-label="Best transition options">${result.options.map((_, index) => `<button type="button" data-move-option="${index}" aria-pressed="${option === index}" aria-label="Option ${index + 1}">${index + 1}</button>`).join('')}</div>
    </div>
    <div class="move-grid"><div><strong>Touch</strong><p>${diff.touch.join(', ') || 'None'}</p></div><div><strong>Release</strong><p>${diff.release.join(', ') || 'None'}</p></div></div>
    ${line(from, move.from)}
    ${line(to, move.to)}`;
}
function variantLabel(f, index) { return f.main ? 'Main fingering' : `${f.base < 62 ? 'Low extension' : f.base > 73 ? 'High extension' : 'Alternate'} ${index + 1}`; }
function renderScaleLibrary() {
  const { root, group, custom } = scaleSelection;
  const pitches = state.flats ? FLATS : SHARPS;
  $('scale-roots').innerHTML = pitches.map((pitch, i) =>
    `<button type="button" data-scale-root="${i}" ${pianoPlacement(i)} aria-pressed="${root === i}">${pitch}</button>`
  ).join('');
  $('scale-groups').innerHTML = [...SCALE_GROUPS.map(([label]) => label), 'Custom'].map((label, i) =>
    `<button type="button" data-scale-group="${i}" aria-pressed="${group === i}">${label}</button>`
  ).join('');
  const family = SCALE_GROUPS[group];
  $('scale-options').setAttribute('aria-label', family ? family[0] : 'Custom scale');
  $('scale-options').innerHTML = family
    ? family[1].map(([label], i) => `<button type="button" class="btn" data-scale-type="${i}">${label}</button>`).join('')
    : `<div class="note-picker" role="group" aria-label="Notes in the scale">
      ${pitches.map((_, i) => {
        const pitch = (root + i) % 12;
        return `<button type="button" data-scale-offset="${i}" ${pianoPlacement(pitch)} aria-pressed="${custom.has(i)}" ${i === 0 ? 'disabled' : ''}>${pitches[pitch]}</button>`;
      }).join('')}
      </div><button type="button" class="btn btn--primary" data-use-custom>Use custom scale</button>`;
}
function useScale(offsets) {
  $('melody').value = scalePhrase(scaleSelection.root, offsets, state.flats);
  state.usePhraseOctave = false;
  state.step = 1;
  state.locks = {};
  state.chartChoices = {};
  $('scale-library').close();
  calculate();
}
const pageSize = 12;
let ranked = [], shownPitch;
const additional = new Map();
const countLabel = number => number.toLocaleString('en-US');

function chartCard(f) {
  const offset = f.shift - ranked[0].shift;
  const label = `Rank ${f.rank}, ${f.heldCount} keys down. Touch ${keyList(f.bits)}.${offset ? ` ${thumbOffset(offset)} than rank 1.` : ''}`;
  return `<button class="alternate" type="button" data-fingering="${f.rank}" aria-pressed="${f.rank === state.selected}" aria-label="${label}">
    <span class="alternate-label">#${f.rank}</span><span class="alternate-count"><span class="alternate-held">${f.heldCount}</span><span class="alternate-count-suffix"> down</span></span>
    ${keyDiagram(f.bits, { horizontal: true, decorative: true, viewBox: '16 -209.5 387 100' })}
  </button>`;
}

function renderAdditional(details, page) {
  const group = additional.get(Number(details.dataset.more));
  const start = page * pageSize;
  const end = Math.min(start + pageSize, group.length);
  const body = details.querySelector('.additional-rows');
  body.innerHTML = `<div class="fingering-grid">${group.slice(start, end).map(chartCard).join('')}</div><div class="additional-pagination">
    <button type="button" class="btn" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button>
    <span role="status">${start + 1}–${end} of ${countLabel(group.length)}</span>
    <button type="button" class="btn" data-page="${page + 1}" ${end === group.length ? 'disabled' : ''}>Next</button>
    </div>`;
}

function renderChart() {
  ranked = rankedFingerings(referenceMidi());
  shownPitch = state.pitch;
  state.selected = ranked[0].rank;
  additional.clear();
  $('variant-count').textContent = `${countLabel(ranked.length)} choices`;
  const groups = new Map();
  for (const fingering of ranked) {
    if (!groups.has(fingering.shift)) groups.set(fingering.shift, []);
    groups.get(fingering.shift).push(fingering);
  }
  // For the same sounding note, a higher front-key pitch needs a lower thumb shift.
  $('alternates').innerHTML = [...groups].sort(([a], [b]) => a - b).map(([shift, group]) => {
    const withoutSide = group.filter(f => f.sideCount === 0);
    const visible = withoutSide.length ? withoutSide : group.filter(f => f.sideCount === group[0].sideCount).slice(0, 3);
    const more = group.filter(f => !visible.includes(f));
    additional.set(shift, more);
    const offset = shift - ranked[0].shift;
    const heading = offset ? thumbOffset(offset) + ' than rank 1' : 'Rank 1 thumb position';
    return `<section class="register-group" data-register="${shift}">
      ${groups.size > 1 ? `<h3>${heading}</h3>` : ''}
      <div class="ranked-rows fingering-grid">${visible.map(chartCard).join('')}</div>
      ${more.length ? `<details class="additional-fingerings" data-more="${shift}"><summary>${countLabel(more.length)} ${withoutSide.length ? 'side-key' : 'more'} fingerings</summary><div class="additional-rows"></div></details>` : ''}
    </section>`;
  }).join('');
  if ($('alternates').getBoundingClientRect().top < 0) window.scrollTo(0, 0);
  $('alternates').querySelectorAll('[data-more]').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.isConnected && details.open && !details.querySelector('.additional-rows').hasChildNodes()) renderAdditional(details, 0);
    });
  });
}

function renderSelectedFingering(selected) {
  $('selected-variant').textContent = `Rank ${selected.rank}`;
  $('main-diagram').innerHTML = keyDiagram(selected.bits, { horizontal: true });
  const offset = selected.shift - ranked[0].shift;
  $('thumb-offset').hidden = offset === 0;
  $('thumb-offset').textContent = offset ? thumbOffset(offset) + ' than rank 1.' : '';
  $('held-description').textContent = `Touch ${keyList(selected.bits)}.`;
  $('ranking-detail').textContent = `${selected.heldCount} keys down · ${selected.sideCount} side touches · comfort penalty ${selected.comfortCost}`;
}

function renderExplorer() {
  if (shownPitch !== state.pitch) renderChart();
  const noteNames = state.flats ? FLATS : SHARPS;
  updateSpellingButtons();
  $('note-picker').innerHTML = noteNames.map((n, i) =>
    `<button type="button" data-pitch="${i}" ${pianoPlacement(i)} aria-pressed="${i === state.pitch}">${n}</button>`
  ).join('');
  $('selected-note').textContent = noteNames[state.pitch];
  updateChartActions();
  renderSelectedFingering(ranked[state.selected - 1]);
  save();
}
function keyClasses(index, held) {
  const rule = KEY_RULES[index];
  return `effect-${rule.color} ${rule.kind === 'Fixed' ? '' : 'conditional-key'} ${held ? 'on' : ''}`;
}
const hasRedundantBis = bits => bits.startsWith('111');
const redundantBisHint = 'K2 has no effect while K1 and K3 are held.';
function toggleGuideKey(bits, index) {
  const next = toggleKey(bits, index);
  return hasRedundantBis(next) ? '101' + next.slice(3) : next;
}
function guideKeyExample(index) {
  const bits = state.keyBits;
  const other = toggleGuideKey(bits, index);
  if (bits === other) return redundantBisHint;
  const [off, on] = bits[index] === '1' ? [other, bits] : [bits, other];
  const from = keyPitch(off, state.keyRegister).midi;
  const to = keyPitch(on, state.keyRegister).midi;
  const together = index !== 1 && off[1] !== on[1] ? ' · K2 also changes' : '';
  return `${name(from)} → ${name(to)} (${signedSteps(to - from)})${together}`;
}
function keyPattern(held) {
  return KEYS.map((_, i) => held.includes(i) ? '1' : '0').join('');
}
function pitchDrop(bits) {
  return keyPitch(bits).midi - openPitch;
}
const describeDrop = steps => `${signedSteps(steps)} ${steps === -1 ? 'semitone' : 'semitones'}`;
function renderPitchDropTable() {
  function combinations(group) {
    return Array.from({ length: 2 ** group.length }, (_, mask) => {
      const held = group.filter((_, index) => mask & (1 << index));
      const bits = keyPattern(held);
      return { held, bits, steps: pitchDrop(bits) };
    }).filter(({ bits }) => isEligibleFingering(bits)).sort((a, b) => b.steps - a.steps);
  }
  const [rows, columns] = pitchDropGroups.map(combinations);
  const label = ({ held, steps }) => `<span>${held.map(i => KEYS[i].id).join(' + ') || 'Open'}</span><small>${signedSteps(steps)}</small>`;
  $('pitch-drop-table').innerHTML = `<caption class="sr-only">Total semitones relative to open, smallest drop first on each axis</caption>
    <colgroup span="1"></colgroup><colgroup span="${columns.length}"></colgroup>
    <thead><tr><th scope="col" rowspan="2">K1 / K2 / K3</th><th scope="colgroup" colspan="${columns.length}">K4 / K8</th></tr>
    <tr>${columns.map(column => `<th scope="col">${label(column)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr><th scope="row">${label(row)}</th>${columns.map(column => {
      const bits = keyPattern([...row.held, ...column.held]);
      const drop = pitchDrop(bits);
      const steps = signedSteps(drop);
      return `<td><button type="button" data-combination="${bits}" style="--drop:${-4 * drop}%" aria-pressed="false" aria-label="${bits === openKeys ? 'Open' : keyList(bits)}, ${describeDrop(drop)}">${steps}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
}
function updatePitchDropPreview() {
  const bits = keyPattern(pitchDropKeys.filter(i => state.keyBits[i] === '1'));
  const table = $('pitch-drop-table');
  table.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  const cell = table.querySelector(`[data-combination="${bits}"]`);
  $('pitch-drop-preview').hidden = !cell;
  if (!cell) return;
  cell.setAttribute('aria-pressed', 'true');
  $('pitch-drop-keys').innerHTML = keyDiagram(bits, { decorative: true });
  $('pitch-drop-total').textContent = describeDrop(pitchDrop(bits));
  $('pitch-drop-held').textContent = bits === openKeys ? 'Open' : keyList(bits);
}
function renderKeyExplorer() {
  const midi = keyPitch(state.keyBits, state.keyRegister).midi;
  $('key-note').textContent = name(midi);
  $('key-midi').textContent = `MIDI ${midi}`;
  $('key-staff').innerHTML = staffSvg(midi, state.flats);
  $('key-register').textContent = registerName(state.keyRegister);
  document.querySelector('[data-register-step="-1"]').disabled = state.keyRegister <= -2;
  document.querySelector('[data-register-step="1"]').disabled = state.keyRegister >= 4;
  $('key-held').textContent = `Held: ${keyList(state.keyBits)}.`;
  $('key-range').hidden = midi <= 111;
  $('key-range').textContent = 'Above this guide’s verified MIDI range; lower the thumb register to match a verified pitch.';
  $('hear-keys').disabled = midi > 111;
  renderKeyMap();
  updatePitchDropPreview();
  const key = KEYS[state.key], rule = KEY_RULES[state.key];
  $('key-detail').innerHTML = `<h3>${key.id} · ${key.finger}</h3><dl><div><dt>Usual contribution</dt><dd class="usual-rule effect-${rule.color}">${rule.usualText}</dd></div><div><dt>Conditions</dt><dd>${rule.badges.join(' · ') || rule.exceptions}</dd></div><div><dt>Net change when added</dt><dd>${guideKeyExample(state.key)}</dd></div></dl>`;
  $('key-rule-rows').innerHTML = KEYS.map((k, i) => {
    const rule = KEY_RULES[i];
    if (state.keyFilter === 'fixed' && rule.kind !== 'Fixed' || state.keyFilter === 'interacting' && rule.kind === 'Fixed') return '';
    const held = state.keyBits[i] === '1';
    const exception = rule.badges.length ? `<span class="rule-exception">${rule.badges.join(' · ')}</span>` : '';
    return `<tr><th scope="row"><button type="button" class="key-state-button ${keyClasses(i, held)}" data-key="${i}" aria-pressed="${held}" aria-label="${k.id}, ${held ? 'release' : 'hold'}">${k.id}</button><span>${k.finger}</span></th><td><strong class="usual-rule effect-${rule.color}">${signedSteps(rule.usual)}</strong><span class="rule-kind">${rule.kind}</span></td><td>${exception}<span class="rule-example">${guideKeyExample(i)}</span></td></tr>`;
  }).join('');
}
function renderKeyMap() {
  const height = 424;
  let left = 36, right = 36;
  const labels = KEYS.map((key, i) => {
    const rule = KEY_RULES[i];
    const onLeft = KEY_LAYOUT[i].shape === 'round';
    const y = onLeft ? left : right;
    if (onLeft) left += 70;
    else right += 60;
    return { key, rule, onLeft, y };
  });
  const leaders = labels.map(({ rule, onLeft, y }, i) => {
    const edge = keySideEdge(KEY_LAYOUT[i], onLeft ? -1 : 1);
    return `<line class="key-leader effect-${rule.color} ${state.keyBits[i] === '1' ? 'on' : ''}" x1="${onLeft ? 93 : 237}" y1="${y}" x2="${edge.x}" y2="${edge.y}"/>`;
  }).join('');
  const buttons = labels.map(({ key, rule, onLeft, y }, i) => {
    const held = state.keyBits[i] === '1';
    const conditions = rule.badges.map(badge => `<span>${badge}</span>`).join('');
    return `<button type="button" class="key-state-button key-callout ${onLeft ? 'key-callout-left' : 'key-callout-right'} ${keyClasses(i, held)} ${state.key === i ? 'inspected' : ''}" style="--callout-top:${y / height * 100}%" data-key="${i}" aria-label="${key.id}, ${key.finger}. Usual contribution. ${rule.usualText}${rule.kind === 'Fixed' ? '' : ' ' + rule.exceptions}" aria-pressed="${held}">
      <span class="key-callout-name">${key.id}</span><span class="key-callout-effect">${signedSteps(rule.usual)}</span>
      ${conditions ? `<span class="key-dependencies">${conditions}</span>` : ''}
    </button>`;
  }).join('');
  $('key-picker').innerHTML = `<svg class="key-map" viewBox="0 0 330 ${height}" aria-hidden="true">${leaders}${physicalKeys(state.keyBits, { interactive: true })}</svg>${buttons}`;
}
function selectGuideKey(index, origin) {
  stopAudio();
  state.key = index;
  const next = toggleGuideKey(state.keyBits, index);
  say(next === state.keyBits ? redundantBisHint : '');
  state.keyBits = next;
  renderKeyExplorer();
  $(origin).querySelector(`[data-key="${index}"]`)?.focus({ preventScroll: true });
}
function keepUnchangedChoices(melody) {
  let prefix = 0;
  while (prefix < melody.length && melody[prefix] === state.melody[prefix]) prefix++;
  for (const choices of [state.locks, state.chartChoices]) {
    for (const step of Object.keys(choices)) if (Number(step) >= prefix) delete choices[step];
  }
  state.melody = melody;
}
function calculate() {
  stopAudio();
  try {
    const melody = parseMelody($('melody').value);
    keepUnchangedChoices(melody);
    if (melody.length < 2) throw new Error('Add one more note to compare a transition.');
    const plan = optimize(melody, weights(), state.locks, state.chartChoices);
    if (!plan) throw new Error('A locked fingering is unavailable. Reset your choices and try again.');
    state.plan = plan;
    state.step = Math.min(Math.max(0, state.step), melody.length - 1);
    $('melody-error').hidden = true; $('melody').removeAttribute('aria-invalid');
    $('phrase-steps').hidden = false; document.querySelector('.transition-inspector').hidden = false;
    renderPlan(); save();
    return true;
  } catch (error) {
    $('melody-error').textContent = error.message; $('melody-error').hidden = false; $('melody').setAttribute('aria-invalid', 'true');
    state.plan = null;
    $('phrase-steps').innerHTML = ''; $('transition-diagrams').innerHTML = '';
    $('plan-summary').textContent = 'Edit the melody to calculate a fingering path.';
    document.querySelector('.transition-inspector').hidden = true;
    return false;
  }
}
function routeStats(path) {
  return path.slice(1).reduce((total, to, i) => {
    const diff = changes(path[i], to); return { keys: total.keys + diff.keys, rollers: total.rollers + diff.rollers };
  }, { keys: 0, rollers: 0 });
}
function renderPlan() {
  const path = state.plan.path, stats = routeStats(path);
  $('plan-summary').innerHTML = `<span><b>${stats.keys}</b> key changes</span><span><b>${stats.rollers}</b> thumb octave steps</span><span><b>${Number(state.plan.cost.toFixed(2))}</b> movement score</span>`;
  $('phrase-steps').innerHTML = path.map((f, i) => `<button type="button" class="phrase-step" data-step="${i}" aria-pressed="${i === state.step}" tabindex="${i === state.step ? 0 : -1}" aria-label="Step ${i + 1}: ${name(state.melody[i])}${state.locks[i] ? ', locked' : ''}"><span class="step-heading"><b>${name(state.melody[i])}</b><span>${i + 1}${state.locks[i] ? ' / locked' : ''}</span></span>${keyDiagram(f.bits, { horizontal: true })}<span class="step-caption">${i ? `${changes(path[i - 1], f).keys} key changes` : 'Start here'}</span></button>`).join('');
  renderTransition();
}
function updatePhraseSteps(playing = false) {
  $('phrase-steps').querySelectorAll('[data-step]').forEach((button, i) => {
    const current = i === state.step;
    button.setAttribute('aria-pressed', String(current));
    button.tabIndex = current ? 0 : -1;
    button.classList.toggle('playing', playing && current);
  });
}
function renderTransition() {
  const i = state.step, path = state.plan.path, to = path[i], from = path[Math.max(0, i - 1)];
  $('transition-title').textContent = i ? `${name(state.melody[i - 1])} → ${name(state.melody[i])}` : `Start on ${name(state.melody[0])}`;
  const panel = (f, midi, previous) => `<div class="transition-note"><strong>${name(midi)}</strong>${keyDiagram(f.bits, { horizontal: true, before: previous?.bits })}</div>`;
  $('transition-diagrams').innerHTML = i ? panel(from, state.melody[i - 1]) + '<span class="transition-arrow" aria-hidden="true">→</span>' + panel(to, state.melody[i], from) : panel(to, state.melody[i]);
  if (i) {
    const diff = changes(from, to);
    $('transition-detail').innerHTML = `<div class="move-grid"><div><strong>Touch</strong><p>${diff.touch.join(', ') || 'No new keys'}</p></div><div><strong>Release</strong><p>${diff.release.join(', ') || 'No keys'}</p></div><div><strong>Keep touching</strong><p>${diff.keep.join(', ') || 'No keys'}</p></div></div><p class="thumb-move">${diff.rollers ? `Left thumb: ${diff.direction > 0 ? 'up toward the mouthpiece' : 'down away from the mouthpiece'} ${diff.rollers} ${diff.rollers === 1 ? 'octave' : 'octaves'}.` : 'Keep your thumb in place.'}</p>`;
  } else {
    $('transition-detail').innerHTML = `<p class="thumb-move">Touch ${keyList(to.bits)}.</p>`;
  }
  const options = candidates(state.melody[i], state.chartChoices[i]);
  const lock = state.locks[i] ?? '';
  const choice = (id, text, label) =>
    `<button type="button" data-fingering-choice="${id}" aria-pressed="${id === lock}" aria-label="${label}" title="${label}">${text}</button>`;
  $('step-variant').innerHTML = choice('', 'Auto', 'Use suggested fingering') + options.map((f, j) => {
    const offset = f.shift - to.shift;
    const label = `${f.fromChart ? 'From chart' : variantLabel(f, j)}. Touch ${keyList(f.bits)}.${offset ? ` ${thumbOffset(offset)} than the current choice.` : ''}`;
    return choice(f.id, f.fromChart ? 'Chart' : f.main ? 'Main' : j + 1, label);
  }).join('');
  $('unlock').disabled = !Object.keys(state.locks).length;
}

let audioContext, activeNodes = [], audioTimers = [], playbackGeneration = 0;
function stopAudio() {
  playbackGeneration++;
  audioTimers.forEach(clearTimeout); audioTimers = [];
  activeNodes.forEach(node => { try { node.stop(); } catch { /* Already ended. */ } }); activeNodes = [];
  document.querySelectorAll('.playing').forEach(el => el.classList.remove('playing'));
  $('play-phrase').textContent = 'Play phrase';
}
async function getAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Audio is unavailable in this browser. The chart still works.');
  audioContext ||= new Audio();
  await audioContext.resume();
  return audioContext;
}
function tone(context, midi, at, duration) {
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = 'triangle'; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.09, at + 0.015);
  gain.gain.setValueAtTime(0.09, at + Math.max(0.02, duration - 0.04)); gain.gain.linearRampToValueAtTime(0, at + duration);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + duration + 0.02);
  activeNodes.push(oscillator);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); activeNodes = activeNodes.filter(n => n !== oscillator); };
}
async function hearNote() {
  stopAudio(); const generation = playbackGeneration;
  try {
    const midi = chartMidi(melodyDraft());
    if (!supportsMidi(midi)) throw new Error(`${name(midi)} is outside the chart's supported range.`);
    const context = await getAudio();
    if (generation !== playbackGeneration) return;
    tone(context, midi, context.currentTime, .6);
    say(`Reference tone: ${name(midi)}.`);
  } catch (error) { say(error.message); }
}
async function playPhrase() {
  if ($('play-phrase').textContent === 'Stop') { stopAudio(); return; }
  if (!calculate()) return;
  const generation = playbackGeneration;
  try {
    const context = await getAudio(); if (generation !== playbackGeneration) return;
    const bpm = Math.max(30, Math.min(240, Number($('tempo').value) || 90)); $('tempo').value = bpm;
    const duration = 60 / bpm, start = context.currentTime + .05;
    $('play-phrase').textContent = 'Stop';
    state.melody.forEach((midi, i) => {
      tone(context, midi, start + i * duration, duration * .85);
      audioTimers.push(setTimeout(() => {
        state.step = i;
        updatePhraseSteps(true);
        const step = $('phrase-steps').children[i];
        $('phrase-steps').scrollTo({ left: Math.max(0, step.offsetLeft - $('phrase-steps').offsetLeft - 16), behavior: 'instant' });
        renderTransition();
      }, (i * duration + .05) * 1000));
    });
    audioTimers.push(setTimeout(stopAudio, (state.melody.length * duration + .1) * 1000));
  } catch (error) { stopAudio(); say(error.message); }
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
$('note-picker').addEventListener('click', event => {
  const button = event.target.closest('[data-pitch]');
  if (!button) return;
  stopAudio();
  state.pitch = Number(button.dataset.pitch);
  renderExplorer();
  $('note-picker').querySelector(`[data-pitch="${state.pitch}"]`).focus();
});
$('note-picker').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...$('note-picker').querySelectorAll('button')];
  const index = buttons.indexOf(event.target), next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
  next.click();
});
$('alternates').addEventListener('click', event => {
  const button = event.target.closest('[data-fingering]');
  if (button) {
    $('alternates').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    state.selected = Number(button.dataset.fingering);
    renderSelectedFingering(ranked[state.selected - 1]);
    return;
  }
  const page = event.target.closest('[data-page]');
  if (page) {
    const details = page.closest('[data-more]');
    renderAdditional(details, Number(page.dataset.page));
    details.querySelector('.additional-rows .alternate').focus();
  }
});
$('hear-note').addEventListener('click', hearNote);
$('detail-toggle').addEventListener('click', () => {
  const expanded = document.querySelector('.instrument-stage').classList.toggle('expanded');
  $('detail-toggle').setAttribute('aria-expanded', String(expanded));
  $('detail-toggle').textContent = expanded ? 'Hide keys' : 'Show keys';
});
$('add-note').addEventListener('click', () => {
  const input = $('melody');
  let melody;
  try { melody = melodyDraft(); } catch {
    showView('plan');
    input.focus();
    return;
  }
  if (melody.length >= 64) { say('The phrase already has 64 notes. Remove a note in the planner first.'); return; }
  const midi = chartMidi(melody);
  const { bits } = ranked[state.selected - 1];
  const picked = candidates(midi, bits).find(f => f.bits === bits);
  const note = name(midi);
  if (!picked) {
    say(`This fingering cannot play ${note} in the supported registers. Change the last octave in the melody or choose another fingering.`);
    return;
  }
  keepUnchangedChoices(melody);
  state.step = melody.length;
  state.chartChoices[state.step] = bits;
  state.locks[state.step] = picked.id;
  state.melody = [...melody, midi];
  input.value = `${input.value.trim()} ${note}`.trim();
  state.plan = null;
  showView('plan');
  (state.plan ? $('step-variant') : input).focus();
  save();
  say(`Added ${note} and locked its fingering.`);
});
$('melody-form').addEventListener('submit', event => { event.preventDefault(); calculate(); });
$('melody').addEventListener('input', () => {
  state.usePhraseOctave = true;
  stopAudio(); state.plan = null; $('phrase-steps').innerHTML = '';
  document.querySelector('.transition-inspector').hidden = true;
  $('plan-summary').textContent = 'Melody changed. Choose Find fingerings to update the path.';
  $('melody-error').hidden = true; $('melody').removeAttribute('aria-invalid'); save();
});
document.querySelectorAll('[data-phrase]').forEach(button => button.addEventListener('click', () => {
  $('melody').value = button.dataset.phrase;
  state.usePhraseOctave = false;
  state.step = 1;
  state.locks = {};
  state.chartChoices = {};
  calculate();
}));
$('phrase-steps').addEventListener('click', event => {
  const button = event.target.closest('[data-step]'); if (!button) return;
  stopAudio(); state.step = Number(button.dataset.step);
  updatePhraseSteps();
  renderTransition();
});
navigateButtons('phrase-steps', '[data-step]', { ArrowLeft: -1, ArrowRight: 1 });
navigateButtons('alternates', '[data-fingering]', { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 });
$('step-variant').addEventListener('click', event => {
  const button = event.target.closest('[data-fingering-choice]');
  if (!button) return;
  const choice = button.dataset.fingeringChoice;
  if (choice) state.locks[state.step] = choice;
  else delete state.locks[state.step];
  if (calculate()) $('step-variant').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
});
document.querySelectorAll('[data-weight]').forEach(button => button.addEventListener('click', () => {
  markChoice(button);
  calculate();
}));
document.querySelectorAll('[data-spelling]').forEach(button => button.addEventListener('click', () => {
  state.flats = button.dataset.spelling === 'flats';
  renderExplorer();
  renderKeyExplorer();
  if (state.plan) renderPlan();
  if (moveSelection.result) renderMoveMatrix();
}));
$('move-matrix').addEventListener('click', event => {
  const cell = event.target.closest('[data-from]');
  if (cell) selectMovePair(Number(cell.dataset.from), Number(cell.dataset.to));
});
$('move-matrix').addEventListener('keydown', event => {
  const cell = event.target.closest('[data-from]');
  const arrow = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1] }[event.key];
  if (!cell || !arrow) return;
  event.preventDefault();
  const [dy, dx] = arrow;
  let from = Number(cell.dataset.from) + dy, to = Number(cell.dataset.to) + dx;
  if (from === to) { from += dy; to += dx; }
  const next = $('move-matrix').querySelector(`[data-from="${from}"][data-to="${to}"]`);
  if (next) {
    selectMovePair(from, to);
    next.focus();
  }
});
$('move-result').addEventListener('click', event => {
  const button = event.target.closest('[data-move-option]');
  if (!button) return;
  moveSelection.option = Number(button.dataset.moveOption);
  renderMoveResult();
  $('move-result').querySelector('[data-move-option][aria-pressed="true"]').focus({ preventScroll: true });
});
document.querySelectorAll('[data-register-step]').forEach(button => button.addEventListener('click', () => {
  stopAudio();
  state.keyRegister += Number(button.dataset.registerStep);
  renderKeyExplorer();
}));
document.querySelectorAll('[data-rule-filter]').forEach(button => button.addEventListener('click', () => {
  state.keyFilter = button.dataset.ruleFilter;
  markChoice(button);
  renderKeyExplorer();
}));
$('unlock').addEventListener('click', () => { state.locks = {}; calculate(); });
$('open-scales').addEventListener('click', () => {
  renderScaleLibrary();
  $('scale-library').showModal();
});
$('close-scales').addEventListener('click', () => $('scale-library').close());
$('scale-library').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { scaleRoot, scaleGroup, scaleType, scaleOffset, useCustom } = button.dataset;
  if (scaleType !== undefined) return useScale(SCALE_GROUPS[scaleSelection.group][1][Number(scaleType)][1]);
  if (useCustom !== undefined) return useScale([...scaleSelection.custom].sort((a, b) => a - b));
  if (scaleRoot !== undefined) {
    scaleSelection.root = Number(scaleRoot);
    markChoice(button);
    if (scaleSelection.group === SCALE_GROUPS.length) renderScaleLibrary();
    $('scale-roots').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
  if (scaleGroup !== undefined) {
    scaleSelection.group = Number(scaleGroup);
    renderScaleLibrary();
    $('scale-groups').querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
  if (scaleOffset !== undefined) {
    const offset = Number(scaleOffset);
    if (scaleSelection.custom.has(offset)) scaleSelection.custom.delete(offset);
    else scaleSelection.custom.add(offset);
    button.setAttribute('aria-pressed', String(scaleSelection.custom.has(offset)));
  }
});
navigateButtons('scale-roots', '[data-scale-root]', { ArrowLeft: -1, ArrowRight: 1 });
navigateButtons('scale-groups', '[data-scale-group]', { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 });
$('play-phrase').addEventListener('click', playPhrase);
$('tempo').addEventListener('input', stopAudio);
$('key-picker').addEventListener('click', event => {
  const target = event.target.closest('[data-key], [data-key-shape]');
  if (target) selectGuideKey(Number(target.dataset.key ?? target.dataset.keyShape), 'key-picker');
});
$('pitch-drop-table').addEventListener('click', event => {
  const cell = event.target.closest('[data-combination]');
  if (!cell) return;
  stopAudio();
  state.keyBits = cell.dataset.combination;
  renderKeyExplorer();
});
navigateButtons('pitch-drop-table', '[data-combination]', { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
window.addEventListener('pagehide', stopAudio);
$('key-rule-rows').addEventListener('click', event => { const button = event.target.closest('[data-key]'); if (button) selectGuideKey(Number(button.dataset.key), 'key-rule-rows'); });
$('clear-keys').addEventListener('click', () => { stopAudio(); state.keyBits = openKeys; renderKeyExplorer(); });
$('hear-keys').addEventListener('click', async () => {
  stopAudio(); const generation = playbackGeneration;
  try { const context = await getAudio(); if (generation !== playbackGeneration) return; const midi = keyPitch(state.keyBits, state.keyRegister).midi; if (midi > 111) return; tone(context, midi, context.currentTime, .6); say(`Reference tone: ${name(midi)}.`); } catch (error) { say(error.message); }
});
$('key-symbols').innerHTML = KEY_SYMBOLS;
renderPitchDropTable();
renderExplorer(); renderKeyExplorer();
