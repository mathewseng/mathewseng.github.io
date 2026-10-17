# Shared requests from redesign/poker-rush

Components implemented in `poker/rush/styles.css` that other pages will want, and kit observations.

| Selector | Where | Used by | Why shared |
| --- | --- | --- | --- |
| `.rush-tile`, `.rush-tile--featured`, `-kicker`, `-title`, `-text`, `-foot`, `-go` | Lobby: records, tiles, options | `/poker/rush/` lobby | The hub tile recipe (`shared/hub.css .tile`) on a `<button>` with an `:active` state and a static accent edge, without hub.css's ambient motion or pointer light. A `.tile` that works as a button outside hub.css would let any tool page offer a "start" tile grid (Backgammon Play's modes, Card Table Workshop's gallery). |
| `.hand-slot > .playing-card > .card-badge { font-size: max(var(--t-xs), 15cqw) }` and `.card-corner { max(var(--t-xs), 13cqw) }` | Game grid | hand badges, joker corner labels | `shared/cards.css` sizes the badge at `15cqw` and the corner at `13cqw`, which is under 12px on any card narrower than 80px (every phone hand, every 844×390 hand, the matrix). Flooring both in cards.css (`max(0.75rem, 15cqw)`) would remove the page override and cover 222, OFC Play and Mixed Poker. |
| `.matrix-cell` states (`.seen`, `.active`, `.scored`, `.discarded`, `.count`) and `.matrix-legend` | Card matrix | `/poker/rush/`; 222's deck panel, OFC's seen-card views | A "card matrix with states" on top of `.deck-matrix`: unseen dimmed, in-hand accent ring, scored good ring, discarded greyscale, a count badge, and a legend. |
| `.round-metrics` phone variant (stat strip → inline pills) | Game header | `/poker/rush/`, `/poker/play/` (same rule in its page CSS) | Both poker pages turn the `.stat-strip` into wrapped pills under 820px; a kit `.stat-strip--pills` modifier would replace two copies. |
| `.score-card[data-rank]` with `--rank-color` | Scores panel | `/poker/rush/` | A result card with a semantic left rail and mini cards; close to the "result card above the seats" the brief asks of 222 and Mixed Poker's showdown. |

Kit observations:

- `.btn[aria-pressed="true"]` paints the accent-soft fill, so an icon toggle that is on by default (sound) reads as "highlighted" in the topbar; a quieter pressed style for `.btn--ghost.btn--icon[aria-pressed]` would help every page with a sound/settings toggle.
- `.dialog` has no slot for a `.lobby-wait` line between the body and the foot; the page puts it in the body with a top margin.
- `Sheet.open`'s `initialFocus` on a text input opens the keyboard at once on phones; the page skips it on coarse pointers. A kit default of "no initial focus into inputs on coarse pointers" would save every page the same check.
- `PeerRoom.leave()` throws when the host connection is already gone (it sends `leave` first); the page wraps it (`closeRoomQuietly`). A guard inside `leave()` would be safer for every consumer.
