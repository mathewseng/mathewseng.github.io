import { SHARPS, FLATS, KEYS, candidates, noteName, registerName, changes, optimize, routeCost, parseMelody } from './engine.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'ewi-practice-v1';
const state = { midi: 67, selected: null, flats: false, view: 'explore', melody: [71, 72, 74, 72, 71], plan: null, step: 1, locks: {}, key: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && candidates(saved.midi).length) state.midi = saved.midi;
  if (typeof saved?.flats === 'boolean') state.flats = saved.flats;
  if (typeof saved?.phrase === 'string' && saved.phrase.length < 1000) $('melody').value = saved.phrase;
} catch { /* Storage is optional in private browsing and offline wrappers. */ }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ midi: state.midi, flats: state.flats, phrase: $('melody').value })); } catch { /* Optional. */ }
}
const keyList = bits => KEYS.filter((_, i) => bits[i] === '1').map(k => k.id).join(', ') || 'none';
const name = midi => noteName(midi, state.flats);
const pc = () => state.midi % 12;
const octave = () => Math.floor(state.midi / 12) - 1;
const weights = () => ({ roller: Number($('roller-weight').value), pinky: Number($('pinky-weight').value), unfamiliar: Number($('familiar-weight').value) });
function say(message) { $('app-status').textContent = message; }
function showView(view) {
  stopAudio(); state.view = view;
  ['explore', 'plan', 'guide'].forEach(id => { $(id).hidden = id !== view; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  if (view === 'plan' && !state.plan) calculate();
  say('');
}

// Schematic front layout. Labels are Akai's K1..K13, not finger numbers.
const positions = [[142, 91], [80, 91], [142, 153], [142, 215], [216, 215], [278, 215],
  [80, 310], [142, 310], [142, 372], [142, 434], [216, 396], [278, 396], [278, 458]];
function diagram(fingering, { interactive = false, highlighted = -1, before = null } = {}) {
  const bits = fingering.bits;
  const label = `Front keys: touch ${keyList(bits)}. Other note keys released.`;
  return `<svg class="ewi-diagram" viewBox="0 0 330 510" ${interactive ? 'role="group" aria-label="Select a note key to learn its function"' : `role="img" aria-label="${label}"`}>
    <path class="instrument-body" d="M108 60 Q108 47 122 47 H162 Q176 47 176 60 V474 Q176 491 158 491 H126 Q108 491 108 474Z"/>
    <path class="instrument-mouth" d="M126 47 L130 12 Q142 5 154 12 L158 47Z"/>
    <text class="diagram-hand" x="10" y="30">LEFT HAND</text><text class="diagram-hand" x="10" y="277">RIGHT HAND</text>
    ${KEYS.map((key, i) => {
      const [x, y] = positions[i];
      const shape = [0, 2, 3, 7, 8, 9].includes(i) ? `<circle class="key-face" r="23"/>` : `<rect class="key-face" x="-23" y="-23" width="46" height="46" rx="${i === 1 ? 19 : 8}"/>`;
      return `<g class="diagram-key ${bits[i] === '1' ? 'on' : ''} ${i === highlighted ? 'inspect' : ''} ${before && before.bits[i] !== bits[i] ? 'changed' : ''}" transform="translate(${x} ${y})" ${interactive ? `role="button" tabindex="0" data-key="${i}" aria-label="${key.id}, ${key.finger}, ${key.name}" aria-pressed="${i === highlighted}"` : ''}>
        <rect class="key-hit" x="-28" y="-28" width="56" height="56" rx="8"/>${shape}<text y="0">${key.id}</text>${bits[i] === '1' ? '<circle class="touch-mark" cx="0" cy="15" r="2"/>' : ''}</g>`;
    }).join('')}</svg>`;
}
function mini(fingering, before = null, labelled = false) {
  // Same schematic, rotated into a horizontal strip; filled = touched.
  return `<svg class="mini-diagram" viewBox="0 0 340 ${labelled ? 88 : 80}" role="img" aria-label="Touch ${keyList(fingering.bits)}">${KEYS.map((key, i) => {
    const x = [14, 30, 54, 80, 107, 125, 151, 169, 195, 221, 248, 276, 305][i];
    const y = [40, 22, 40, 40, 24, 24, 20, 40, 40, 40, 40, 40, 40][i];
    const round = [0, 2, 3, 7, 8, 9].includes(i);
    return `<g class="diagram-key ${fingering.bits[i] === '1' ? 'on' : ''} ${before && before.bits[i] !== fingering.bits[i] ? 'changed' : ''}">${round ? `<circle class="key-face" cx="${x}" cy="${y}" r="10"/>` : `<rect class="key-face" x="${x - 5}" y="${y - 15}" width="10" height="30" rx="4"/>`}</g>${labelled ? `<text class="mini-key-label" x="${x}" y="68">${i + 1}</text>` : ''}`;
  }).join('')}${labelled ? '<text class="mini-hand-label" x="12" y="85">LEFT HAND</text><text class="mini-hand-label" x="164" y="85">RIGHT HAND</text>' : ''}</svg>`;
}
function variantLabel(f, index) { return f.main ? 'Main fingering' : `${f.base < 62 ? 'Low extension' : f.base > 73 ? 'High extension' : 'Alternate'} ${index + 1}`; }
function renderExplorer() {
  const options = candidates(state.midi);
  const selected = options.find(f => f.id === state.selected) || options[0];
  state.selected = selected.id;
  $('spelling').value = state.flats ? 'flats' : 'sharps';
  $('note-picker').innerHTML = (state.flats ? FLATS : SHARPS).map((n, i) => {
    const midi = (octave() + 1) * 12 + i;
    return `<button type="button" data-pitch="${i}" class="${[1, 3, 6, 8, 10].includes(i) ? 'accidental' : ''}" aria-label="${n}${octave()}" aria-pressed="${i === pc()}" ${candidates(midi).length ? '' : 'disabled'}>${n}</button>`;
  }).join('');
  $('octave').innerHTML = Array.from({ length: 8 }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === octave() ? 'selected' : ''} ${candidates((n + 1) * 12 + pc()).length ? '' : 'disabled'}>${n}</option>`).join('');
  $('octave-down').disabled = !candidates(state.midi - 12).length;
  $('octave-up').disabled = !candidates(state.midi + 12).length;
  $('selected-note').textContent = name(state.midi);
  $('selected-midi').textContent = `MIDI ${state.midi}`;
  $('selected-variant').textContent = variantLabel(selected, options.indexOf(selected));
  $('main-diagram').innerHTML = `<div class="desktop-instrument">${diagram(selected)}</div><div class="mobile-instrument">${mini(selected, null, true)}<span class="small-label">Keys K1–K13, from mouthpiece to bell</span></div>`;
  $('thumb-label').textContent = `Register ${registerName(selected.shift)}`;
  $('roller-track').innerHTML = [4, 3, 2, 1, 0, -1, -2].map(shift => `<span class="${shift === selected.shift ? 'current' : ''}" ${shift === selected.shift ? 'aria-current="true"' : ''}>${registerName(shift)}</span>`).join('');
  $('held-description').textContent = `Touch ${keyList(selected.bits)}. Keep the other note keys clear.`;
  $('variant-count').textContent = `${options.length} choices`;
  $('alternates').innerHTML = options.map((f, i) => `<button class="alternate" type="button" data-fingering="${f.id}" aria-pressed="${f.id === selected.id}" aria-label="${variantLabel(f, i)}, register ${registerName(f.shift)}. Touch ${keyList(f.bits)}"><span class="alternate-title"><strong>${variantLabel(f, i)}</strong><span>Reg ${registerName(f.shift)}</span></span>${mini(f)}<span class="alternate-caption">Touch ${keyList(f.bits)}${f.bits[11] === '1' && f.bits[12] === '1' ? ' · bridge K12 + K13' : ''}${f.bits[4] === '1' && f.bits[5] === '1' ? ' · bridge K5 + K6' : ''}</span></button>`).join('');
  save();
}
function selectNote(midi) {
  if (!candidates(midi).length) return;
  stopAudio(); state.midi = midi; state.selected = null; renderExplorer();
}
function selectGuideKey(index, restoreFocus = false) {
  state.key = index;
  const key = KEYS[index];
  const example = { bits: KEYS.map((_, i) => i === index ? '1' : '0').join('') };
  $('guide-diagram').innerHTML = diagram(example, { interactive: true, highlighted: index });
  $('key-picker').innerHTML = KEYS.map((k, i) => `<button type="button" data-key="${i}" aria-label="${k.id}, ${k.finger}, ${k.name}" aria-pressed="${i === index}">${k.id}</button>`).join('');
  $('key-detail').innerHTML = `<h3>${key.id} · ${key.name}</h3><span class="finger">${key.finger}</span><p>${key.detail}</p>`;
  if (restoreFocus) $('guide-diagram').querySelector(`[data-key="${index}"]`).focus();
}
function calculate({ preserveLocks = false } = {}) {
  stopAudio();
  try {
    const melody = parseMelody($('melody').value);
    if (melody.length < 2) throw new Error('Add one more note to compare a transition.');
    if (!preserveLocks) state.locks = {};
    const plan = optimize(melody, weights(), state.locks);
    if (!plan) throw new Error('A locked fingering is unavailable. Reset your choices and try again.');
    state.melody = melody; state.plan = plan;
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
  const options = candidates(state.melody[i]);
  $('step-variant').innerHTML = options.map((f, j) => `<option value="${f.id}" ${f.id === to.id ? 'selected' : ''}>${variantLabel(f, j)} · register ${registerName(f.shift)} · ${f.bits.split('1').length - 1} keys</option>`).join('');
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
  try { const context = await getAudio(); if (generation !== playbackGeneration) return; tone(context, state.midi, context.currentTime, .6); say(`Reference tone: ${name(state.midi)}.`); } catch (error) { say(error.message); }
}
async function playPhrase() {
  if ($('play-phrase').textContent === 'Stop') { stopAudio(); return; }
  if (!calculate({ preserveLocks: true })) return;
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
$('note-picker').addEventListener('click', event => { const button = event.target.closest('[data-pitch]'); if (button) { const pitch = Number(button.dataset.pitch); selectNote((octave() + 1) * 12 + pitch); $('note-picker').querySelector(`[data-pitch="${pitch}"]`).focus(); } });
$('note-picker').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...$('note-picker').querySelectorAll('button:not(:disabled)')];
  const index = buttons.indexOf(event.target), next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
  next.click();
});
$('spelling').addEventListener('change', () => { state.flats = $('spelling').value === 'flats'; renderExplorer(); if (state.plan) renderPlan(); });
$('octave').addEventListener('change', () => selectNote((Number($('octave').value) + 1) * 12 + pc()));
$('octave-down').addEventListener('click', () => selectNote(state.midi - 12));
$('octave-up').addEventListener('click', () => selectNote(state.midi + 12));
$('alternates').addEventListener('click', event => {
  const button = event.target.closest('[data-fingering]'); if (!button) return;
  const top = $('alternates').scrollTop; state.selected = button.dataset.fingering; renderExplorer();
  $('alternates').scrollTop = top;
  $('alternates').querySelector(`[data-fingering="${state.selected}"]`).focus({ preventScroll: true });
});
$('hear-note').addEventListener('click', hearNote);
$('add-note').addEventListener('click', () => {
  const input = $('melody');
  if (input.value.trim().split(/[\s,;|]+/).filter(Boolean).length >= 64) { say('The phrase already has 64 notes. Remove a note in the planner first.'); return; }
  input.value = `${input.value.trim()} ${name(state.midi)}`.trim(); state.step = input.value.split(/[\s,;|]+/).filter(Boolean).length - 1;
  state.plan = null; showView('plan'); calculate(); say(`Added ${name(state.midi)} to your melody.`);
});
$('melody-form').addEventListener('submit', event => { event.preventDefault(); calculate(); });
$('melody').addEventListener('input', () => {
  stopAudio(); state.plan = null; state.locks = {}; $('phrase-steps').innerHTML = '';
  document.querySelector('.transition-inspector').hidden = true;
  $('plan-summary').textContent = 'Melody changed. Choose Find fingerings to update the path.';
  $('melody-error').hidden = true; $('melody').removeAttribute('aria-invalid'); save();
});
document.querySelectorAll('[data-phrase]').forEach(button => button.addEventListener('click', () => { $('melody').value = button.dataset.phrase; state.step = 1; calculate(); }));
document.querySelectorAll('.preferences select').forEach(input => input.addEventListener('change', () => calculate({ preserveLocks: true })));
$('phrase-steps').addEventListener('click', event => {
  const button = event.target.closest('[data-step]'); if (!button) return;
  stopAudio(); state.step = Number(button.dataset.step);
  document.querySelectorAll('.phrase-step').forEach((el, i) => el.setAttribute('aria-pressed', String(i === state.step))); renderTransition();
});
$('step-variant').addEventListener('change', () => { state.locks[state.step] = $('step-variant').value; calculate({ preserveLocks: true }); });
$('unlock').addEventListener('click', () => { state.locks = {}; calculate(); });
$('play-phrase').addEventListener('click', playPhrase);
$('tempo').addEventListener('input', stopAudio);
$('key-picker').addEventListener('click', event => { const button = event.target.closest('[data-key]'); if (button) { const index = Number(button.dataset.key); selectGuideKey(index); $('key-picker').children[index].focus(); } });
$('guide-diagram').addEventListener('click', event => { const key = event.target.closest('[data-key]'); if (key) selectGuideKey(Number(key.dataset.key), true); });
$('guide-diagram').addEventListener('keydown', event => { const key = event.target.closest('[data-key]'); if (key && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectGuideKey(Number(key.dataset.key), true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
window.addEventListener('pagehide', stopAudio);
renderExplorer(); selectGuideKey(0);
