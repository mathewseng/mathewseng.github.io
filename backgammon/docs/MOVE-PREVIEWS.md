# Move preview arrows

`core/move-trace.mjs` derives display identities from committed or previewed legal steps. A checker continuing with another die retains its original ghost. Canonical state is not changed. Indistinguishable checkers moving between the same two points share an arrow to avoid crossed lines for doubles. Solution notation joins intermediate steps, retaining points where a hit occurs; an arrow is a visual origin-to-destination connection, not a dice path.

`ui/move-arrow-route.mjs` first tries a straight line. Otherwise a tangent graph finds a short checker-clear route, expanding from direct blockers only as other checkers obstruct the detour. A single smooth quadratic bow is preferred when its length is within 3% of that route. This keeps smooth curves without the long bows of the earlier deflection-first search. Ghosts, dice and the cube are not obstacles. Routes are bounded-cached independently of colors, avoiding geometry work on every redraw.

Degree-seven transition splines match position and the first three derivatives at tangent/arc joins. The checker clearance is a 44-unit radius (a checker radius plus 22 units of breathing room). Ends stop short of source/destination rims. A per-board SVG mask protects live checker faces when a packed position leaves no clear route. Clearance boundaries and smoothing are visual approximations, not a claim of zero physical jerk. Arrows use the moving player's color with a thin contrasting outline and never receive pointer input. Routing does not involve the engine.

`core/move-presentation.mjs` chooses a legal equivalent ordering of a solution's steps, minimizing separate checker journeys and then compact notation length. For example `5/2 8/5 10/7 11/8` becomes `11/2 10/7` and two origin-to-destination arrows. Intermediate hits retain `*`; repeated identical journeys use `(2)`. The recorded turn, resulting board and evaluation are unchanged.

The shared renderer is used by Play's previous turn, decision review, Solver/Trainer candidate previews, and the history tree. Original-position views and newly rolled turns remove the arrows. Simultaneously open boards have distinct mask IDs. Preview traces are paired with the exact preview object so a source change cannot reuse an old arrow.

Decision review opens on the best evaluated move. If the played and best moves produce the same board (including different equivalent step orders), the duplicate control is omitted and the preview is labeled **Best/your move** or **Best/their move**. Equal scores for different boards are not collapsed. Cube reviews also open on their best decision and combine matching labels.

## Validation — October 12, 2026

- `node scripts/run-tests.mjs`: **358 passed**, zero failures. Focused final geometry, deployment, offline-manifest and Research-screen checks also passed after visual refinement.
- Actual assembled assets: move-arrow, last-move and history browser checks passed in **Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0**. Chain moves, doubles, bar entry/hits, bearoff, tall stacks, passes and both orientations were exercised. The live Play test also verifies original dice, pointer transparency, independent dialog masks and unchanged committed actions/state.
- The ranked review suite passed in all three browsers, using real GNUbg analysis and nine viewport classes from 320×568 through 1440×900. Matching best/played labels and removal of duplicate buttons are asserted.
- Screenshots were inspected for live Play and best-move review on desktop and phone, Plum and Linen themes, both orientations, chains, doubles and bar entry. Inspected examples include Chromium at 1366×768 and 390×844, WebKit at 844×390 and Firefox at 390×844. These are desktop browser emulations, not physical phone tests.
- A broad Chromium run exposed an outdated assertion requiring the old “Opponent’s move” label; it now accepts the appropriate combined label. A later broad run hit an intermittent Settings close timeout. Appearance (all 24 themes), assistance, turn policy, refresh and automatic-update suites subsequently passed independently on the final artifact. The full pre-arrow solver run passed; the later broad UI runs are not recorded as full passes.

Browser reports and screenshots are written to the ignored `backgammon/test-results/` directory. `tests/browser.cjs` includes the new live-arrow test for CI. `tests/move-trace.test.mjs` covers identity, geometry, obstacle routing, bundling and immutability independently of the DOM.


## Validation — October 15, 2026

- `node scripts/run-tests.mjs`: **415 passed**, zero failures (171.6 seconds). Geometry checks include the reported two-arrow position, real-checker clearance, single-bend curvature, both orientations, rectangle exclusion and closest-legal-drop regions.
- On the assembled `_site`, **24 suite runs passed**: `drag-feedback`, `move-arrows`, `highlight-motion`, `dice-switch-motion`, `dice-undo`, `last-move-motion`, `last-move-entry` and `review-motion`, each in Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0. The preview suites include real bundled GNUbg analysis.
- New drag coverage checks physical checker clicks, both orientations/input styles, both player colors, amber cue eligibility, forced/preview exclusions, tall stacks, bar/off counts, blocked/outside releases, Escape, redraws during pickup and unchanged committed state/dice. Chromium additionally uses browser-dispatched native touch events for successful release and cancellation; Firefox/WebKit mobile checks use desktop browser emulation.
- Inspected screenshots include the reported straight-arrow position and a curved route around a five-checker stack, Plum/Linen previews, the lifted checker on desktop/portrait/landscape, Chromium's touch pickup, real Play at 1366×900 and 390×844, Firefox desktop amber cues, and WebKit mobile pickup. These are not physical-device tests.
