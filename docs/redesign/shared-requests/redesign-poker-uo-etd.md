# Shared requests from redesign/poker-uo-etd

Components the casino pair added to `poker/table.css` (or to the page scripts) that other pages will want. The play and rush requests (felt, seat, hand chip, lobby, action stage, log/chat, settings row, banners) still stand; these are additions.

| Selector / code | Where | Used by | Why shared |
| --- | --- | --- | --- |
| `.card-slot` (+ `.dealt`, `--deal-delay`) | `poker/table.css` "Card slots" | UO boards and hole cards, ETD dealer and hole cards | A dashed placeholder sized by `--card-width` that holds one shared `.playing-card` and transitions it in (no `animation-fill-mode`, so a stalled animation never leaves a card invisible). It duplicates `cards.css .empty-slot` plus a deal transition; a `.empty-slot.dealt` state in `shared/cards.css` would let every table (OFC Play, 222, Mixed Poker) use one placeholder. |
| `.slot-badge`, `.slot-badge--warn` | "Card slots" | ETD "Replace" / "Queued" | Visible state text over a card ("Replace", "Held", "Discard"); belongs beside the `selected / staged / dim / danger` wrapper states in `shared/cards.css`. |
| `.money-input` | "Card slots" | UO and ETD host bet fields | A `$` prefix beside a number input with a focus-within ring; Mixed Poker's stakes and any buy-in field could use it as a `.field` variant. |
| `.section-header` + `.collapsible.collapsed` | "Collapsible sections" | ETD dealer and players panels | A `<button aria-expanded>` panel header with a rotating chevron; a kit `.panel-head--toggle` would cover every collapsible panel head. |
| `.emoji-picker`, `.emoji-option` | "Log entries and chat" | UO and ETD chat | 44px quick-reaction popover anchored above a chat form. |
| `.log-entry <type>`, `.chat-message` (`.sender .text .timestamp`, `.system`, `.emoji-blast`) | "Log entries and chat" | UO and ETD | The pages' own log and chat line markup on tokens; Card Table Workshop's log could reuse it. |
| Tool-nav "current entry into view" | end of `poker/ultimate-omaha/app.js` and `poker/edge-the-dealer/app.js` | every tool page on phones | `.tool-nav` is a scrolling strip under 640px; pages late in a family's list (Edge the Dealer, 222, Library) load with their own entry off-screen. Six lines in a shared script (`shared/tabs.js` or a small `shared/topbar.js`) would fix every page; the pages' copies can then be deleted. |
| `.table-app ~ .toast-stack { bottom: calc(var(--stage-h, 0px) + 12px + env(safe-area-inset-bottom)) }` | "Table app shell" | UO, ETD (Mixed Poker has the same idea) | Make it the kit default for `.toast-stack` so any page that publishes `--stage-h` gets toasts above its action stage. |

Kit observations:

- The landscape-phone rule (`max-width: 1020px and max-height: 560px`) overlaps the desktop rule (`min-width: 821px`) at 844×390; any page that writes desktop overrides at higher specificity silently wins over its landscape rules. A note in `app.css` beside the breakpoints (or a desktop query of `min-width: 821px and min-height: 561px`) would save the next page the same bug.
- `Sheet.confirm` with `danger: true` and a verb ("Close table", "Leave", "Quit") fits leave flows exactly; consider documenting the `sheet: true` option in the kit preview.
