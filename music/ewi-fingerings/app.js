import { KEY_RULES, keyPitch, isEligibleFingering, toggleKey, signedSteps } from './key-rules.mjs?v=20261117-ranking';
import { KEY_ARTWORK, KEY_RATIOS, INSTRUMENT_KEYS, KEY_CALLOUTS } from './instrument-layout.mjs';
import { staffSvg } from './notation.mjs';
import { SHARPS, FLATS, KEYS, supportsMidi, candidates, noteName, registerName, changes, optimize, routeCost, parseMelody } from './engine.mjs?v=20261117-handoff';
import { rankedFingerings } from './ranking.mjs?v=20261118-bis';

const $ = id => document.getElementById(id);
const storageKey = 'ewi-practice-v2';
const state = { pitch: 7, selected: null, flats: true, view: 'explore', melody: [71, 72, 74, 72, 71], plan: null, step: 1, locks: {}, chartChoices: {}, key: 0, keyBits: '0000000000000', keyRegister: 0, keyFilter: 'all' };
const referenceMidi = () => 60 + state.pitch;
try {
  const current = localStorage.getItem(storageKey);
  const saved = JSON.parse(current || localStorage.getItem('ewi-practice-v1'));
  // v1 persisted the implicit sharps default; migrate note / melody, then use flats.
  if (supportsMidi(saved?.midi)) state.pitch = saved.midi % 12;
  if (current && typeof saved?.flats === 'boolean') state.flats = saved.flats;
  if (typeof saved?.phrase === 'string' && saved.phrase.length < 1000) $('melody').value = saved.phrase;
} catch { /* Storage is optional in private browsing and offline wrappers. */ }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ midi: referenceMidi(), flats: state.flats, phrase: $('melody').value })); } catch { /* Optional. */ }
}
const keyList = bits => KEYS.filter((_, i) => bits[i] === '1').map(k => k.id).join(', ') || 'none';
const name = midi => noteName(midi, state.flats);
const weights = () => ({ roller: Number($('roller-weight').value), pinky: Number($('pinky-weight').value), unfamiliar: Number($('familiar-weight').value) });
function say(message) { $('app-status').textContent = message; }
function melodyDraft() {
  const input = $('melody').value.trim();
  return input ? parseMelody(input) : [];
}
function chartMidi(melody) {
  const last = melody.at(-1);
  return last === undefined ? referenceMidi() : last - last % 12 + state.pitch;
}
function updateChartActions() {
  let midi;
  try { midi = chartMidi(melodyDraft()); } catch { /* The planner reports invalid input. */ }
  $('add-note').textContent = midi === undefined ? 'Add to melody' : `Add ${name(midi)} to melody`;
  $('hear-note').textContent = midi === undefined ? 'Hear note' : `Hear ${name(midi)}`;
}
function showView(view) {
  stopAudio(); state.view = view;
  ['explore', 'plan', 'guide'].forEach(id => { $(id).hidden = id !== view; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  if (view === 'plan' && !state.plan) calculate();
  if (view === 'explore') updateChartActions();
  say('');
}

// Reuse the original EWI artwork, including the crescent bis key and angled levers.
const keyArtwork = KEY_ARTWORK;
const keyRatios = KEY_RATIOS;
const stripX = [16, 35, 64, 96, 125, 146, 172, 196, 228, 260, 287, 311, 335];
const stripHeights = [26, 29, 26, 26, 38, 46, 38, 26, 26, 26, 34, 44, 56];
function keyImage(index, x, y, height) {
  const width = height * keyRatios[index];
  return `<image class="key-image" href="${keyArtwork[index]}.png" x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"/>`;
}
function stripKeyNumbers(y) {
  return stripX.map((x, i) => `<text class="mini-key-label" x="${x}" y="${y}">${i + 1}</text>`).join('');
}
const positions = [[142, 91], [102, 91], [142, 153], [142, 215], [216, 215], [278, 215],
  [90, 310], [142, 310], [142, 372], [142, 434], [216, 396], [278, 396], [278, 458]];
function diagram(fingering, { interactive = false, highlighted = -1, before = null } = {}) {
  const bits = fingering.bits;
  const label = `Front keys: touch ${keyList(bits)}. Other note keys released.`;
  return `<svg class="ewi-diagram" viewBox="0 0 330 530" ${interactive ? 'role="group" aria-label="Select a note key to learn its function"' : `role="img" aria-label="${label}"`}>
    <path class="instrument-body" d="M108 60 Q108 47 122 47 H162 Q176 47 176 60 V474 Q176 491 158 491 H126 Q108 491 108 474Z"/>
    <path class="instrument-mouth" d="M126 47 L130 12 Q142 5 154 12 L158 47Z"/>
    <text class="diagram-hand" x="10" y="30">LEFT HAND</text><text class="diagram-hand" x="10" y="277">RIGHT HAND</text>
    ${KEYS.map((key, i) => {
      const [x, y] = positions[i], round = keyRatios[i] === 1;
      const height = round ? 46 : i === 12 ? 70 : 56;
      return `<g class="diagram-key ${bits[i] === '1' ? 'on' : ''} ${i === highlighted ? 'inspect' : ''} ${before && before.bits[i] !== bits[i] ? 'changed' : ''}" transform="translate(${x} ${y})" ${interactive ? `role="button" tabindex="0" data-key="${i}" aria-label="${key.id}, ${key.finger}, ${key.name}" aria-pressed="${i === highlighted}"` : ''}>
        <rect class="key-hit" x="-28" y="-28" width="56" height="56" rx="8"/>${keyImage(i, 0, 0, height)}<text class="${round ? 'round-label' : 'lever-label'}" y="${round ? 0 : height / 2 + 14}">${key.id}</text></g>`;
    }).join('')}</svg>`;
}
function mini(fingering, before = null, labelled = false) {
  return `<svg class="mini-diagram" viewBox="0 0 350 ${labelled ? 88 : 64}" role="img" aria-label="Touch ${keyList(fingering.bits)}">${KEYS.map((key, i) => {
    return `<g class="diagram-key ${fingering.bits[i] === '1' ? 'on' : ''} ${before && before.bits[i] !== fingering.bits[i] ? 'changed' : ''}">${keyImage(i, stripX[i], 32, stripHeights[i])}${before && before.bits[i] !== fingering.bits[i] ? `<rect class="change-outline" x="${stripX[i] - stripHeights[i] * keyRatios[i] / 2 - 2}" y="${32 - stripHeights[i] / 2 - 2}" width="${stripHeights[i] * keyRatios[i] + 4}" height="${stripHeights[i] + 4}" rx="3"/>` : ''}</g>`;
  }).join('')}${labelled ? stripKeyNumbers(80) : ''}</svg>`;
}
function variantLabel(f, index) { return f.main ? 'Main fingering' : `${f.base < 62 ? 'Low extension' : f.base > 73 ? 'High extension' : 'Alternate'} ${index + 1}`; }
const pageSize = 12;
let ranked = [], shownPitch;
const additional = new Map();
const countLabel = number => number.toLocaleString('en-US');

function chartRow(f) {
  const label = `Rank ${f.rank}, register ${registerName(f.shift)}, ${f.heldCount} keys down. Touch ${keyList(f.bits)}.`;
  return `<button class="alternate" type="button" data-fingering="${f.rank}" aria-pressed="${f.rank === state.selected}" aria-label="${label}"><span class="alternate-label">${f.rank}</span>${mini(f)}<span class="alternate-held">${f.heldCount}</span></button>`;
}

function renderAdditional(details, page) {
  const group = additional.get(Number(details.dataset.more));
  const start = page * pageSize;
  const end = Math.min(start + pageSize, group.length);
  const body = details.querySelector('.additional-rows');
  body.innerHTML = `${group.slice(start, end).map(chartRow).join('')}<div class="additional-pagination">
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
  $('alternates').innerHTML = [...groups].sort(([a], [b]) => a - b).map(([shift, group]) => {
    const withoutSide = group.filter(f => f.sideCount === 0);
    const visible = withoutSide.length ? withoutSide : group.filter(f => f.sideCount === group[0].sideCount).slice(0, 3);
    const more = group.filter(f => !visible.includes(f));
    additional.set(shift, more);
    return `<section class="register-group" data-register="${shift}" aria-label="Register ${registerName(shift)} fingerings">
      <h3><span>Register ${registerName(shift)}</span><span>${withoutSide.length ? '' : 'Side keys required'}</span></h3>
      <div class="ranked-rows">${visible.map(chartRow).join('')}</div>
      ${more.length ? `<details class="additional-fingerings" data-more="${shift}"><summary>${countLabel(more.length)} ${withoutSide.length ? 'side-key' : 'more'} fingerings</summary><div class="additional-rows"></div></details>` : ''}
    </section>`;
  }).join('');
  $('alternates').scrollTop = 0;
  $('alternates').querySelectorAll('[data-more]').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.isConnected && details.open && !details.querySelector('.additional-rows').hasChildNodes()) renderAdditional(details, 0);
    });
  });
}

function renderSelectedFingering(selected) {
  $('selected-variant').textContent = `Rank ${selected.rank}`;
  $('main-diagram').innerHTML = `<div class="desktop-instrument">${diagram(selected)}</div><div class="mobile-instrument">${mini(selected, null, true)}<span class="small-label">Keys K1–K13, from mouthpiece to bell</span></div>`;
  $('thumb-label').textContent = `Register ${registerName(selected.shift)}`;
  $('roller-track').innerHTML = [4, 3, 2, 1, 0, -1, -2].map(shift => `<span class="${shift === selected.shift ? 'current' : ''}" ${shift === selected.shift ? 'aria-current="true"' : ''}>${registerName(shift)}</span>`).join('');
  $('held-description').textContent = `Touch ${keyList(selected.bits)}. Keep the other note keys clear.`;
  $('ranking-detail').textContent = `${selected.heldCount} keys down · ${selected.sideCount} side touches · comfort penalty ${selected.comfortCost}`;
}

function renderExplorer() {
  if (shownPitch !== state.pitch) renderChart();
  const noteNames = state.flats ? FLATS : SHARPS;
  $('spelling').value = state.flats ? 'flats' : 'sharps';
  $('note-picker').innerHTML = noteNames.map((n, i) =>
    `<button type="button" data-pitch="${i}" class="${[1, 3, 6, 8, 10].includes(i) ? 'accidental' : ''}" aria-pressed="${i === state.pitch}">${n}</button>`
  ).join('');
  $('selected-note').textContent = noteNames[state.pitch];
  updateChartActions();
  renderSelectedFingering(ranked[state.selected - 1]);
  save();
}
// All key centres and sizes share one manufacturer-reference transform.
function keyClasses(index, held) {
  const rule = KEY_RULES[index];
  return `effect-${rule.color} ${rule.kind === 'Fixed' ? '' : 'conditional-key'} ${held ? 'on' : ''}`;
}
function realInstrument(bits) {
  return `<svg class="real-ewi" viewBox="0 0 320 860" role="group" aria-label="EWI4000s note keys, proportional manufacturer-reference layout; numbered controls are enlarged">
    <defs><linearGradient id="ewi-silver"><stop offset="0" class="metal-edge"/><stop offset=".35" class="metal-face"/><stop offset=".7" class="metal-face"/><stop offset="1" class="metal-edge"/></linearGradient></defs>
    <path class="real-mouthpiece" d="M140 12 Q160 3 180 12 L185 59 H135Z"/>
    <rect class="real-neck" x="133" y="48" width="54" height="45" rx="7"/>
    <path class="real-body" d="M112 82 Q160 73 208 82 L208 745 L198 780 H122 L112 745Z"/>
    <path class="real-inset" d="M140 167 Q160 160 180 167 V620 Q180 633 160 633 Q140 633 140 620Z"/>
    <text class="real-model" x="160" y="124">EWI4000s</text>
    <rect class="real-neck" x="121" y="773" width="78" height="15" rx="3"/>
    ${KEYS.map((key, i) => {
      const geometry = INSTRUMENT_KEYS[i], { x, y, width, height } = geometry;
      const [cx, cy] = KEY_CALLOUTS[i], held = bits[i] === '1', rule = KEY_RULES[i];
      return `<g class="diagram-key ${keyClasses(i, held)} ${state.key === i ? 'inspect' : ''}" role="button" tabindex="0" data-key="${i}" data-usual="${rule.usual}" aria-pressed="${held}" aria-label="${key.id}, ${key.finger}. Usually ${rule.usualText} Exceptions: ${rule.exceptions} ${held ? 'Held, tap to release.' : 'Released, tap to hold.'}">
        <title>${key.id}: ${rule.usualText} Exceptions: ${rule.exceptions}</title>
        <line class="key-leader" x1="${cx < 160 ? cx + 46 : cx - 46}" y1="${cy}" x2="${x}" y2="${y}"/>
        <g class="physical-key" transform="translate(${x} ${y}) rotate(90)">${keyImage(i, 0, 0, height)}${rule.kind !== 'Fixed' ? `<rect class="physical-conditional" x="${-width / 2 - 1.5}" y="${-height / 2 - 1.5}" width="${width + 3}" height="${height + 3}" rx="3"/>` : ''}</g>
        <rect class="key-number-button" x="${cx - 46}" y="${cy - 38}" width="92" height="76" rx="8"/>
        <text class="key-number-text" x="${cx}" y="${cy - (rule.badges.length ? 21 : 4)}">${key.id} ${signedSteps(rule.usual)}</text>
        ${rule.badges.map((badge, j) => `<text class="key-dependency" x="${cx}" y="${cy + 3 + j * 22}">${badge}</text>`).join('')}
      </g>`;
    }).join('')}</svg>`;
}
function toggleGuideKey(bits, index) {
  const next = toggleKey(bits, index);
  if (isEligibleFingering(next)) return next;
  // K2 cannot start a new touch by itself. Releasing K1 also releases K2.
  return index === 1 ? bits : `00${next.slice(2)}`;
}
function guideKeyExample(index) {
  const bits = state.keyBits;
  const other = toggleGuideKey(bits, index);
  if (bits === other) return 'Hold K1 to use K2.';
  const [off, on] = bits[index] === '1' ? [other, bits] : [bits, other];
  const from = keyPitch(off, state.keyRegister).midi;
  const to = keyPitch(on, state.keyRegister).midi;
  const together = index === 0 && on[1] === '1' ? ' · K1 and K2 together' : '';
  return `${name(from)} → ${name(to)} (${signedSteps(to - from)})${together}`;
}
function renderKeyExplorer() {
  const midi = keyPitch(state.keyBits, state.keyRegister).midi;
  $('guide-diagram').innerHTML = realInstrument(state.keyBits);
  $('key-note').textContent = name(midi);
  $('key-midi').textContent = `MIDI ${midi}`;
  $('key-staff').innerHTML = staffSvg(midi, state.flats);
  $('key-register').value = state.keyRegister;
  $('key-spelling').value = state.flats ? 'flats' : 'sharps';
  $('key-held').textContent = `Held: ${keyList(state.keyBits)}.`;
  $('key-range').hidden = midi <= 111;
  $('key-range').textContent = 'Above this guide’s verified MIDI range; lower the thumb register to match a verified pitch.';
  $('hear-keys').disabled = midi > 111;
  $('key-picker').innerHTML = KEYS.map((k, i) => `<button type="button" class="key-state-button ${keyClasses(i, state.keyBits[i] === '1')}" data-key="${i}" aria-label="${k.id}, ${k.finger}, ${state.keyBits[i] === '1' ? 'held, release' : 'released, hold'}" aria-pressed="${state.keyBits[i] === '1'}">${k.id}</button>`).join('');
  const key = KEYS[state.key], rule = KEY_RULES[state.key];
  $('key-detail').innerHTML = `<h3>${key.id} · ${key.finger}</h3><dl><div><dt>Usually</dt><dd class="usual-rule effect-${rule.color}">${rule.usualText}</dd></div><div><dt>Exceptions</dt><dd>${rule.exceptions}</dd></div><div><dt>With your other keys</dt><dd>${guideKeyExample(state.key)}</dd></div></dl>`;
  $('key-preset').options[1].textContent = `Open ${name(73)}`;
  $('key-rule-rows').innerHTML = KEYS.map((k, i) => {
    const rule = KEY_RULES[i];
    if (state.keyFilter === 'fixed' && rule.kind !== 'Fixed' || state.keyFilter === 'interacting' && rule.kind === 'Fixed') return '';
    return `<tr class="${state.keyBits[i] === '1' ? 'held' : ''}"><th scope="row"><button type="button" class="key-state-button ${keyClasses(i, state.keyBits[i] === '1')}" data-key="${i}" aria-pressed="${state.keyBits[i] === '1'}" aria-label="${k.id}, ${state.keyBits[i] === '1' ? 'release' : 'hold'}">${k.id}</button><span>${k.finger}</span></th><td><strong class="usual-rule effect-${rule.color}">${signedSteps(rule.usual)}</strong><span class="rule-kind">${rule.kind}</span></td><td><strong class="rule-usual-text">${rule.usualText}</strong><span class="rule-exception">Exceptions: ${rule.exceptions}</span><span class="rule-example">Now: ${guideKeyExample(i)}</span></td></tr>`;
  }).join('');
}
function selectGuideKey(index, restoreFocus = false, origin = 'guide-diagram') {
  stopAudio();
  state.key = index;
  const next = toggleGuideKey(state.keyBits, index);
  say(next === state.keyBits ? 'Hold K1 to use K2.' : '');
  state.keyBits = next;
  $('key-preset').value = '';
  renderKeyExplorer();
  if (restoreFocus) $(origin).querySelector(`[data-key="${index}"]`).focus({ preventScroll: true });
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
  const baseline = state.melody.map(midi => candidates(midi)[0]);
  const saving = Math.max(0, routeCost(baseline, weights()) - state.plan.cost);
  $('plan-summary').innerHTML = `<span><b>${stats.keys}</b> key changes</span><span><b>${stats.rollers}</b> thumb register steps</span><span><b>${Number(state.plan.cost.toFixed(2))}</b> movement score</span><span>${Object.keys(state.locks).length ? 'Includes your locked choices' : `${Number(saving.toFixed(2))} lower score than default choices`}</span>`;
  $('phrase-steps').innerHTML = path.map((f, i) => `<button type="button" class="phrase-step" data-step="${i}" aria-pressed="${i === state.step}" aria-label="Step ${i + 1}: ${name(state.melody[i])}, register ${registerName(f.shift)}${state.locks[i] ? ', locked' : ''}"><span class="step-heading"><b>${name(state.melody[i])}</b><span>${i + 1}${state.locks[i] ? ' / locked' : ''}</span></span>${mini(f)}<span class="step-caption">Register ${registerName(f.shift)}<br>${i ? `${changes(path[i - 1], f).keys} key changes` : 'Start here'}</span></button>`).join('');
  renderTransition();
}
function renderTransition() {
  const i = state.step, path = state.plan.path, to = path[i], from = path[Math.max(0, i - 1)];
  $('transition-title').textContent = i ? `${name(state.melody[i - 1])} → ${name(state.melody[i])}` : `Start on ${name(state.melody[0])}`;
  const panel = (f, midi, previous) => `<div class="transition-note"><strong>${name(midi)}</strong><span class="small-label">Register ${registerName(f.shift)}</span>${mini(f, previous)}</div>`;
  $('transition-diagrams').innerHTML = i ? panel(from, state.melody[i - 1]) + '<span class="transition-arrow" aria-hidden="true">→</span>' + panel(to, state.melody[i], from) : panel(to, state.melody[i]);
  if (i) {
    const diff = changes(from, to);
    $('transition-detail').innerHTML = `<div class="move-grid"><div><strong>Touch</strong><p>${diff.touch.join(', ') || 'No new keys'}</p></div><div><strong>Release</strong><p>${diff.release.join(', ') || 'No keys'}</p></div><div><strong>Keep touching</strong><p>${diff.keep.join(', ') || 'No keys'}</p></div></div><p class="thumb-move">${diff.rollers ? `Left thumb: ${diff.direction > 0 ? 'up toward the mouthpiece' : 'down away from the mouthpiece'} ${diff.rollers} register ${diff.rollers === 1 ? 'step' : 'steps'} (${registerName(from.shift)} → ${registerName(to.shift)}).` : `Keep the left thumb in register ${registerName(to.shift)}.`} Dashed key outlines mark changes.</p>`;
  } else {
    $('transition-detail').innerHTML = `<p class="thumb-move">Touch ${keyList(to.bits)} and set the left thumb to register ${registerName(to.shift)}.</p>`;
  }
  const options = candidates(state.melody[i], state.chartChoices[i]);
  const label = (f, index) => `${f.fromChart ? `From chart · ${keyList(f.bits)}` : variantLabel(f, index)} · register ${registerName(f.shift)} · ${f.bits.split('1').length - 1} keys`;
  const suggested = state.locks[i] ? 'Use suggested fingering (unlock)' : `Suggested · ${label(to, options.findIndex(f => f.id === to.id))}`;
  $('step-variant').innerHTML = `<option value="">${suggested}</option>` + options.map((f, j) => `<option value="${f.id}">${label(f, j)}</option>`).join('');
  $('step-variant').value = state.locks[i] ?? '';
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
        document.querySelectorAll('.phrase-step').forEach((el, j) => { el.classList.toggle('playing', i === j); el.setAttribute('aria-pressed', String(i === j)); });
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
$('spelling').addEventListener('change', () => { state.flats = $('spelling').value === 'flats'; renderExplorer(); renderKeyExplorer(); if (state.plan) renderPlan(); });
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
  $('detail-toggle').textContent = expanded ? 'Hide details' : 'Show details';
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
  stopAudio(); state.plan = null; $('phrase-steps').innerHTML = '';
  document.querySelector('.transition-inspector').hidden = true;
  $('plan-summary').textContent = 'Melody changed. Choose Find fingerings to update the path.';
  $('melody-error').hidden = true; $('melody').removeAttribute('aria-invalid'); save();
});
document.querySelectorAll('[data-phrase]').forEach(button => button.addEventListener('click', () => {
  $('melody').value = button.dataset.phrase;
  state.step = 1;
  state.locks = {};
  state.chartChoices = {};
  calculate();
}));
document.querySelectorAll('.preferences select').forEach(input => input.addEventListener('change', calculate));
$('phrase-steps').addEventListener('click', event => {
  const button = event.target.closest('[data-step]'); if (!button) return;
  stopAudio(); state.step = Number(button.dataset.step);
  document.querySelectorAll('.phrase-step').forEach((el, i) => el.setAttribute('aria-pressed', String(i === state.step))); renderTransition();
});
$('step-variant').addEventListener('change', () => {
  const choice = $('step-variant').value;
  if (choice) state.locks[state.step] = choice;
  else delete state.locks[state.step];
  calculate();
});
$('unlock').addEventListener('click', () => { state.locks = {}; calculate(); });
$('play-phrase').addEventListener('click', playPhrase);
$('tempo').addEventListener('input', stopAudio);
$('key-picker').addEventListener('click', event => { const button = event.target.closest('[data-key]'); if (button) selectGuideKey(Number(button.dataset.key), true, 'key-picker'); });
$('guide-diagram').addEventListener('click', event => { const key = event.target.closest('[data-key]'); if (key) selectGuideKey(Number(key.dataset.key), true); });
$('guide-diagram').addEventListener('keydown', event => { const key = event.target.closest('[data-key]'); if (key && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectGuideKey(Number(key.dataset.key), true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
window.addEventListener('pagehide', stopAudio);
$('key-rule-rows').addEventListener('click', event => { const button = event.target.closest('[data-key]'); if (button) selectGuideKey(Number(button.dataset.key), true, 'key-rule-rows'); });
$('key-register').addEventListener('change', () => { stopAudio(); state.keyRegister = Number($('key-register').value); renderKeyExplorer(); });
$('key-spelling').addEventListener('change', () => { state.flats = $('key-spelling').value === 'flats'; renderKeyExplorer(); renderExplorer(); if (state.plan) renderPlan(); });
$('key-rule-filter').addEventListener('change', () => { state.keyFilter = $('key-rule-filter').value; renderKeyExplorer(); });
$('key-preset').addEventListener('change', () => { if ($('key-preset').value) { stopAudio(); state.keyBits = $('key-preset').value; state.keyRegister = 0; renderKeyExplorer(); } });
$('clear-keys').addEventListener('click', () => { stopAudio(); state.keyBits = '0000000000000'; $('key-preset').value = ''; renderKeyExplorer(); });
$('hear-keys').addEventListener('click', async () => {
  stopAudio(); const generation = playbackGeneration;
  try { const context = await getAudio(); if (generation !== playbackGeneration) return; const midi = keyPitch(state.keyBits, state.keyRegister).midi; if (midi > 111) return; tone(context, midi, context.currentTime, .6); say(`Reference tone: ${name(midi)}.`); } catch (error) { say(error.message); }
});
$('chart-key-numbers').innerHTML = `<svg viewBox="0 0 350 22">${stripKeyNumbers(17)}</svg>`;
renderExplorer(); renderKeyExplorer();
