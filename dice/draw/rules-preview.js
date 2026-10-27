import { rulesEVKey } from './rules-ev.mjs';

const cache = new Map(), pending = new Map();
let worker, nextId = 0;
function calculate(config) {
  const key = rulesEVKey(config);
  if (cache.has(key)) return cache.get(key);
  if (!worker) {
    worker = new Worker(new URL('./rules-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) { cache.delete(request.key); request.reject(new Error(data.error)); }
      else request.resolve(data.result);
    };
    worker.onerror = () => {
      worker.terminate(); worker = null;
      for (const request of pending.values()) { cache.delete(request.key); request.reject(new Error('Rules EV could not load.')); }
      pending.clear();
    };
  }
  const promise = new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { key, resolve, reject });
    worker.postMessage({ id, config });
  });
  // Bound the cache during long paytable-editing sessions.
  if (cache.size >= 48) cache.delete(cache.keys().next().value);
  cache.set(key, promise);
  return promise;
}
const $ = id => document.getElementById(id);
const format = value => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(3)}`;
const profileMode = c => c.scoring === 'poker' ? 'paytable' : c.settlement;
const profileValue = (p, c) => c.doubling ? p.doubleEV : p.singleEV;
const sign = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
let activeVersion = 0, previewVersion = 0, activeKey;
export async function showActiveRulesEV(config) {
  const key = `${rulesEVKey(config)}:${profileMode(config)}:${config.doubling}`;
  if (key === activeKey) return;
  activeKey = key;
  const version = ++activeVersion;
  $('game-ev').textContent = 'Rules EV: calculating…';
  $('game-ev').dataset.state = 'loading';
  try {
    const result = await calculate(config);
    if (version !== activeVersion) return;
    const value = profileValue(result.profiles.find(p => p.mode === profileMode(config)), config);
    $('game-ev').textContent = `Rules EV ${format(value)} / hand · optimal play`;
    $('game-ev').dataset.state = 'ready';
  } catch {
    if (version !== activeVersion) return;
    $('game-ev').textContent = 'Rules EV unavailable. Reopen settings to retry.';
    $('game-ev').dataset.state = 'error'; activeKey = null;
  }
}
export function clearRulesPreview(message = 'Calculating…') {
  previewVersion++;
  $('rules-ev-value').textContent = message;
  $('rules-ev-value').dataset.sign = 'zero';
  $('rules-ev-value').removeAttribute('title');
  $('rules-ev-preview').dataset.state = 'loading';
  $('rules-comparison-body').innerHTML = '';
  $('rules-one-roll').textContent = '';
}
export async function showRulesPreview(config) {
  clearRulesPreview();
  const version = previewVersion;
  try {
    const result = await calculate(config);
    if (version !== previewVersion) return;
    const selected = result.profiles.find(p => p.mode === profileMode(config)), value = profileValue(selected, config);
    $('rules-ev-value').textContent = format(value);
    $('rules-ev-value').dataset.sign = sign(value);
    $('rules-ev-value').title = `${config.doubling ? selected.doubleNumerator : selected.singleNumerator} / ${selected.denominator} net units per hand`;
    $('rules-ev-preview').dataset.state = 'ready';
    $('rules-comparison-body').innerHTML = result.profiles.map(p => `<tr><th scope="row">${{ capped: 'Capped loss', net: 'Points − fee', paytable: 'Category paytable' }[p.mode]}</th>${['singleEV', 'doubleEV'].map((field, i) => {
      const current = p.mode === profileMode(config) && config.doubling === !!i;
      return `<td data-mode="${p.mode}" data-double="${!!i}" ${current ? 'aria-current="true"' : ''}>${format(p[field])}${current ? '<small>Selected</small>' : ''}</td>`;
    }).join('')}</tr>`).join('');
    $('rules-one-roll').textContent = `Keep the opening roll: ${format(selected.oneRollEV)} units / hand. The values above include optimal holds and one optional reroll; doubling is chosen after seeing the opening dice.`;
  } catch {
    if (version !== previewVersion) return;
    clearRulesPreview('Unavailable');
    $('rules-ev-preview').dataset.state = 'error';
    $('rules-one-roll').textContent = 'EV could not load. Change a setting or reopen this dialog to retry.';
  }
}
