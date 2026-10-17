# Shared requests from redesign/poker-play

Components implemented in `poker/table.css` (family-prefixed or table-scoped) that the brief lists as shared kit items; the integrator may lift them into `shared/app.css` so OFC Play, Card Table Workshop and Backgammon can use the same ones. CSS is in `poker/table.css` under the section named.

| Selector | Section in table.css | Used by | Why shared |
| --- | --- | --- | --- |
| `.stage`, `.felt`, `.felt-label`, `.felt-centre`, `.felt-pot`, `.felt-street`, `.board-line`, `.board-cards` | Stage and felt | `/poker/play/`; later Rush, UO, ETD, OFC Play | prompt.md Surfaces: "the same felt serves Mixed Poker, Rush, Ultimate Omaha, Edge the Dealer and OFC Play" |
| `.seat` and its states (`--active --folded --disconnected --confirmed --host --me --queued --empty --busted --winner --lobby`), `.seat-avatar`, `.seat-name`, `.seat-meta`, `.seat-stack`, `.seat-pnl`, `.seat-bet`, `.seat-badge`, `.seat-dealer`, `.seat-clock`, `.seat-cards` | Seats | `/poker/play/` lobby and table; the other three tables, 222, Card Table Workshop | Component 18 in the brief |
| `.hand-chip` (`--good --bad --warn`), `.hand-chip-row` | Hand chip | `/poker/play/`; OFC board rows, ETD readouts | Component 20 |
| `.lobby`, `.lobby-code`, `.lobby-code-pill`, `.lobby-roster`, `.lobby-settings`, `.lobby-wait`, `.lobby-actions` | Lobby | every `shared/peer-room.js` page | Component 17 |
| `.action-stage` with `-status -title -clock -error -actions -host`, `.amount-control` | Action stage | `/poker/play/`; every app shell's bottom bar | Component 21; the page publishes its height as `--stage-h` on `<html>` from a ResizeObserver so `.toast-stack` can sit above it — consider making `.toast-stack { bottom: calc(var(--stage-h, 0px) + …) }` the kit default |
| `.table-log`, `.table-log-list`, `.table-log-entry` (`--system --good --bad`), `.table-chat-form` | Log and chat | UO and ETD (not Mixed Poker) | Log/chat panel in step 5 |
| `.settings-row` (+ `.paired-input`) | Settings rows | `/poker/play/` setup; Gym settings, Backgammon setup | "Field … and settings row" in notes §4 |
| `.table-banner` (`--bad --info`), `.table-notice` | Banners and notices | reconnecting, host gone, spectating, table over | The multiplayer states list in prompt.md |

Small kit observations while using `shared/app.css`:

- `.crumbs a` (specificity 0,1,1) beats a bare utility class, so hiding the family crumb on phones needed `.crumbs .crumb-family`. A kit rule for the phone topbar ("row 1: mark + current tool + actions") would save every tool page the same override.
- `.badge` has no icon-only phone variant; this page collapses `#connection` to a titled dot under 640px with page CSS.
- `button.chip` is 36px on coarse pointers, below the 44px floor, so the quick-mix presets use `.btn--sm` instead.
- `Sheet.confirm` is exactly right for Leave; a `sheet: true` option is passed so it is a bottom sheet on phones.
