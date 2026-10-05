# Validation record — 2026-10-04

This is observed test coverage, not a claim of commercial feature parity or real-device certification.

## Automated checks

- Full repository `node scripts/run-tests.mjs`: **117 tests passed, zero failures**. Includes existing poker/OFC/cards/blackjack/PeerRoom regressions and new rules, malformed-input, property/replay, XGID, MAT, backup, protocol, worker queue, appearance and deployment-artifact tests.
- Seeded rules runs play 12 complete games, assert checker conservation after every transition, and replay committed dice/actions to the identical final state. Fixture tests replay every generated exercise's provenance and validate every recorded candidate as a complete legal turn.
- `tests/browser.cjs` on the assembled `_site`: Chrome **154.0.8037.93**, Firefox **146.0.1**, WebKit **26.0**. All three completed gameplay, cube handling, save/reload, Library, Trainer, Solver, actual WASM, probability/perspective/match-context, cancellation/restart and offline checks. No custom isolation headers; `crossOriginIsolated` was false.
- Original C `hint` and our binding agree on five openings within **0.00011**. Fixtures record full version/settings and are checked to **0.0001**. A 75-result doubles position verifies evaluation of a submitted move outside the original top-40 hints. Tests compare mirror/player perspectives and changed match scores, not only mocked outputs.
- One complete browser game against the real Quick computer finished through **142 committed events / 35 human decisions**, awarded a backgammon, replayed identically, and saved the completed match to Library.
- Worker unit tests mock transport only to stress cancellation, stale-worker messages, errors/retry, deduplication and current-request priority. The separate browser checks execute real WASM cancellation and recreation.

## Live network coverage

`tests/live-network.cjs` used **real PeerJS signaling and two independent browser contexts**. Successful create/join, synchronized opening roll and checker turn, double/take, guest refresh/rejoin, third-player rejection, duplicate-tab identity rejection, host-page disappearance, host migration, and original-host return/confirmation. The rolled dice and entire canonical state were unchanged across recovery. There were no page errors. Recovery screenshots show the paused and resumed states. This does not prove every NAT/firewall configuration works or protect against a malicious host.

## Visual inspection

Captured and visually inspected all five routes at **320×568, 375×667, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1366×768, 1440×900**. Inspected full-size key screenshots and contact sheets covering the complete viewport matrix. Additional inspected states: local setup, active draft, cube offer, computer match completion, Trainer before/after, Solver editing/results and mobile result drawer, Library empty/populated, engine loading/error, and live multiplayer disconnect/recovery. Inspected discovery additions on the homepage and existing hubs.

Chromium layout assertions found no horizontal document overflow across that matrix. Play/Trainer/Solver primary controls remained visible, with no document scrolling at ordinary text sizes for the common viewports. The 320-pixel case is allowed modest vertical reflow. The hub and long Library content can scroll normally. Tests also cover touch source/destination selection, long names, keyboard/Enter/Escape dialog operation, reduced motion, a short keyboard-like viewport, and an effective 200% desktop zoom viewport. These are **emulations**, not tests on an actual iPhone/Android device or with an actual mobile keyboard. Native dialogs, the accessible move selector, focus outlines and point labels were inspected; this is not a full external WCAG audit.

A zoom/short-landscape inspection caught action-area overflow below 700 pixels; the side layout was corrected and the horizontal-overflow assertion added. Mobile labels and the player/board grouping were refined after screenshot inspection. Notes containing HTML-like text remain literal text.

## Offline detail

Chromium and Firefox completed navigation and fresh engine analysis after Playwright's network-offline switch. WebKit's switch caused an internal browser error **before service-worker interception**, including ordinary cached fetches. To distinguish that harness behavior from the app, the WebKit test stopped the HTTP server instead: cached navigation and analysis passed. The cache was verified to contain the complete matching engine triplet. No real-device suspension/background continuation is claimed.

## Measurements

Offline unit tests additionally verify the complete engine triplet against manifest SHA-256 digests, reject incompatible updates without caching partial assets, retry after failure, and preserve other families' caches. Artifact tests verify every offline manifest entry exists in the assembled site and exclude local test screenshots/reports.

Environment: **Apple M4 Pro, arm64 macOS, Chrome 154**, local HTTP, no CPU throttle. HTTP cache disabled for startup tests; the browser may reuse compiled WASM. `benchmarks.json` contains every sample, with network transfer separated from compilation and initialization. This is not a WAN/download-speed or real-phone measurement.

- Fresh-worker startup, 10 samples: median **19.8 ms** total (12.3 ms asset transfer, 0.3 ms compilation, 7.1 ms initialization; component medians need not sum exactly).
- Cold engine computation, five samples per position/setting: Quick medians **0.1–1.4 ms**; Standard **0.9–33.2 ms**; Deep **1.2–366.1 ms** for opening/contact/race/bearoff/cube representatives. Small samples report min/max, not p95.
- Warm GNUbg internal-cache samples are separately recorded. Quick/Standard use 30 samples, so median and p95 are supplied. They must not be presented as cold computation costs.
- Thirty touch-selection/frame samples: approximately **16.7 ms median / 18.2 ms p95** in the appearance refinement interaction run. See `interaction-benchmark.json`; this measures dispatch to the next animation frame, not a universal latency guarantee.

Reproduce with the commands in the family README. Screenshots and browser-run JSON are local ignored artifacts in `backgammon/test-results/`; the durable benchmark data and this record are committed.

## Checker interaction refinement

The shared board now supports mouse, touch and pen pointer dragging as well as tapping. `tests/checker-ux.cjs` runs inside the assembled-site browser suite (including deployment CI). Chromium, Firefox and WebKit passed the focused opening and checker scenarios: separate die reveals, ties, retained opening results, refresh without rerolling, legal-source rings, die-labeled destinations, blocked taps, invalid drops, pointer/Escape cancellation, both orientations, no duplicate click after drag, bar entry, hits and undo, ambiguous bearoff choices, doubles, forced passes, tall stacks, spatial keyboard navigation and reduced motion. A real GNUbg computer opening waits for acknowledgement; taking the next action during opponent playback restores the exact committed board.

Chromium additionally sends a touch pointer stream through the browser's input dispatcher, tests touch dragging without document scrolling, and captures opening/active-play screenshots across all nine viewport classes. The common layouts keep the board and primary action together; 320×568 allows the existing small amount of vertical reflow. Full-size screenshots and viewport contact sheets were inspected, including a lifted touch checker and its highlighted drop region. These are automated interaction checks and visual inspection, **not a study with recruited beginners or physical-device testing**.

The updated application also completed a real computer match (84 committed events, 21 human decisions), replayed and saved it, and repeated the live two-context PeerJS test through cube take, rejoin and host recovery. No game rules, engine settings, or wire protocol changed.

## Board themes and color editing

Added six coordinated presets and 34 hex/color-picker roles. `tests/appearance.test.mjs` covers hex normalization, malformed/CSS input rejection, legacy settings, invalid stored data, preset coverage and basic contrast checks. Each preset meets 4.5:1 for the tested label, pip, count, cube-number and destination-number pairs; the custom editor reports low contrast without changing a user's chosen colors. These checks are not a full WCAG audit.

`tests/appearance.cjs` runs inside the assembled-site suite in Chromium, Firefox and WebKit. It verifies rendered SVG and dice colors, invalid edits retaining the last valid color, reset/undo, picker input events, readability feedback, every color role's connection to a rendered property, persistence across refresh and all family pages, cross-tab updates, independent display preferences, and preservation of the exact current draft, committed dice and history. The full real-engine/gameplay/offline browser suite also passed all three browsers after this integration. Engine and network protocols are unchanged.

Captured and inspected the theme picker and color editing across all nine viewport classes above, plus the short 390×420 keyboard-like viewport. Hex fields remain reachable with 16px text and 44px controls; the landscape preview remains visible as the controls scroll. Inspected every preset in full Play on desktop and mobile, using full-size key screenshots and contact sheets. Touch, keyboard, reduced motion and effective-zoom checks passed again. Native color-picker events were exercised in automation; no physical phone or native mobile keyboard testing is claimed.
