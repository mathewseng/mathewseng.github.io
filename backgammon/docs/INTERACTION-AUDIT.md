# Interaction audit — 2026-10-07

The complete, public [31-case matrix](https://mathewseng.github.io/backgammon/controls/#cases) compares each marker with a checker-disc click and an open-point/tray click. It lives in `controls/index.html`, next to the two flowcharts, so the user-facing explanation and detailed audit stay together.

## Decision dimensions

- Mode: live editable draft, noninteractive play/review, position editor.
- Intent: own disc, open point/number/badge, ordinary point key, explicit Shift+point destination key, drag.
- Selection: none, this source, another source; click speed is deliberately not a state.
- Occupancy: empty, friendly movable, friendly immovable, opponent blot, opponent made point, own/opponent bar or off tray.
- Route role: forward, complete multi-die chain, reverse, alternate first die, overlap, no route.
- Restrictions: bar priority, maximum dice / higher die, doubles, bearoff, locked forced prefix, consumed dice.
- Presentation: source/selection ring, legal wash and label, undo color, historical outline/ghost, keyboard focus, hover.

The ordered flow handles overlaps rather than assigning every combination a separate arbitrary behavior. Impossible combinations (a legal landing on an opposing made point, a forward move away from the bar while checkers remain there, or a return across a locked prefix) are removed by the rules/draft layer. A single checker may be eligible for forward and reverse actions; selecting it does not choose between them.

## Findings and repairs

1. **Hidden-source movement:** a selected checker’s unhighlighted point could play a different checker. Ordinary clicks now respect the selected route set. Clicking another movable resident switches source; clicking an empty unavailable point quietly preserves selection.
2. **Timing-dependent actions:** a rapid repeat exception made a location behave differently with click speed, especially after automatic bar-entry selection. Removed the timer entirely. Fast and slow input sequences now agree. When a forward move finishes the draft, its reversible landing remains selected; the next click there deselects rather than reaching a different checker’s old return route.
3. **Off-tray ambiguity:** reversible OFF had no source marker, and its actual checker strips acted like empty destination space. Added a source/selection outline, geometric strip hit-testing and a checker-sized count target so selection does not depend on tapping a thin strip. A reversible strip selects; open tray space bears off. Old committed off checkers cannot be draft-undone.
4. **Dead number lane:** documentation called point numbers destination shortcuts, but the SVG text ignored pointers outside the point hit region. Added non-overlapping number hit regions and corresponding drag-drop geometry.
5. **Noisy rejection:** unavailable targets previously replaced useful status text with explanations. They now preserve draft, selection and status without a message or animation interruption. Invalid drops snap back quietly.

## Double-click assessment

A dedicated double-click mode adds little for pointer users: ordinary destination-space clicks already build a point when the updated destination remains legal. Its costs are substantial: hidden timing state, automatic-selection conflicts, different outcomes for slower motor input, and a risk of interpreting an extra tap as a draft reversal. The latest user direction supersedes the earlier request for a timed repeat shortcut. Removed that special mode rather than tuning its threshold.

Checker-disc selection and open-point destination input remain distinct and visible. Keyboard users can explicitly request destination input with Shift+point. Repeated clicks still work, but each applies the ordinary rules to the newly displayed state; there is no delayed single-click action and no speed-dependent behavior.

## Retained deliberate distinctions

- A movable disc selects even when its point is a legal destination. The open point area plays onto the stack. An immovable disc cannot select, so it passes through to an advertised arrival.
- Without selection, forward movement wins over an overlapping draft return. Selecting the moved checker exposes the specific return in undo colors.
- Physical disc clicks never silently auto-undo. Ordinary source keys retain the explicitly requested unambiguous undo-only shortcut; Shift requests destination semantics. This exception is documented rather than disguised as identical pointer behavior.
- Ghosts and focus are independent markers. They never imply legality. Cube and used/historical dice displays do not become checker destinations.
- With no remaining forward choice, automatic forced play/pass can advance the game. Legal markers are suppressed when input is disabled; a stale event cannot bypass the canonical turn/phase rules.

## Verification

`action-audit.cjs` tests actual mouse/touch geometry for both players and orientations, including friendly discs versus open occupied destinations, selected-source deselection, hidden-source prevention, first-die revision, forced-prefix protection, forward/return overlap, bar discs/arrows, off strips/space, opposing blots, and point-number lanes. It also crosses all selections with every board/bar/off target in seven legal fixture families. Assertions distinguish source selection from actual drafting, require each advertised destination to move or open a genuine chooser, reject unadvertised movement, and preserve forced prefixes and status text on unavailable input. Native sequences compare fast clicks with 450 ms pauses and require identical drafts and selections.

This supplements `highlight-actions.cjs`, `repeat-play.cjs`, `keyboard.cjs`, `checker-ux.cjs`, `route-choice.cjs`, the pure rules/draft tests, and the full assembled-site browser suite. It is a finite behavioral audit, not a mathematical proof over every legal game state or physical iPhone testing.
