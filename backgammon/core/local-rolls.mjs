// SPDX-License-Identifier: GPL-3.0-or-later
// Private local-table dice. Never put this seed in a network snapshot or engine
// request. GNUbg still evaluates unknown future rolls normally; only the job
// scheduler knows which exact future positions are useful to cache.
import { playAction, tableDice } from './table.mjs';
import { cryptoDice, decisionPlayer } from './rules.mjs';

export function ensureLocalRolls(table) {
  if (table.config?.mode === 'online') throw new Error('Online dice cannot be predetermined.');
  if (!table.localRolls && table.config?.mode === 'computer') {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    table.localRolls = { version: 1, seed: Array.from(bytes, n => n.toString(16).padStart(2, '0')).join(''), cursor: 0 };
  }
  if (table.localRolls) validateLocalRolls(table.localRolls);
  return table.localRolls;
}
export function validateLocalRolls(plan) {
  if (plan?.version !== 1 || !/^[a-f0-9]{64}$/.test(plan.seed) ||
      !Number.isSafeInteger(plan.cursor) || plan.cursor < 0 || plan.cursor > 1e9)
    throw new Error('Invalid saved local dice sequence. Your recorded game has not been changed.');
}

const keys = new Map(), rolls = new Map();
const bounded = (map, key, value, limit) => {
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
  return value;
};
// HMAC-SHA-256 is provided by Web Crypto, with independent indexed messages.
// Rejection sampling removes modulo bias. Peeking never advances the cursor.
export async function seededLocalRoll(plan, offset = 0) {
  validateLocalRolls(plan);
  if (!Number.isSafeInteger(offset) || offset < 0 || plan.cursor + offset > 1e9)
    throw new Error('Invalid local dice offset.');
  const index = plan.cursor + offset, cacheKey = `${plan.seed}:${index}`;
  if (!rolls.has(cacheKey)) {
    const work = (async () => {
      const key = keys.get(plan.seed) || bounded(keys, plan.seed, crypto.subtle.importKey(
        'raw', Uint8Array.from(plan.seed.match(/../g), n => parseInt(n, 16)),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), 4);
      const dice = [];
      for (let block = 0; dice.length < 2; block++) {
        const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await key,
          new TextEncoder().encode(`backgammon-local-roll-v1:${index}:${block}`)));
        for (const byte of bytes) {
          if (byte < 252) dice.push(byte % 6 + 1);
          if (dice.length === 2) break;
        }
      }
      return dice;
    })();
    bounded(rolls, cacheKey, work, 128);
    work.catch(() => rolls.delete(cacheKey));
  }
  return [...await rolls.get(cacheKey)];
}
export async function futureLocalRoll(table, offset = 0, actor = null) {
  if (table.config?.mode !== 'computer' || !table.localRolls) return null;
  const queued = table.replayDice || [];
  if (offset < queued.length) {
    if (actor !== null && queued[offset].actor !== actor) return null;
    return [...queued[offset].dice];
  }
  return seededLocalRoll(table.localRolls, offset - queued.length);
}
// Advance only after a successful transition, in the same saved snapshot as
// its committed dice. Takebacks replay their recorded dice before consuming
// another indexed roll. Presentation, settings and speculation consume none.
export async function localPlayAction(source, action) {
  ensureLocalRolls(source);
  const actor = decisionPlayer(source.state);
  const rolling = ['opening', 'roll'].includes(action.type);
  const replaying = action.type === 'roll' && source.replayDice?.length;
  const draw = rolling && !replaying && source.localRolls;
  const dice = draw ? await seededLocalRoll(source.localRolls)
    : rolling ? action.type === 'roll' ? tableDice(source, actor, cryptoDice) : cryptoDice() : null;
  const next = playAction(source, rolling ? { ...action, dice } : action, actor);
  if (draw) next.localRolls.cursor++;
  return next;
}
