# Shared requests from redesign/microtonal-cards

These components are implemented locally in `cards/styles.css`, `cards/app.js`, `microtonal-lab/styles.css` and
`microtonal-lab/app.js`. They should move into `shared/app.css`, with a small shared script where noted. The local
copies use page-prefixed classes (`ct-`, `ml-`) or the page's old hook names, so lifting them changes no test.

## 1. `.die`: the one CSS dice face (brief component 23)

The kit has no `.die` yet. Cards renders `<span class="die" data-pips="1..6" role="img" aria-label="N">` with one
`<i>` per pip; other dice show a numeral. Proposed kit CSS, copied from `cards/styles.css` ("The dice face"):

```css
.die { position: relative; display: grid; place-items: center; width: 40px; height: 40px;
  border: 1px solid var(--line-strong); border-radius: 9px;
  background: linear-gradient(160deg, var(--surface-3), var(--surface-2)); color: var(--ink);
  font-size: var(--t-md); font-weight: 700;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent), 0 3px 10px color-mix(in srgb, black 26%, transparent); }
.die[data-pips] { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 7px; font-size: 0; }
.die[data-pips] i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink); }
.die[data-pips="1"] i { grid-area: 2 / 2; }
/* ...2–6: grid-area per nth-child, as in cards/styles.css */
```

Consumers: Cards now. Backgammon theme samples and the Dice canvas palette later.

## 2. `.action-stage` with a measured `--stage-h` (prompt.md, Mobile)

Cards implements the bottom stage as `#stage.ct-stage` holding three toolbars. `bindStage()` in `cards/app.js` does
two things:

- It shows the stage while any child toolbar is visible, using a MutationObserver on the children's `hidden`.
- It writes the stage height into `--stage-h` on `body`, using a ResizeObserver. A stage with
  `position: static` (the landscape side column) writes 0.

Proposed kit pieces:

- **CSS:** `.action-stage { position: sticky; bottom: 0; display: grid; gap: 6px; padding: 8px var(--gutter) calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(14px); }`
- **Landscape rule:** `@media (max-height: 560px) and (pointer: coarse)` turns the stage into a right-hand column.
- **Toast offset:** `.toast-stack { bottom: calc(12px + max(var(--stage-h, 0px), env(safe-area-inset-bottom))) }`
- **Script:** `shared/stage.js` with `Stage.bind(stageEl)` holding the ~20 lines of `bindStage`.

Note: the stage's negative inline margin must use the same variable as the shell's gutter. Cards first had a 12px
bleed in an 8px gutter, which made `body` 4px too wide on phones.

## 3. `.menu`: role="menu" popover with keyboard handling

Cards' context menus (`showMenu` in `cards/app.js`, `.menu` in `cards/styles.css`) behave as follows:

- `role="menu"`, `role="menuitem"` buttons with `tabindex="-1"`, `role="separator"` rules and presentational headings.
- Opening moves focus to the first item. ArrowUp, ArrowDown, Home and End move between items. Escape and Tab close
  the menu and return focus to the opener.
- Disabled items carry a lock and a "Host only" hint.
- On coarse pointers, items are 44px rows.

A `shared/menu.js` (`Menu.open(anchor, items)`) plus the `.menu` CSS would serve the Poker table seat menus and the
Backgammon library later.

## 4. Status pill: a button that shows a state (Microtonal `.ml-audio`, Cards `.room-badge`)

Both pages show a persistent state in the topbar:

- **Microtonal:** the audio context is idle, running, suspended or unavailable.
- **Cards:** the room is local, hosting, guest, reconnecting or offline.

Each is a `.btn` holding a dot and a label, with `data-state` mapping to `--good`, `--warn`, `--bad` or muted. The
proposed kit class is `.status-pill[data-state="ok|warn|bad|idle"]`:

- **Dot:** `.status-pill-dot`, 8px, with a `--good-soft` ring when ok.
- **Label:** `.status-pill-word`, which folds away on phones with the sr-only recipe (Cards' `.room-word`) so only
  the dot and the code stay visible.

## 5. Phone topbar on one row

Both pages add the same rules inside their phone query, so the page name gets an ellipsis before the actions wrap
onto a second row:

```css
.topbar { flex-wrap: nowrap; gap: 8px; }
.crumbs { flex: 1 1 auto; gap: 8px; }
.crumbs > a, .topbar-actions { flex: none; }
```

This belongs in `app.css` under `@media (max-width: 640px)`, together with the crumb's existing ellipsis.

## 6. `.stepper` with an `<output>` value

The kit `.stepper` styles `> input`. Microtonal's pulse steps (`.pulse-step`) and keyboard range
(`.range-controls`) use `[−] <output> [+]`, with the value in a bordered middle cell. Proposed:

```css
.stepper > output { display: grid; place-items: center; min-width: 4ch; margin-inline: -1px; padding: 0 6px;
  border-block: 1px solid var(--line-strong); background: var(--surface); font-size: var(--t-sm); font-weight: 600; }
@media (pointer: coarse) { .stepper > output { font-size: var(--t-md); } }
```

## 7. `.toast--warn`

Cards needs a warn tone beside `--alert` and `--good`:

```css
.toast--warn { border-color: color-mix(in oklab, var(--warn) 50%, transparent);
  background: color-mix(in oklab, var(--warn) 14%, var(--surface-2)); }
```

## 8. Locked-control hint (Cards `.ct-host-only`, `.ct-guest-note`)

This is the guest state for multiplayer pages:

- A disabled control gets an inline lock icon, an sr-only "Host only" label, and the same text as its title.
- An info note at the top of the panel explains it.

Every multiplayer page needs this state (prompt.md, Content and hierarchy fixes). Proposed kit classes:
`.lock-hint` (inline icon plus a 12px muted label) and `.note--info` (an info-tinted callout with an icon).

## 9. `.btn--good`

Cards' "Play → group", "Accept" and "Award pot" buttons use `.ct-btn-good`, a `--good` soft fill. Outcomes use the
semantic colours, so a kit `.btn--good` would sit beside `.btn--danger`.
