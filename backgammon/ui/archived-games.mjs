// SPDX-License-Identifier: GPL-3.0-or-later
import { get, put, listItemSummaries } from '../core/storage.mjs';
import { decisionHistory, groupDecisionTurns } from '../core/decision-history.mjs';
import { releaseHistoryStates } from '../core/history-states.mjs';
import { gameLossSummary } from '../core/game-loss-summary.mjs';
import { gameLossTable } from './game-loss-summary.mjs';
import { historyTurn } from './history-turn.mjs';
import { decisionReview } from './decision-review.mjs';
import { el, button } from './shell.mjs';

// Keep eight small summaries and at most one game's decisions in memory.
// Expanding is an explicit disk read; collapse/page/session changes release it.
export function archivedGames({onReturn} = {}) {
  const node = el('section', {class:'archived-games', 'aria-label':'Previous games', hidden:true});
  const list = el('div', {class:'archived-game-list'});
  const status = el('p', {class:'muted small', role:'status'});
  const newer = button('Newer games', () => { cursors.pop(); load(); }, 'ghost');
  const older = button('Older games', () => { cursors.push(next); load(); }, 'ghost');
  const pages = el('nav', {class:'row spread', 'aria-label':'Previous game pages'}, newer, older);
  node.append(list, status, pages);
  let context, key, generation = 0, request = 0, active, entries = [], headers = [];
  let cursors = [undefined], next, observed = false;
  const observer = new IntersectionObserver(records => {
    if (records.some(record => record.isIntersecting)) {
      observed = true; observer.disconnect(); load();
    }
  }, {rootMargin:'200px'});

  function release() {
    request++;
    if (!active) return;
    const previous = active;
    active = null;
    previous.entry.details.open = false;
    previous.entry.body.replaceChildren();
    previous.entry.details.removeAttribute('aria-busy');
    if (previous.item) releaseHistoryStates(previous.item);
  }
  function summary(entry) {
    const item = entry.header, visible = context.mode === 'computer' ? [context.viewer] : [0, 1];
    const labels = item.names || context.names;
    if (item.lossSummary) {
      entry.summary.replaceChildren(gameLossTable([], {}, labels, visible, {summary:item.lossSummary}));
    } else {
      // Legacy index records have totals but not the initial/accepted split.
      // Fill that split after the first expansion, without eagerly reading games.
      entry.summary.replaceChildren(...visible.map(player => {
        const total = item.decisionSummary?.[player];
        return el('p', {class:'history-archive-total'},
          el('strong', {}, context.mode === 'computer' ? 'You' : labels[player]),
          el('span', {}, total?.evaluated ? `${total.loss.toFixed(3)} EV lost` : 'Not analyzed'));
      }));
    }
  }
  function returnAction(id, sessionId, index, source, player) {
    return () => onReturn({id, sessionId}, {index, source, player});
  }
  function review(id, index) {
    if (active?.item?.id !== id) return;
    const {item, rows} = active, row = rows.find(row => row.index === index);
    if (!row) return;
    const modal = decisionReview(row.source, {
      title: row.action.type === 'move' ? 'Checker decision' : 'Cube decision',
      opponent: row.player !== context.viewer,
      beforeRoll: rows.find(r => r.turn === row.turn && r.player === row.player &&
        r.result?.type === 'cube' && r.source.phase === 'roll' &&
        r.source.cube.value === row.source.cube.value)?.result,
      onReturn: context.mode !== 'online' && onReturn
        ? returnAction(item.id, item.sessionId || item.id, row.index, row.source, row.player) : undefined,
    });
    if (row.result) modal.result(row.result);
    else modal.preview(row.action.steps || [], row.label);
  }
  // Browsers can retain detached layout/accessibility nodes briefly. Their
  // click handlers carry only identifiers, never the hydrated game or rows.
  function actions(id, index) {
    const open = () => review(id, index);
    return {review:open, preview:open};
  }
  function drawMoves() {
    if (!active?.rows) return;
    const {entry, item, rows} = active;
    const groups = groupDecisionTurns(rows.filter(row => context.filter === 'all' ||
      (row.player === context.viewer ? 'self' : 'opponent') === context.filter));
    entry.body.replaceChildren(...groups.map(group => historyTurn(group, {
      names:item.names || context.names, viewer:context.viewer, local:context.mode === 'local',
      actions:row => actions(item.id, row.index),
    })));
    if (!groups.length) entry.body.append(el('p', {class:'muted'}, 'No decisions from this player in this game.'));
  }
  async function expand(entry) {
    release();
    entry.details.open = true;
    const token = ++request, page = generation;
    active = {entry};
    entry.details.setAttribute('aria-busy', 'true');
    entry.body.replaceChildren(el('p', {role:'status', class:'muted'}, 'Loading moves…'));
    try {
      const item = await get('items', entry.header.id);
      if (token !== request || page !== generation || !entry.details.open) return;
      if (!item) throw Error('This saved game is no longer available.');
      const rows = decisionHistory(item);
      active = {entry, item, rows};
      entry.header.lossSummary = gameLossSummary(rows, entry.header.gameNumber,
        item.state?.matchLength ?? item.initial.matchLength);
      summary(entry); drawMoves();
      // Cache only the small derived totals for older saves, leaving the
      // actual game, grades, variations and annotations untouched.
      if (!item.lossSummary) void put('summaries', entry.header).catch(() => {});
    } catch (error) {
      if (token !== request || page !== generation) return;
      entry.body.replaceChildren(el('p', {role:'alert'}, error.message), button('Retry loading moves', () => expand(entry)));
    } finally {
      if (token === request) entry.details.removeAttribute('aria-busy');
    }
  }
  function drawHeaders() {
    entries = headers.map(header => {
      const summaryNode = el('div', {class:'history-game-detail'});
      const body = el('div', {class:'archived-game-moves'});
      const details = el('details', {class:'history-moves-disclosure'},
        el('summary', {}, el('span', {}, 'Moves'), el('span', {class:'muted small'}, `${header.eventCount} actions`),
          el('span', {class:'history-game-chevron', 'aria-hidden':true})), body);
      const entry = {header, summary:summaryNode, body, details};
      details.addEventListener('toggle', () => {
        if (details.open && active?.entry !== entry) expand(entry);
        else if (!details.open && active?.entry === entry) release();
      });
      summary(entry);
      entry.node = el('section', {class:'history-game-card archived-game', 'data-archive-id':header.id, 'data-game':header.gameNumber},
        el('h3', {class:'history-game-heading'}, `Game ${header.gameNumber}${header.archivedVariation ? ' · variation' : ''}`,
          el('span', {class:'muted small'}, header.scores?.join('–') || '')),
        summaryNode, details);
      return entry;
    });
    list.replaceChildren(...entries.map(entry => entry.node));
  }
  async function load() {
    if (!context?.sessionId || !observed) return;
    release();
    const token = ++generation;
    list.replaceChildren(); entries = []; headers = [];
    status.replaceChildren('Loading previous games…');
    newer.disabled = older.disabled = true;
    try {
      const page = await listItemSummaries({sessionId:context.sessionId, excludeId:context.currentId,
        kind:'match', cursor:cursors.at(-1), limit:8});
      if (token !== generation) return;
      headers = page.items; next = page.cursor;
      drawHeaders(); status.replaceChildren();
      pages.hidden = cursors.length === 1 && !next;
      newer.disabled = cursors.length === 1; older.disabled = !next;
      node.hidden = !headers.length && cursors.length === 1;
    } catch (error) {
      if (token !== generation) return;
      status.replaceChildren(error.message, button('Retry previous games', load, 'ghost'));
      newer.disabled = cursors.length === 1;
    }
  }
  return {node, update(nextContext) {
    const nextKey = JSON.stringify([nextContext?.sessionId, nextContext?.currentId]);
    const changed = JSON.stringify(context) !== JSON.stringify(nextContext);
    context = nextContext;
    if (key !== nextKey) {
      key = nextKey; generation++; release(); cursors = [undefined]; next = null;
      list.replaceChildren(); headers = []; entries = []; status.replaceChildren(); pages.hidden = true;
      node.hidden = !context?.sessionId;
      if (observed) load();
      else if (context?.sessionId) observer.observe(node);
    } else if (changed) {
      entries.forEach(summary); drawMoves();
    }
  }};
}
