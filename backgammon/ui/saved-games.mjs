// SPDX-License-Identifier: GPL-3.0-or-later
import { get, put, listItemSummaries } from '../core/storage.mjs';
import { sameDecisionPrefix } from '../core/decision-history.mjs';
import { el, button, dialog } from './shell.mjs';
import { sessionReview } from './session-review.mjs';
import { historyExplorer } from './history-tree.mjs';

// The list holds at most eight small headers; only the opened review holds a
// game's checker decisions. Closing that review releases its board and engine.
export function savedGames(sessionId, {onReturn} = {}) {
  const list = el('div', {class:'stack', 'aria-label':'Saved games'});
  const status = el('p', {role:'status', class:'muted small'});
  let cursor = null, next = null, generation = 0, closed = false;
  const latest = button('Latest games', () => {cursor = null; load();});
  const older = button('Older games', () => {cursor = next; load();}, '', {id:'older-games'});
  const d = dialog('Saved games', el('div', {class:'stack'}, status, list,
    el('div', {class:'row spread'}, latest, older)));
  d.addEventListener('close', () => {closed = true; generation++; list.replaceChildren();}, {once:true});
  async function open(id, tree) {
    const token = generation;
    status.textContent = 'Loading game…';
    try {
      const item = await get('items', id);
      if (closed || token !== generation) return;
      if (!item) throw Error('This saved game is no longer available.');
      status.textContent = '';
      if (tree) historyExplorer(item, {onReturn:onReturn ? async path => {await onReturn(item,path); d.close();} : undefined});
      else sessionReview(item, {
        onHistoryReturn:onReturn ? async path => {await onReturn(item,path); d.close();} : undefined,
        onSave:async (snapshot,index) => {
          const current = await get('items',id);
          if (!current || !sameDecisionPrefix(current,snapshot,index)) throw Error('This game changed. Reopen its review.');
          current.events[index].evaluation = snapshot.events[index].evaluation;
          await put('items',{...current,updatedAt:Date.now()});
        },
      });
    } catch (error) { if (!closed) status.textContent = error.message; }
  }
  async function load() {
    const token = ++generation;
    list.replaceChildren(); latest.disabled = older.disabled = true;
    status.textContent = 'Loading saved games…';
    try {
      const page = await listItemSummaries({sessionId,cursor,limit:8});
      if (closed || token !== generation) return;
      next = page.cursor;
      status.textContent = page.items.length ? '' : 'No saved games yet.';
      list.replaceChildren(...page.items.map(item => el('div', {class:'row spread wrap saved-game', 'data-saved-game':item.id},
        el('div', {}, el('strong', {}, `Game ${item.gameNumber}${item.archivedVariation ? ' · variation' : ''}`),
          el('p', {class:'muted small'}, [item.scores?.join('–'),item.status?.replaceAll('-',' '),
            `${item.eventCount} actions`].filter(Boolean).join(' · '))),
        el('div', {class:'row'}, button('Review', () => open(item.id,false)),
          button('History tree', () => open(item.id,true),'ghost')))));
      latest.disabled = !cursor; older.disabled = !next;
    } catch (error) {if (!closed) {status.textContent=error.message; latest.disabled=false;}}
  }
  load();
  return d;
}
