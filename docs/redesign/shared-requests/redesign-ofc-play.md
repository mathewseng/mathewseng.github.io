# Shared component requests from redesign/ofc-play

Implemented locally in `ofc/ofc.css` under family-prefixed classes; each one is used by
`/ofc/play/` and will be used by the trainer, and is generic enough for the poker tables.

| Local selector | Proposed shared name | Used by | Notes |
| --- | --- | --- | --- |
| `.ofc-shell`, `.ofc-shell > .action-stage` | `.app--shell` + `.action-stage` (brief §Mobile, component 21) | Play; every app shell | 100dvh grid topbar / `minmax(0,1fr)` main / sticky action row with `env(safe-area-inset-bottom)`; `grid-template-columns: minmax(0, 1fr)` and `main { min-width: 0 }` are needed or a row's min-content widens the page at 320px. |
| `.ofc-board`, `.ofc-row`, `.ofc-row-head`, `.ofc-row-cards`, `.ofc-row-summary`, `.ofc-board--mini` | `.ofc-board / .ofc-row` (component 20) | Play, trainer, trainer solution, hub preview | Label and summary widths must be read with `var(--ofc-label-w, 96px)` on the row, not declared on the board, so pages can override per breakpoint from an ancestor. |
| `.hand-chip`, `.hand-chip--good`, `.hand-chip--bad` | `.hand-chip` (component 20) | Play, trainer, hub royalty pill, Edge the Dealer readouts | Hand name \| tabular points, 12px floor. |
| `.ofc-felt`, `.ofc-stage-head`, `.ofc-stage-dot` | `.stage.felt` (component 19) | Play; poker tables | Built on `--felt-*`; accent only for selection. |
| `.ofc-tray`, `.ofc-tray-slot`, `.ofc-tray-key`, `.ofc-tray--grid` | `.card-tray` | Play, trainer bank, 222 deck | Fixed slot positions, hotkey caption, two-row grid via `--tray-columns`. |
| `.ofc-seat`, `.ofc-seat-avatar`, `.ofc-seat-name`, `.ofc-seat--empty`, `.ofc-seat--me` | `.seat` (component 18) | Play roster; Mixed Poker, Rush, Cards | Avatar, name, status badge; add stack/PnL and card row for poker. |
| `.ofc-code` | `.lobby-code` (component 17) | Play; every multiplayer lobby | Mono, tracked room code. |
| `.ofc-banner`, `.ofc-banner--bad`, `.ofc-banner--info` | `.banner` | Play (reconnecting, player gone); every multiplayer page | One line of copy + an action button; warn by default. |
| `.ofc-inline-error` | `.form-error` block | Play; forms everywhere | `:empty { display: none }` so an empty slot takes no space. |
| `.ofc-dbar`, `.ofc-dbar--neg` | `.bar--diverging` (component 11) | Play ledger; Dodge option rows, EV charts | Fill grows from the centre by `--value`, colour by `--bar-color`. |
| `.segmented--wrap` | `.segmented--wrap` (component 3) | Play variant picker and Dealer's Choice; blackjack rule groups | The kit control allowed to wrap to a second row instead of scrolling. |
| `.rules-article`, `.rule-section`, `.royalty-groups`, `.cribbage-*` | `shared/ofc-rules.css` or keep in `ofc/ofc.css` | Play, trainer, EV | Family-specific; only move if another family gains a rules article. |
