// The dice table: one shell for every multiplayer dice game in /dice/.
// A game supplies a pure rules engine (see dice/README.md, "Table games") and
// a render function for its board. The table owns everything else: seats,
// bots, pass-and-play privacy, online rooms, the log, rematches and saving.
import { bindDiceStyle, diceStyle, DICE_STYLE_EVENT } from './display.js';
import { paintDie } from './reports/dice-view.js';
import { cryptoRng, clone, BOT_NAMES, LEVELS } from './table-core.mjs';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const SEAT_COLORS = [1, 2, 3, 5, 6, 4];
const YAWS = [-0.3, 0.24, -0.12, 0.4, -0.2, 0.16];
const PEERJS = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
const PEER_ROOM = new URL('../shared/peer-room.js?v=20261016', import.meta.url).href;
const ICONS = new URL('../shared/icons.svg', import.meta.url).href;

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const seatColor = (seat) => `var(--cat-${SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length]})`;
export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="${ICONS}#i-${name}"/></svg>`;

// One die. In 3D the canvas is painted after render; `rolling` tumbles it in.
export function dieHTML(face, { held = false, rolling = false, hidden = false, small = false, mark = false } = {}) {
  const cls = ['tdie'];
  if (held) cls.push('tdie--held');
  if (rolling) cls.push('rolling');
  if (hidden) cls.push('tdie--hidden');
  if (small) cls.push('tdie--sm');
  if (mark) cls.push('tdie--mark');
  if (diceStyle() === '3d') return `<span class="${cls.join(' ')} tdie--3d" aria-hidden="true"><canvas data-face="${hidden ? 1 : face}"${hidden ? ' data-blank' : ''}></canvas></span>`;
  if (hidden) return `<span class="${cls.join(' ')}" aria-hidden="true"><span class="tdie-cup">?</span></span>`;
  const pips = PIPS[face] || [];
  return `<span class="${cls.join(' ')}" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<span class="pip${pips.includes(i) ? '' : ' off'}"></span>`).join('')}</span>`;
}

// A row of dice. With `select`, each die is a toggle button carrying data-die.
export function diceHTML(faces, options = {}) {
  const { select = false, held = () => false, rolling = false, hidden = false, small = false, mark = () => false, label = null, aria = null, disabled = false, key = 'die', className = '' } = options;
  const isRolling = (i) => (typeof rolling === 'function' ? rolling(i) : rolling);
  const items = faces.map((face, i) => {
    const die = dieHTML(face, { held: held(i), rolling: isRolling(i), hidden, small, mark: mark(i) });
    const text = label ? label(i) : '';
    const name = aria ? aria(i) : hidden ? 'Hidden die' : `Die showing ${face}`;
    if (!select) return `<span class="tdie-slot" role="img" aria-label="${esc(name)}">${die}${text ? `<span class="tdie-label" aria-hidden="true">${esc(text)}</span>` : ''}</span>`;
    return `<button type="button" class="tdie-slot tdie-btn" data-die="${i}" data-key="${esc(key)}-${i}" aria-pressed="${held(i)}" aria-label="${esc(name)}"${disabled ? ' disabled' : ''}>${die}<span class="tdie-label" aria-hidden="true">${esc(text)}</span></button>`;
  });
  return `<div class="tdice${small ? ' tdice--sm' : ''}${className ? ` ${className}` : ''}">${items.join('')}</div>`;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function paintDice(root) {
  root.querySelectorAll('canvas[data-face]').forEach((canvas, i) => {
    const face = Number(canvas.dataset.face);
    const waiting = canvas.hasAttribute('data-blank');
    const yaw = YAWS[i % YAWS.length];
    if (!canvas.closest('.rolling') || reducedMotion()) {
      paintDie(canvas, face, { yaw, waiting });
      return;
    }
    const start = performance.now();
    const frame = (now) => {
      if (!canvas.isConnected) return;
      const p = Math.min(1, (now - start) / 560);
      paintDie(canvas, face, { yaw, waiting, progress: 1 - (1 - p) ** 3 });
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

const storage = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Play continues without saving. */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* Nothing saved. */ }
  },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The online play library did not load. Check your connection.'));
    document.head.append(script);
  });
}

const cleanName = (value, fallback) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18) || fallback;

export function mountTable(game, ui = {}) {
  const main = document.getElementById('main');
  const keys = { setup: `dice.${game.id}.setup.v1`, match: `dice.${game.id}.match.v1`, host: `dice.${game.id}.host.v1`, name: 'dice.player-name' };
  const optionDefaults = Object.fromEntries((game.options || []).map((option) => [option.id, option.default]));

  let setup = loadSetup();
  let place = 'local'; // 'local' | 'online'
  let screen = 'setup';
  let match = null; // the match being shown: full state locally or as host, a view as a guest
  let lobby = null;
  let room = null;
  let roster = [];
  let joinMode = 'create';
  let connecting = false;
  let netState = 'offline';
  let revealed = -1;
  let lastHuman = -1;
  let lastRollKey = null;
  let botTimer = null;
  let pendingSince = 0;
  let toastTimer = null;

  const savedMatch = () => { const value = storage.get(keys.match); return value?.game === game.id && value.state ? value : null; };
  const invite = location.hash.replace('#', '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  if (invite.length === 6) { place = 'online'; joinMode = 'join'; }

  main.classList.add('dt');
  main.innerHTML = `
    <section class="dt-setup" id="dt-setup" aria-labelledby="dt-setup-title"></section>
    <section class="dt-table" id="dt-table" aria-labelledby="dt-table-title" hidden>
      <div class="dt-head">
        <h1 id="dt-table-title">${esc(game.name)}</h1>
        <div class="dt-head-actions" id="dt-head-actions"></div>
      </div>
      <div class="dt-layout">
        <section class="dt-stage" aria-label="Table">
          <div class="dt-status" id="dt-status" role="status" aria-live="polite"></div>
          <div class="dt-board" id="dt-board"></div>
          <div class="dt-curtain" id="dt-curtain" hidden></div>
        </section>
        <aside class="dt-side" aria-label="Players and log">
          <section class="dt-panel dt-players" aria-labelledby="dt-players-title">
            <h2 id="dt-players-title">Players</h2>
            <ol id="dt-players"></ol>
          </section>
          <section class="dt-panel dt-log" aria-labelledby="dt-log-title">
            <h2 id="dt-log-title">Log</h2>
            <ol id="dt-log" tabindex="0" aria-label="Game log"></ol>
          </section>
        </aside>
      </div>
    </section>
    <div class="toast-stack" id="dt-toasts" role="status" aria-live="polite"></div>`;

  const $ = (id) => document.getElementById(id);
  const board = $('dt-board');

  // ---------- Topbar: dice style, rules, network ----------
  const styleHost = document.getElementById('dice-style');
  if (styleHost) bindDiceStyle(styleHost, { fallback: '3d', onChange: () => { if (screen === 'table') renderTable(); } });
  window.addEventListener(DICE_STYLE_EVENT, () => { if (!styleHost && screen === 'table') renderTable(); });
  const rulesDialog = document.getElementById('rules-dialog');
  document.getElementById('rules-button')?.addEventListener('click', () => rulesDialog?.showModal());
  rulesDialog?.addEventListener('click', (event) => {
    if (event.target === rulesDialog || event.target.closest('[data-close]')) rulesDialog.close();
  });

  // ---------- Setup ----------
  function loadSetup() {
    const name = storage.get(keys.name, 'You');
    const stored = storage.get(keys.setup);
    const options = { ...optionDefaults, ...(stored?.options || {}) };
    for (const option of game.options || []) {
      if (!option.choices.some((choice) => choice.value === options[option.id])) options[option.id] = option.default;
    }
    let seats = Array.isArray(stored?.seats) ? stored.seats.filter((seat) => seat && seat.name) : [];
    if (seats.length < game.players.min || seats.length > game.players.max) {
      seats = [{ name, kind: 'human' }];
      for (let i = 1; i < game.players.default; i += 1) seats.push({ name: BOT_NAMES[i - 1], kind: 'bot', level: 'normal' });
    }
    return { seats, options, bots: Array.isArray(stored?.bots) ? stored.bots : [{ level: 'normal' }].slice(0, Math.max(0, game.players.default - 2)) };
  }

  function saveSetup() {
    storage.set(keys.setup, setup);
  }

  function freeBotName(taken) {
    return BOT_NAMES.find((name) => !taken.includes(name)) || `Bot ${taken.length + 1}`;
  }

  function optionsHTML(editable) {
    const options = place === 'online' && lobby ? lobby.options : setup.options;
    if (!(game.options || []).length) return '<p class="dt-muted">No options for this game.</p>';
    return game.options.map((option) => `
      <fieldset class="dt-option"${editable ? '' : ' disabled'}>
        <legend class="field-label">${esc(option.label)}</legend>
        <div class="segmented segmented--block" role="radiogroup" aria-label="${esc(option.label)}">
          ${option.choices.map((choice) => `<label><input type="radio" name="opt-${esc(option.id)}" data-option="${esc(option.id)}" value='${esc(JSON.stringify(choice.value))}'${options[option.id] === choice.value ? ' checked' : ''} /><span>${esc(choice.label)}</span></label>`).join('')}
        </div>
        ${option.hint ? `<p class="field-hint">${esc(typeof option.hint === 'function' ? option.hint(options[option.id]) : option.hint)}</p>` : ''}
      </fieldset>`).join('');
  }

  function localSeatsHTML() {
    const { min, max } = game.players;
    return `
      <ol class="dt-seats">
        ${setup.seats.map((seat, i) => `
          <li class="dt-seat" style="--seat-color: ${seatColor(i)}">
            <span class="dt-dot" aria-hidden="true"></span>
            <div class="field dt-seat-name"><label class="visually-hidden" for="seat-name-${i}">Seat ${i + 1} name</label><input id="seat-name-${i}" data-seat-name="${i}" data-key="seat-name-${i}" maxlength="18" autocomplete="off" value="${esc(seat.name)}" /></div>
            <div class="field dt-seat-kind"><label class="visually-hidden" for="seat-kind-${i}">Seat ${i + 1} plays as</label>
              <select id="seat-kind-${i}" data-seat-kind="${i}" data-key="seat-kind-${i}">
                <option value="human"${seat.kind === 'human' ? ' selected' : ''}>Person</option>
                ${LEVELS.map((level) => `<option value="bot:${level.value}"${seat.kind === 'bot' && seat.level === level.value ? ' selected' : ''}>Bot · ${level.label}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="btn btn--ghost btn--icon" data-remove-seat="${i}" data-key="remove-${i}" aria-label="Remove ${esc(seat.name)}"${setup.seats.length <= min ? ' disabled' : ''}>${icon('close')}</button>
          </li>`).join('')}
      </ol>
      <div class="dt-seat-actions">
        <button type="button" class="btn btn--ghost" data-add-seat="bot" data-key="add-bot"${setup.seats.length >= max ? ' disabled' : ''}>${icon('plus')}Add bot</button>
        <button type="button" class="btn btn--ghost" data-add-seat="human" data-key="add-human"${setup.seats.length >= max ? ' disabled' : ''}>${icon('plus')}Add person</button>
      </div>
      <p class="field-hint">${min === max ? `${min} players.` : `${min}–${max} players.`} People share this device and take turns${game.hidden ? '; the table hides each hand until its owner taps to see it' : ''}.</p>`;
  }

  function onlineHTML() {
    const session = room?.connected ? null : savedRoom();
    if (!room?.connected) {
      const name = storage.get(keys.name, 'You');
      return `
        <div class="dt-online-form">
          <div class="segmented segmented--block" role="group" aria-label="Create or join">
            <button type="button" data-join-mode="create" aria-pressed="${joinMode === 'create'}">Create room</button>
            <button type="button" data-join-mode="join" aria-pressed="${joinMode === 'join'}">Join room</button>
          </div>
          <div class="field"><label for="online-name">Your name</label><input id="online-name" data-key="online-name" maxlength="18" autocomplete="nickname" value="${esc(name)}" /></div>
          ${joinMode === 'join' ? `<div class="field"><label for="room-code">Room code</label><input id="room-code" data-key="room-code" class="dt-code-input" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code or invite link" value="${esc(invite)}" /></div>` : ''}
          <div class="dt-online-actions">
            <button type="button" class="btn btn--primary" id="online-connect" data-key="online-connect"${connecting ? ' disabled' : ''}>${connecting ? 'Connecting…' : joinMode === 'create' ? 'Create room' : 'Join room'}</button>
            ${session && !connecting ? `<button type="button" class="btn btn--ghost" id="online-resume" data-key="online-resume">Rejoin ${esc(session.roomCode)}</button>` : ''}
          </div>
          <p class="field-hint">${joinMode === 'create' ? 'You host the game. Friends join with the code, and you can fill empty seats with bots.' : 'Ask the host for the six-letter code or invite link.'}</p>
        </div>`;
    }
    const isHost = room.isHost;
    const bots = lobby?.bots || [];
    const total = roster.length + bots.length;
    return `
      <div class="dt-room">
        <div class="dt-room-code"><span>Room code</span><strong>${esc(room.roomCode)}</strong>
          <button type="button" class="btn btn--ghost" id="copy-invite" data-key="copy-invite">${icon('copy')}Copy invite link</button></div>
        <ol class="dt-seats">
          ${roster.map((player, i) => `<li class="dt-seat dt-seat--static" style="--seat-color: ${seatColor(i)}"><span class="dt-dot" aria-hidden="true"></span><span class="dt-seat-text">${esc(player.name)}${player.id === room.clientId ? ' <span class="dt-muted">(you)</span>' : ''}</span><span class="dt-muted">${player.host ? 'Host' : player.connected === false ? 'Reconnecting' : 'Joined'}</span></li>`).join('')}
          ${bots.map((bot, i) => `<li class="dt-seat${isHost ? '' : ' dt-seat--static'}" style="--seat-color: ${seatColor(roster.length + i)}"><span class="dt-dot" aria-hidden="true"></span><span class="dt-seat-text">${esc(bot.name)}</span>
            ${isHost ? `<div class="field dt-seat-kind"><label class="visually-hidden" for="bot-level-${i}">${esc(bot.name)} level</label><select id="bot-level-${i}" data-bot-level="${i}" data-key="bot-level-${i}">${LEVELS.map((level) => `<option value="${level.value}"${bot.level === level.value ? ' selected' : ''}>Bot · ${level.label}</option>`).join('')}</select></div>
            <button type="button" class="btn btn--ghost btn--icon" data-remove-bot="${i}" data-key="remove-bot-${i}" aria-label="Remove ${esc(bot.name)}">${icon('close')}</button>` : `<span class="dt-muted">Bot · ${esc(levelLabel(bot.level))}</span>`}</li>`).join('')}
        </ol>
        ${isHost ? `<div class="dt-seat-actions"><button type="button" class="btn btn--ghost" id="add-online-bot" data-key="add-online-bot"${total >= game.players.max ? ' disabled' : ''}>${icon('plus')}Add bot</button></div>` : ''}
        <p class="field-hint">${isHost ? (total < game.players.min ? `Waiting for ${game.players.min - total} more ${game.players.min - total === 1 ? 'player' : 'players'}, or add a bot.` : `${total} of up to ${game.players.max} seats filled.`) : `Waiting for ${esc(roster.find((player) => player.host)?.name || 'the host')} to start.`}</p>
      </div>`;
  }

  function levelLabel(level) {
    return LEVELS.find((entry) => entry.value === level)?.label || 'Normal';
  }

  function savedRoom() {
    const value = storage.get(`${keys.host}.room`);
    if (!value || Date.now() - Number(value.savedAt) > 12 * 60 * 60 * 1000) return null;
    return value;
  }

  function renderSetup() {
    const stored = savedMatch();
    const resume = stored && !game.outcome(stored.state) && !room?.connected ? stored : null;
    const inRoom = place === 'online' && room?.connected;
    const editableOptions = place === 'local' || (inRoom && room.isHost);
    const canStart = place === 'local' ? true : inRoom && room.isHost && roster.length + (lobby?.bots.length || 0) >= game.players.min;
    const focusKey = document.activeElement?.dataset?.key;
    $('dt-setup').innerHTML = `
      <div class="dt-head"><h1 id="dt-setup-title">${esc(game.name)}</h1></div>
      <div class="dt-setup-grid">
        <section class="panel" aria-labelledby="dt-seats-title">
          <div class="panel-head">
            <h2 id="dt-seats-title">Players</h2>
            <div class="segmented" role="group" aria-label="Where to play">
              <button type="button" data-place="local" data-key="place-local" aria-pressed="${place === 'local'}"${inRoom ? ' disabled' : ''}>This device</button>
              <button type="button" data-place="online" data-key="place-online" aria-pressed="${place === 'online'}">Online</button>
            </div>
          </div>
          <div class="panel-body">${place === 'local' ? localSeatsHTML() : onlineHTML()}</div>
        </section>
        <section class="panel" aria-labelledby="dt-options-title">
          <div class="panel-head"><h2 id="dt-options-title">Rules</h2><button type="button" class="btn btn--ghost" data-open-rules data-key="open-rules">How to play</button></div>
          <div class="panel-body dt-options">${optionsHTML(editableOptions)}</div>
        </section>
      </div>
      <div class="dt-setup-actions">
        ${resume && place === 'local' ? `<button type="button" class="btn btn--lg" id="resume-game" data-key="resume-game">Resume saved game</button>` : ''}
        ${inRoom ? `<button type="button" class="btn btn--ghost btn--lg" id="leave-room" data-key="leave-room">Leave room</button>` : ''}
        ${place === 'local' || inRoom && room.isHost ? `<button type="button" class="btn btn--primary btn--lg" id="start-game" data-key="start-game"${canStart ? '' : ' disabled'}>Start game</button>` : ''}
      </div>`;
    if (focusKey) $('dt-setup').querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  $('dt-setup').addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target || target.disabled) return;
    if (target.dataset.place) {
      place = target.dataset.place;
      renderSetup();
    } else if (target.dataset.addSeat) {
      const taken = setup.seats.map((seat) => seat.name);
      setup.seats.push(target.dataset.addSeat === 'bot'
        ? { name: freeBotName(taken), kind: 'bot', level: 'normal' }
        : { name: `Player ${setup.seats.length + 1}`, kind: 'human' });
      saveSetup();
      renderSetup();
    } else if (target.dataset.removeSeat) {
      setup.seats.splice(Number(target.dataset.removeSeat), 1);
      saveSetup();
      renderSetup();
    } else if (target.dataset.joinMode) {
      joinMode = target.dataset.joinMode;
      renderSetup();
    } else if (target.id === 'online-connect') {
      connect();
    } else if (target.id === 'online-resume') {
      resumeRoom();
    } else if (target.id === 'copy-invite') {
      copyInvite();
    } else if (target.id === 'add-online-bot') {
      const taken = roster.map((player) => player.name).concat(lobby.bots.map((bot) => bot.name));
      lobby.bots.push({ name: freeBotName(taken), level: 'normal' });
      setup.bots = lobby.bots.map((bot) => ({ level: bot.level }));
      saveSetup();
      publish();
    } else if (target.dataset.removeBot) {
      lobby.bots.splice(Number(target.dataset.removeBot), 1);
      publish();
    } else if (target.id === 'start-game') {
      startGame();
    } else if (target.id === 'resume-game') {
      match = savedMatch();
      if (match) showTable();
    } else if (target.id === 'leave-room') {
      leaveRoom();
    } else if (target.hasAttribute('data-open-rules')) {
      rulesDialog?.showModal();
    }
  });

  $('dt-setup').addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.seatKind) {
      const i = Number(target.dataset.seatKind);
      const seat = setup.seats[i];
      const [kind, level] = target.value.split(':');
      const taken = setup.seats.filter((_, j) => j !== i).map((other) => other.name);
      if (kind === 'bot' && seat.kind !== 'bot') seat.name = freeBotName(taken);
      if (kind === 'human' && seat.kind === 'bot') seat.name = `Player ${i + 1}`;
      seat.kind = kind;
      if (level) seat.level = level; else delete seat.level;
      saveSetup();
      renderSetup();
    } else if (target.dataset.option) {
      const value = JSON.parse(target.value);
      if (place === 'online' && lobby && room?.isHost) {
        lobby.options[target.dataset.option] = value;
        publish();
      }
      setup.options[target.dataset.option] = value;
      saveSetup();
      if (game.options.some((option) => option.hint && typeof option.hint === 'function')) renderSetup();
    } else if (target.dataset.botLevel) {
      lobby.bots[Number(target.dataset.botLevel)].level = target.value;
      setup.bots = lobby.bots.map((bot) => ({ level: bot.level }));
      saveSetup();
      publish();
    } else if (target.dataset.seatName) {
      const i = Number(target.dataset.seatName);
      setup.seats[i].name = cleanName(target.value, `Player ${i + 1}`);
      target.value = setup.seats[i].name;
      if (i === setup.seats.findIndex((seat) => seat.kind === 'human')) storage.set(keys.name, setup.seats[i].name);
      saveSetup();
    } else if (target.id === 'online-name') {
      storage.set(keys.name, cleanName(target.value, 'You'));
    }
  });

  $('dt-setup').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.target.id === 'room-code' || event.target.id === 'online-name')) connect();
  });

  // ---------- Matches ----------
  function newMatch(seats, options, first = 0, wins = null) {
    const names = seats.map((seat) => seat.name);
    const state = game.setup({ names, options: clone(options), rng: cryptoRng, first });
    return { kind: 'match', id: Math.random().toString(36).slice(2, 10), game: game.id, v: 1, seats: clone(seats), options: clone(options), state, first, wins: wins || seats.map(() => 0), rev: 1, scored: false, online: place === 'online' };
  }

  function startGame() {
    if (place === 'local') {
      const names = new Set();
      setup.seats.forEach((seat, i) => {
        let name = cleanName(seat.name, `Player ${i + 1}`);
        while (names.has(name)) name = `${name.slice(0, 15)} ${i + 1}`;
        names.add(name);
        seat.name = name;
      });
      saveSetup();
      revealed = -1;
      match = newMatch(setup.seats, setup.options);
      saveMatch();
      showTable();
      return;
    }
    if (!room?.isHost || !lobby) return;
    const seats = roster.map((player) => ({ name: player.name, kind: 'human', client: player.id }))
      .concat(lobby.bots.map((bot) => ({ name: bot.name, kind: 'bot', level: bot.level })));
    if (seats.length < game.players.min || seats.length > game.players.max) return toast(`This game needs ${game.players.min}–${game.players.max} players.`);
    match = newMatch(seats, lobby.options);
    publish();
    showTable();
  }

  function rematch() {
    if (!match) return;
    if (match.online && !room?.isHost) return;
    const first = (match.first + 1) % match.seats.length;
    revealed = -1;
    match = newMatch(match.seats, match.options, first, match.wins);
    if (match.online) publish(); else saveMatch();
    renderTable();
    scheduleBot();
  }

  function backToSetup() {
    clearTimeout(botTimer);
    if (place === 'online' && room?.connected) {
      if (!room.isHost) return;
      lobby = { kind: 'lobby', options: clone(match?.options || setup.options), bots: (match?.seats || []).filter((seat) => seat.kind === 'bot').map((seat) => ({ name: seat.name, level: seat.level })) };
      match = null;
      publish();
    }
    screen = 'setup';
    $('dt-table').hidden = true;
    $('dt-setup').hidden = false;
    renderSetup();
    main.focus({ preventScroll: true });
  }

  function showTable() {
    screen = 'table';
    $('dt-setup').hidden = true;
    $('dt-table').hidden = false;
    lastRollKey = null;
    renderTable();
    scheduleBot();
  }

  function saveMatch() {
    if (!match || match.online) return;
    storage.set(keys.match, match);
  }

  const isOnline = () => Boolean(match?.online);
  const authority = () => !isOnline() || room?.isHost;
  const mySeat = () => (isOnline() ? match.seats.findIndex((seat) => seat.client === room?.clientId) : -1);

  function perspective() {
    const state = match.state;
    const actor = game.actor(state);
    if (isOnline()) return { seat: mySeat(), curtain: -1, actor };
    const humans = match.seats.map((seat, i) => (seat.kind === 'human' ? i : -1)).filter((i) => i >= 0);
    const humanActor = actor >= 0 && match.seats[actor].kind === 'human';
    if (humanActor) lastHuman = actor;
    if (!game.hidden) return { seat: humanActor ? actor : humans.includes(lastHuman) ? lastHuman : humans[0] ?? -1, curtain: -1, actor };
    if (humans.length <= 1) return { seat: humans[0] ?? -1, curtain: -1, actor };
    if (!humanActor) return { seat: -1, curtain: -1, actor };
    const privacy = game.needsPrivacy ? game.needsPrivacy(state, actor) : true;
    if (privacy && revealed !== actor) return { seat: -1, curtain: actor, actor };
    return { seat: actor, curtain: -1, actor };
  }

  function seatKindLabel(seat, i) {
    if (seat.kind === 'bot') return `Bot · ${levelLabel(seat.level)}`;
    if (isOnline()) {
      if (seat.client === room?.clientId) return 'You';
      const player = roster.find((entry) => entry.id === seat.client);
      return !player || player.connected === false ? 'Offline' : 'Online';
    }
    return match.seats.filter((other) => other.kind === 'human').length > 1 ? 'This device' : seat.name === 'You' ? '' : 'You';
  }

  function renderTable() {
    if (!match) return;
    const view = match.state;
    const { seat, curtain, actor } = perspective();
    const outcome = game.outcome(view);
    const canAct = !outcome && actor >= 0 && actor === seat && curtain < 0 && !pendingSince &&
      (isOnline() ? match.seats[actor].client === room?.clientId : match.seats[actor].kind === 'human');
    const shown = shownState(seat);
    const rollKey = `${match.id}:${view.rollId ?? ''}`;
    const rolled = lastRollKey !== null && rollKey !== lastRollKey;
    lastRollKey = rollKey;

    // Head actions
    const host = !isOnline() || room?.isHost;
    $('dt-head-actions').innerHTML = `${isOnline() ? '<button type="button" class="btn btn--ghost" id="dt-leave">Leave room</button>' : ''}${host ? `<button type="button" class="btn btn--ghost" id="dt-new">${isOnline() ? 'Back to lobby' : 'New game'}</button>` : ''}`;

    // Status
    const statusText = outcome ? outcome.text : curtain >= 0 ? `Pass the device to ${view.names[curtain]}.` : game.status(shown, seat, { canAct });
    $('dt-status').innerHTML = `<p class="dt-status-text">${esc(statusText)}</p>${outcome ? `<div class="dt-status-actions">${host ? '<button type="button" class="btn btn--primary" id="dt-rematch" data-key="rematch">Play again</button>' : `<span class="dt-muted">Waiting for the host</span>`}${host ? `<button type="button" class="btn btn--ghost" id="dt-setup-again" data-key="setup-again">${isOnline() ? 'Back to lobby' : 'Change players'}</button>` : ''}</div>` : ''}`;
    $('dt-status').dataset.state = outcome ? 'over' : canAct ? 'yours' : 'waiting';
    $('dt-status').style.setProperty('--seat-color', seatColor(outcome ? outcome.winners[0] ?? 0 : actor >= 0 ? actor : 0));

    // Curtain
    $('dt-curtain').hidden = curtain < 0;
    board.hidden = curtain >= 0;
    if (curtain >= 0) {
      $('dt-curtain').innerHTML = `<p>${esc(view.names[curtain])}, it is your turn.</p><button type="button" class="btn btn--primary btn--lg" id="dt-reveal" data-key="reveal">${esc(game.revealLabel || 'Show my dice')}</button><p class="dt-muted">Everyone else, look away.</p>`;
    } else {
      const focusKey = document.activeElement && board.contains(document.activeElement) ? document.activeElement.dataset.key : null;
      const ctx = context(shown, seat, actor, canAct, rolled, outcome);
      ui.render(board, ctx);
      paintDice(board);
      if (focusKey) board.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }

    // Players
    $('dt-players').innerHTML = match.seats.map((entry, i) => {
      const winner = outcome?.winners.includes(i);
      const offline = isOnline() && entry.kind === 'human' && entry.client !== room?.clientId && !roster.some((player) => player.id === entry.client && player.connected !== false);
      return `<li class="dt-player${i === actor && !outcome ? ' is-turn' : ''}${winner ? ' is-winner' : ''}" style="--seat-color: ${seatColor(i)}"${i === actor && !outcome ? ' aria-current="true"' : ''}>
        <span class="dt-dot" aria-hidden="true"></span>
        <span class="dt-player-name"><strong>${esc(entry.name)}</strong>${playerNote(entry, i)}</span>
        <span class="dt-player-summary">${esc(game.summary(shown, i))}</span>
        ${offline && room?.isHost ? `<button type="button" class="btn btn--ghost dt-takeover" data-takeover="${i}">Bot plays</button>` : ''}
      </li>`;
    }).join('');

    // Log
    const logList = $('dt-log');
    const stick = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 40;
    logList.innerHTML = (view.log || []).slice(-80).map((entry) => entry.seat >= 0
      ? `<li style="--seat-color: ${seatColor(entry.seat)}"><strong>${esc(view.names[entry.seat])}</strong> ${esc(entry.text)}</li>`
      : `<li class="dt-log-table">${esc(entry.text)}</li>`).join('');
    if (stick) logList.scrollTop = logList.scrollHeight;
  }

  function playerNote(entry, i) {
    const parts = [seatKindLabel(entry, i), match.wins[i] ? `${match.wins[i]} ${match.wins[i] === 1 ? 'win' : 'wins'}` : ''].filter(Boolean);
    return parts.length ? `<small>${esc(parts.join(' · '))}</small>` : '';
  }

  function context(state, seat, actor, canAct, rolled, outcome) {
    return {
      state,
      seat,
      actor,
      canAct,
      rolled,
      outcome,
      names: state.names,
      seats: match.seats,
      isBot: (i) => match.seats[i]?.kind === 'bot',
      act: (action) => act(action),
      refresh: () => renderTable(),
    };
  }

  $('dt-table').addEventListener('click', (event) => {
    const target = event.target.closest('button, [data-act]');
    if (!target || target.disabled) return;
    if (target.id === 'dt-reveal') {
      revealed = perspective().curtain;
      renderTable();
      board.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    } else if (target.id === 'dt-new' || target.id === 'dt-setup-again') {
      backToSetup();
    } else if (target.id === 'dt-rematch') {
      rematch();
    } else if (target.id === 'dt-leave') {
      leaveRoom();
    } else if (target.dataset.takeover) {
      const i = Number(target.dataset.takeover);
      match.seats[i] = { ...match.seats[i], kind: 'bot', level: 'normal', client: null };
      match.rev += 1;
      publish();
      renderTable();
      scheduleBot();
    } else if (target.dataset.act && board.contains(target)) {
      act(JSON.parse(target.dataset.act));
    } else if (board.contains(target) && ui.click) {
      const { seat, actor } = perspective();
      ui.click(event, context(shownState(seat), seat, actor, isCanAct(), false, game.outcome(match.state)));
    }
  });

  // Guests already hold a view; the host and local play hold the full state.
  function shownState(seat) {
    return isOnline() && !room?.isHost ? match.state : game.view(match.state, seat);
  }

  function isCanAct() {
    if (!match) return false;
    const { seat, curtain, actor } = perspective();
    return !game.outcome(match.state) && actor >= 0 && actor === seat && curtain < 0 && !pendingSince &&
      (isOnline() ? match.seats[actor].client === room?.clientId : match.seats[actor].kind === 'human');
  }

  document.addEventListener('keydown', (event) => {
    if (screen !== 'table' || !ui.key || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, select, textarea, dialog') || document.querySelector('dialog[open]')) return;
    const { seat, actor } = perspective();
    ui.key(event, context(shownState(seat), seat, actor, isCanAct(), false, game.outcome(match.state)));
  });

  function act(action) {
    if (!isCanAct()) return;
    const seat = perspective().actor;
    if (isOnline() && !room.isHost) {
      try {
        room.sendAction({ type: 'move', action, rev: match.rev });
        pendingSince = Date.now();
        setTimeout(() => { if (pendingSince && Date.now() - pendingSince >= 5000) { pendingSince = 0; renderTable(); } }, 5100);
        renderTable();
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    revealed = seat;
    commit(seat, action);
  }

  function commit(seat, action) {
    let next;
    try {
      next = game.apply(match.state, seat, action, cryptoRng);
    } catch (error) {
      toast(error.message || 'That move is not allowed.');
      return false;
    }
    match.state = next;
    match.rev += 1;
    const outcome = game.outcome(next);
    if (outcome && !match.scored) {
      match.scored = true;
      outcome.winners.forEach((winner) => { match.wins[winner] += 1; });
    }
    saveMatch();
    publish();
    renderTable();
    scheduleBot();
    return true;
  }

  function scheduleBot() {
    clearTimeout(botTimer);
    if (!match || screen !== 'table' || !authority()) return;
    const state = match.state;
    if (game.outcome(state)) return;
    const actor = game.actor(state);
    if (actor < 0 || match.seats[actor].kind !== 'bot') return;
    const rev = match.rev;
    const level = match.seats[actor].level || 'normal';
    let action;
    try {
      action = game.bot(game.view(state, actor), actor, level, cryptoRng);
    } catch (error) {
      console.error(error);
      return;
    }
    const delay = (game.pace ? game.pace(state, action) : 900) * (document.hidden ? 0.3 : 1);
    botTimer = setTimeout(() => {
      if (!match || match.rev !== rev) return;
      commit(actor, action);
    }, delay);
  }

  // ---------- Online ----------
  async function ensureRoom() {
    if (room) return room;
    if (!window.Peer) await loadScript(PEERJS);
    if (!window.PeerRoom) await loadScript(PEER_ROOM);
    room = new window.PeerRoom({ namespace: `msdice-${game.id}`, maxPlayers: game.players.max, storageKey: `${keys.host}.room` });
    room.onStatus = (status, message) => {
      netState = status;
      renderNet();
      if (message && status !== 'connected') toast(message);
    };
    room.onError = (error) => {
      toast(error.message);
      if (/closed this room|recovery failed/i.test(error.message)) {
        room.leave();
        resetOnline();
      }
    };
    room.onRoster = (players) => {
      roster = players;
      if (room.isHost && lobby && !match) {
        const extra = roster.length + lobby.bots.length - game.players.max;
        if (extra > 0) lobby.bots.splice(lobby.bots.length - extra, extra);
        publish();
      }
      if (screen === 'setup') renderSetup(); else renderTable();
    };
    room.onState = (model) => {
      if (room.isHost) return;
      pendingSince = 0;
      if (model.kind === 'lobby') {
        lobby = model;
        match = null;
        if (screen !== 'setup') {
          screen = 'setup';
          $('dt-table').hidden = true;
          $('dt-setup').hidden = false;
        }
        renderSetup();
      } else if (model.kind === 'match') {
        match = model;
        if (screen !== 'table') showTable(); else renderTable();
      }
    };
    room.onAction = (clientId, message) => {
      if (!room.isHost || message?.type !== 'move' || !match) return;
      const seat = match.seats.findIndex((entry) => entry.client === clientId);
      if (seat < 0 || game.actor(match.state) !== seat) return;
      const ok = commit(seat, message.action);
      if (!ok) room.broadcastEvent({ kind: 'error', target: clientId, message: 'That move is not allowed.' });
    };
    room.onEvent = (_clientId, event) => {
      if (event?.kind === 'error' && event.target === room.clientId) {
        pendingSince = 0;
        toast(event.message);
        renderTable();
      }
    };
    room.onBecomeHost = (recovered) => {
      if (recovered?.kind === 'match') {
        match = recovered;
        if (match.spectatorCopy) {
          delete match.spectatorCopy;
          match.state = game.recover ? game.recover(match.state, cryptoRng) : match.state;
          match.rev += 1;
        }
        lobby = null;
      } else {
        lobby = recovered?.kind === 'lobby' ? recovered : { kind: 'lobby', options: clone(setup.options), bots: [] };
        match = null;
      }
      publish();
      if (match) { if (screen !== 'table') showTable(); else { renderTable(); scheduleBot(); } } else renderSetup();
      toast('You are now the host.');
    };
    return room;
  }

  function publish() {
    if (!room?.isHost || !room.connected) {
      if (screen === 'setup') renderSetup();
      return;
    }
    const model = match ? match : lobby;
    if (!model) return;
    // Every guest also receives a copy for host hand-over. With hidden dice that
    // copy is the spectator view; game.recover() makes it playable again.
    const handover = model.kind === 'match' && game.hidden ? { ...model, state: game.view(model.state, -1), spectatorCopy: true } : model;
    room.publishState(handover, (_copy, clientId) => {
      if (model.kind !== 'match') return model;
      const seat = model.seats.findIndex((entry) => entry.client === clientId);
      return { ...model, state: game.view(model.state, seat) };
    });
    storage.set(keys.host, { roomCode: room.roomCode, model, savedAt: Date.now() });
    if (screen === 'setup') renderSetup();
  }

  async function connect() {
    if (connecting) return;
    const nameInput = document.getElementById('online-name');
    const name = cleanName(nameInput?.value, 'You');
    storage.set(keys.name, name);
    const codeInput = document.getElementById('room-code');
    const code = String(codeInput?.value || '').split('#').pop().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(-6);
    if (joinMode === 'join' && code.length !== 6) return toast('Enter the six-character room code.');
    connecting = true;
    renderSetup();
    try {
      await ensureRoom();
      if (joinMode === 'create') {
        await room.create(name);
        roster = room.snapshot().players;
        lobby = { kind: 'lobby', options: clone(setup.options), bots: (setup.bots || []).slice(0, game.players.max - 1).map((bot, i) => ({ name: BOT_NAMES[i], level: bot.level || 'normal' })) };
        match = null;
        publish();
      } else {
        await room.join(code, name);
        roster = room.snapshot().players;
      }
      history.replaceState(null, '', `#${room.roomCode}`);
      netState = 'connected';
      renderNet();
    } catch (error) {
      toast(error.message);
    } finally {
      connecting = false;
      if (screen === 'setup') renderSetup();
    }
  }

  async function resumeRoom() {
    connecting = true;
    renderSetup();
    try {
      await ensureRoom();
      await room.resume();
      roster = room.snapshot().players;
      if (room.isHost) {
        const stored = storage.get(keys.host);
        const model = stored?.roomCode === room.roomCode ? stored.model : null;
        if (model?.kind === 'match') { match = model; lobby = null; } else { lobby = model || { kind: 'lobby', options: clone(setup.options), bots: [] }; match = null; }
        publish();
        if (match) showTable();
      }
      history.replaceState(null, '', `#${room.roomCode}`);
      netState = 'connected';
      renderNet();
    } catch (error) {
      toast(error.message);
    } finally {
      connecting = false;
      if (screen === 'setup') renderSetup();
    }
  }

  function leaveRoom() {
    try { room?.leave(); } catch { /* Already closed. */ }
    resetOnline();
  }

  function resetOnline() {
    clearTimeout(botTimer);
    lobby = null;
    match = null;
    roster = [];
    netState = 'offline';
    history.replaceState(null, '', location.pathname);
    renderNet();
    screen = 'setup';
    $('dt-table').hidden = true;
    $('dt-setup').hidden = false;
    renderSetup();
  }

  async function copyInvite() {
    const link = `${location.origin}${location.pathname}#${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied.');
    } catch {
      toast(link);
    }
  }

  function renderNet() {
    const badge = document.getElementById('network-state');
    if (!badge) return;
    badge.hidden = netState === 'offline' && !room?.connected;
    badge.dataset.state = netState;
    badge.className = `badge ${netState === 'connected' ? 'badge--good' : netState === 'reconnecting' ? 'badge--warn' : 'badge--plain'}`;
    badge.textContent = netState === 'connected' ? (room?.isHost ? `Hosting ${room.roomCode}` : `Room ${room?.roomCode || ''}`) : netState === 'reconnecting' ? 'Reconnecting' : 'Offline';
  }

  function toast(message) {
    const stack = $('dt-toasts');
    stack.innerHTML = `<div class="toast"><span>${esc(message)}</span></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { stack.innerHTML = ''; }, 4200);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleBot(); });

  // ---------- Start ----------
  renderNet();
  const resumable = savedMatch();
  if (resumable && !game.outcome(resumable.state) && place === 'local') {
    match = resumable;
    showTable();
  } else {
    renderSetup();
  }
  return { get match() { return match; } };
}
