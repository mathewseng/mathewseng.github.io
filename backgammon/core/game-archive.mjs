// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, transition } from './rules.mjs';

// The live table owns one game. Score, Crawford state and indexed dice carry
// forward, while completed events/variations live in independent disk records.
export function nextGameTable(table, archiveId = crypto.randomUUID()) {
  if (table.events.at(-1)?.action.type !== 'next') throw Error('Expected a new game boundary.');
  return {
    ...table, historyVersion: 2, archiveId,
    previousGameId: table.archiveId || table.id,
    initial: clone(table.state), events: [], undoLog: [],
  };
}

function* splitLine(initial, events) {
  let start = initial, state = initial, moves = [];
  for (const event of events) {
    const next = transition(state, event.action, event.actor);
    if (event.action.type === 'next') {
      yield {initial:start, state, events:moves};
      start = next; moves = [];
    } else moves.push(event);
    state = next;
  }
  yield {initial:start, state, events:moves};
}

// Migrate legacy all-in-one sessions without losing grades or variations.
// Work and all split records must be committed atomically by the caller.
export function splitGameHistory(table, uuid = () => crypto.randomUUID()) {
  if (table.historyVersion === 2 && !table.events.some(e => e.action.type === 'next')) return {current:table, games:[]};
  const lines = [...splitLine(table.initial, table.events)];
  const games = lines.map((line, i) => ({
    ...table, ...line, historyVersion:2,
    archiveId: i ? uuid() : table.archiveId || table.id,
    undoLog:[],
  }));
  for (let i = 1; i < games.length; i++) games[i].previousGameId = games[i - 1].archiveId;
  // A single-game save needs no branch rewriting at all.
  if (games.length === 1) games[0].undoLog = table.undoLog || [];
  else for (const entry of table.undoLog || []) {
    const initial = entry.prefix ? table.initial : entry.initial;
    const events = entry.prefix ? [...entry.prefix, ...entry.events] : entry.events;
    for (const line of splitLine(initial, events)) {
      const root = JSON.stringify(line.initial);
      let game = games.find(g => JSON.stringify(g.initial) === root);
      if (!game) {
        game = {...table, ...line, historyVersion:2, archiveId:uuid(), undoLog:[], archivedVariation:true};
        games.push(game);
      } else if (JSON.stringify(game.events) !== JSON.stringify(line.events)) {
        game.undoLog.push({...entry, initial:line.initial, prefix:[], events:line.events});
      }
    }
  }
  const current = games[lines.length - 1];
  // Only the live game keeps an unfinished decision and live undo request.
  for (const game of games) if (game !== current) {
    delete game.initialDecision;
    game.replayDice = []; game.undoRequest = null; game.undoReply = null;
  }
  return {current, games};
}

export function archivedTable(item, config) {
  return {
    ...item.tableContext, id:item.sessionId || item.id, archiveId:item.id,
    previousGameId:item.previousGameId, historyVersion:2, started:true,
    initial:clone(item.initial), events:clone(item.events), undoLog:clone(item.undoLog || []),
    state:clone(item.state), names:[...item.names],
    config:clone(item.tableContext?.config || config),
  };
}
