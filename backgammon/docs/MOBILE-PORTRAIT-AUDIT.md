# Portrait play audit — November 15, 2026

Portrait play is the primary use case. Keep the checker board, the current decision and its actions together; preserve the width of the board and avoid making the player reach to the bottom edge for routine decisions.

## Changes

- Replaced portrait checker and cube warnings with an inline review below the board and equity strip. EV loss, Hint, Play best, Reset and Play anyway share one compact area with 48px actions. Revise restores the editable draft. There is no backdrop, page scroll lock or focus trap in portrait.
- Submitted checker moves retain their arrows, departure ghosts and destination outlines while the review is pending or graded. The board remains locked against accidental edits until revision or confirmation.
- Rotation reuses the same pending review, actions, grade and focused control. Desktop and landscape retain a modal; returning to portrait restores the inline review without submitting or cancelling the move.
- Replaced the live portrait navigation row with the existing pages button and removed the duplicate Play heading. Setup still shows the full page navigation. Match context and Details/Tools remain available.
- Started the game summary collapsed, directly after the turn controls. Expansion grows in page flow; it does not resize or move the board or player strips. Removed the reserved empty footer height.
- Gave checker history twice the width of its paired cube decision on phones, reducing wrapped notation and large empty cube columns.
- Fixed narrow Safari probability-table overflow by reserving complete percentage widths and allowing the name column to shorten.

## Validation

- `play-state-layout`: 71 recorded layouts covering desktop, portrait and landscape, including rolling, drafts, confirmation, bearing off, blocked entries, doubles/beavers/raccoons, resignations, takebacks, bot waiting/paused states and game/match endings. Checks include overlap, clipping, visible targets and sideways overflow.
- `revision-warning`, `cube-warning`, `confirm-readiness`: pending, cached, failed and late grades; each action; correct-move automatic continuation; preservation of the submitted choice and saved draft. Portrait warnings have no modal backdrop; the board arrows remain visible.
- `decision-prompt`: 320×568 through 430×932 portrait targets, keyboard revision, all four actions and rotation with a pending grade. Chromium and WebKit.
- `mobile-summary`: short and tall portrait layouts, collapsed/expanded states, equity visibility and rotation without moving the board.
- `mobile-study`, `mobile-settings`, `mobile-sheets`, `history-attempts` and `modal-fit`: study flows, controls/forms, long player names, saved-draft preservation, history and review sizing. Safari viewport/keyboard bounds are simulated; these checks do not replace physical-device testing.
- Fresh desktop, 430×932 portrait and landscape screenshots were inspected.

The older `mobile-flow` suite's landscape-only “larger study board” assertion also fails on the previous release. Portrait play and study checks pass; this assertion describes the older landscape layout and is outside this portrait change.
