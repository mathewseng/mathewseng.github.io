# Dice

`/dice/` holds Draw Dice (`draw/`), the payout explorer (`reports/`) and seven table games
played against bots or friends: Yacht, Farkle, Liar’s Dice, Ship Captain & Crew, Shut the Box,
Pig and Mia. `display.js` stores the shared 2D/3D dice preference.

## Table games

Every table game is one folder (`dice/<game>/`) with:

| File | Role |
| --- | --- |
| `index.html` | Topbar (crumbs, the dice games `tool-nav`, `#network-state`, `#dice-style`, `#rules-button`), an empty `main#main` and the `#rules-dialog` with the full rules |
| `engine.mjs` | Pure rules, bots and text. No DOM, so `tests/engine.test.mjs` runs it in Node |
| `app.js` | `mountTable(game, { render, click, key })` plus the board renderer |
| `styles.css` | Board styles only; colours come from tokens (`--seat-color`, `--accent`, `--good`, …) |

The shared table lives in the family root:

- `table.js` renders setup (seats on this device, or an online room through
  `shared/peer-room.js`), the stage, the players list and the log; schedules bots; hides private
  dice between people sharing a device; saves the local game; and runs rematches.
- `table.css` styles that shell and the dice (`.tdie`, 2D pips or the 3D canvas from
  `reports/dice-view.js`).
- `table-core.mjs` has the pure helpers engines use: `seededRng`, `cryptoRng`, `rollDie`,
  `rollDice`, `faceCounts`, `clone`, `log`, `nextSeat`, `binomialAtLeast`, `diceOutcomes`.

### Engine contract

`engine.mjs` exports `game`:

```js
export const game = {
  id: 'pig',                      // storage keys and the online room namespace
  name: 'Pig',
  players: { min: 2, max: 6, default: 2 },
  hidden: false,                  // true when players hold private dice
  options: [{ id, label, choices: [{ value, label }], default, hint? }],
  setup({ names, options, rng, first }),   // → state (JSON only); `first` seats the opener
  actor(state),                   // → seat to act, or -1 when the game is over
  apply(state, seat, action, rng),// → a new state; never mutates; throws Error on an illegal move
  view(state, seat),              // → what `seat` may see (-1: a spectator). Identity when !hidden
  bot(view, seat, level, rng),    // → an action. Bots only ever see their own view
  pace(state, action),            // → ms before a bot's action shows (optional, default 900)
  needsPrivacy(state, seat),      // hidden games: does this decision show private dice? (optional)
  revealLabel: 'Show my dice',    // hidden games: the hand-over button (optional)
  recover(spectatorView, rng),    // hidden games: rebuild a playable state after a host hand-over
  summary(view, seat),            // → short text for the players list ("42", "3 dice")
  status(view, seat, { canAct }), // → one line over the board
  outcome(state),                 // → null, or { winners: [seats], text }
};
```

State rules:

- `state.names` holds the seat names and `state.log` the log (`log(state, seat, text)`, seat -1
  for the table). Log text is public: never log a hidden die.
- Increment `state.rollId` whenever dice are rolled; the board then receives `ctx.rolled` once so
  it can tumble the new dice.
- Text reads correctly when a player is called “You”: past tense or “Name to …”, never a
  third-person present verb (“You won”, “You to roll”, not “You wins”).
- `level` is `easy`, `normal` or `hard`. Hard plays the strongest strategy the engine has; easy
  makes visible mistakes.

### Board contract

`render(board, ctx)` replaces `board.innerHTML` on every change. `ctx` carries `state` (the view
for `ctx.seat`), `seat`, `actor`, `canAct`, `rolled`, `outcome`, `names`, `seats`, `isBot(i)`,
`act(action)` and `refresh()`. A button with `data-act='{"type":"roll"}'` acts directly; any other
click inside the board goes to `click(event, ctx)`, which can keep local selection state and call
`ctx.refresh()`. `key(event, ctx)` receives unmodified keys while no field or dialog has focus.
Give interactive elements a stable `data-key` so focus survives re-renders.

Dice helpers from `table.js`: `dieHTML(face, { held, rolling, hidden, small, mark })` and
`diceHTML(faces, { select, held, rolling, hidden, small, mark, label, aria, disabled, key })`.

### Online play

The host’s browser is the authority: it applies every move, runs the bots and sends each guest
`game.view` for that guest’s seat. Guests send moves; the host checks that the sender owns the
acting seat. If the host leaves, the next guest takes over the table (`PeerRoom` migration). In
hidden games the hand-over copy every guest holds is the spectator view (`view(state, -1)`), so
no browser ever receives another player’s dice; the new host calls `recover` to reroll whatever
was secret. A
host can hand a disconnected guest’s seat to a bot. PeerJS and `peer-room.js` load only when
someone opens the Online tab.

### Checks

```bash
node --test dice/*/tests/engine.test.mjs
SHELL_PAGES=/dice/pig/,/dice/yacht/ node scripts/shell-browser.cjs
```
