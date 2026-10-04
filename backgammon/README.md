# Backgammon

A static, board-first family at <https://mathewseng.github.io/backgammon/>. Real entry points: `play/`, `trainer/`, `solver/`, `library/`. No framework or application build step. Development-only Playwright is pinned in the root package manifest.

## Run and check

```sh
npm ci
node scripts/run-tests.mjs
sh scripts/assemble-site.sh _site
npx playwright install chromium firefox webkit
BG_BROWSERS=chromium,firefox,webkit node backgammon/tests/browser.cjs
# A separate, genuinely live signaling test (serve the repository or _site first):
python3 -m http.server 8765
BG_BASE_URL=http://127.0.0.1:8765 node backgammon/tests/live-network.cjs
node backgammon/scripts/benchmark.cjs
```

On macOS an existing Chrome may be selected with `CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`. Browser screenshots/reports go to ignored `test-results/`. The deployment job runs Chromium integration against `_site`, including actual WASM and offline use. `scripts/assemble-site.sh` includes **only** `/backgammon/solver/` before excluding other `solver` directories. Its artifact test verifies the routes, dependencies, license and engine source archive, and the continued exclusion of blackjack development source. No existing route moved.

## Architecture and controls

- `core/rules.mjs`: pure state validation, complete-turn enumeration, movement, opening roll, cube, match/Crawford scoring and replay. No random generation inside transitions. Live dice use cryptographic rejection sampling; tests inject a seeded source.
- `core/xgid.mjs`: strict standard XGID parsing/serialization. Uppercase is Ivory (GNU player 1); fields include dice, cube, turn, score, match and Crawford. Rejects unsupported flags rather than guessing.
- `core/protocol.mjs` and `play/network.mjs`: host-authoritative protocol over the unchanged `shared/peer-room.js`.
- `ui/board.mjs`, `ui/shell.mjs`, `ui/analysis.mjs`, `styles.css`: one SVG board, shared draft controller, semantic controls, dialogs, settings and analysis display.
- `engine/`: pinned GNUbg, dedicated module worker, full-context adapter and a single-worker priority queue. Worker termination implements actual cancellation. Pending work is rejected; stale UI results are discarded. LRU cache is limited to 64 complete results; queue to 32 jobs. No unbounded persistent evaluation cache.
- `core/storage.mjs`: version-1 IndexedDB for items, recoverable work and spaced-review progress. Small display preferences use `backgammon.v1.*` localStorage. Notes/names are text, never HTML.

Ivory moves from canonical point 24 toward 1; Teal the opposite way. `points[0]` is Ivory's point 1, with positive Ivory and negative Teal counts. `bar` and `off` are indexed `[Ivory, Teal]`. Orientation changes rendering only. `turn` is the player on roll (also the doubler during a response); the other player responds to cube/resignation offers. `dice` stores the original pair; doubles expand only during move generation. `sequence` increases on committed actions. Match length zero means an unlimited points session. The explicit schema also includes cube ownership, scores, Crawford history, phase, pending offer, game number and result.

Tap/click a source and then a highlighted destination. If both dice can bear off to the same tray, choose the die in a dialog or set a preferred die. Undo and Reset affect only the draft. Confirm submits a full legal turn or a forced pass. The accessible move selector in Details offers every legal next step. Board controls support Tab, arrows, Enter and Space. Point targets are deliberately distinct; on phones they are **not** 44 pixels wide. The alternative selector provides larger targets. Settings persist point numbering, orientation and motion preference. Dark is the only appearance. Browser zoom remains enabled.

The mobile Details/Results drawer contains secondary controls. Normal play/training keep the board and primary action together. The smallest viewports and enlarged text may scroll. Native dialogs manage focus and Escape. Navigating away from a live room or a draft asks first. Local draft work is recoverable; committed human takebacks are not enabled.

## Engine, evaluation and licensing

Upstream: <https://github.com/ascottix/gnubg-core>, pinned to `955555c69adebb1d7de23abc1018074158621168`, web binding **bg1**. Distributed loader/WASM/data are built with **Emscripten 4.0.15**, `-O2`, no pthreads. Cross-origin isolation is unnecessary. The data archive contains neural weights, bearoff databases and Kazaross-XG2 match-equity data. Asset checksums and detailed build notes are in `docs/ENGINE.md` and `engine/assets.sha256`.

Quick = 0 ply, Standard = 1 ply, Deep = 2 ply. All use cubeful, deterministic evaluation, pruning, zero noise. The adapter enumerates **all legal resulting positions** and calls GNUbg `ScoreMove` for every one at the same depth and original cube/match context. This avoids the upstream 40-hint limit and mixed-depth comparisons. A submitted move is validated as a complete legal path, mapped by resulting board, and evaluated identically. Equivalent sequences receive the same grade. Cube analysis uses GNUbg's cube decision evaluator with beavers disabled.

Results retain engine revision, settings, request ID, full position key, completion status, computation time, perspective, cubeful and cubeless equity, five nested probabilities and match-winning probability where applicable. Gammon includes backgammon. Money equity uses current-cube units; match equity differences are normalized GNUbg match equity. Main match results show match-winning chance. Small differences are estimates, not certain blunders. Nothing is labeled XG PR. Quick results are completed evaluations; choosing another depth runs another completed calculation. There is no fake streamed result or confidence interval.

New code inside `backgammon/` is GPL-3.0-or-later to keep the combined engine application compatible. This does **not** change the license of unrelated website code. GNUbg and ascottix notices are preserved in the distributed corresponding-source archive. `COPYING.txt`, `licenses/GPL-3.0.txt`, and Settings → About link the license and source. The original site's PeerRoom and hub code retain their existing terms.

## Play, study and persistence

Computer, same-device and private two-player online modes use the same rules/board. Supported sessions: common match lengths through the UI, up to 25 in edited positions, or unlimited points. Doubling, takes, passes, redoubles, gammons/backgammons, resignations, Crawford and post-Crawford are implemented. Computer strength maps directly to the documented engine depths. Optional tutor feedback saves the full original decision and may warn before confirmation. Computer resignation responses use the engine in money play; in match play it conservatively accepts a guaranteed match win or the maximum three-point multiplier.

Trainer has 34 engine-scored seed positions: 15 openings, six contact, five races, five bearoffs and three public cube fixtures. Non-opening board positions come from legal seeded replay, with the complete generation history stored as provenance. They are **not expert-authored strategic lessons**. Fresh on-device evaluation grades submitted decisions. Answers and rankings remain hidden until submission; hints and skips are separate. Spaced review advances through 1, 2, 4, 7, 14 and 30-day intervals. New users see no invented statistics. Saved mistakes/exercises form a personal practice set.

Solver edits checker placement by explicitly transferring checkers to/from the off trays, or through signed exact point counts. Context has bar/off, dice, side, cube, score, match and Crawford controls. Invalid drafts stay editable and cannot reach WASM. Candidate previews never overwrite the source. Positions can be shared by XGID URL, annotated, saved, made into exercises, or played forward as separate local games. Match review replays application JSON and a strict public text MAT subset, with progressive checker/cube analysis and decision-error navigation.

Library supports search across names/notes/tags, collections, rename, notes, confirmed deletion, per-item exports and validated atomic backup merge/replace. Limits: 8 MB per backup, 2 MB per item, 2,000 imported items. All work is local to this browser; storage can be evicted and is not cross-device backup. Export important work.

## Online assumptions

Unique `backgammon-v1` namespace, two seats, PeerJS 1.5.2 using the site's existing signaling configuration. No accounts/backend. The host validates seat, action, session ID, epoch, expected revision and action ID. Dice are generated only on acceptance and stored in history. Draft moves are local. Duplicates do not reroll; stale/out-of-order actions fail with a message. Snapshot revisions/hashes and a host epoch are application-level metadata independent of transport revisions. The hash detects accidental divergence; it is not a security signature.

After host migration the game pauses. Both original seats must agree on the last checkpoint before resuming. Conflicting histories remain paused rather than being silently merged or rerolled. No future random seed is sent. Reconnect uses the saved identity; duplicate live identities and third players are rejected. Explicit Leave closes the room; this differs from recoverable host disappearance. Saved histories can be exported for manual recovery. Restricted networks may block signaling/WebRTC. This is casual P2P play, not cheat-proof competition. Engine assistance is disabled in online rooms; agreed assisted practice rooms are not yet implemented.

## Offline and updates

`sw.js` is registered only by Backgammon tools and scoped to `/backgammon/`. It uses only `backgammon-assets-*` caches. Shell/data files are installed together; the complete matching engine triplet is cached when engine use first requests it. The hub never starts or preloads the engine. The small shared dependencies are cached only for controlled Backgammon pages. Other families are neither controlled nor purged.

Run `node backgammon/scripts/offline-manifest.mjs` after changing shipped files. Content-derived cache versions and SHA-256 verification of the entire engine triplet prevent mixing old and new engine data. Updates wait for open controlled tabs to close: no `skipWaiting`, forced reload, or unexpected match interruption. Offline availability requires successful initial setup and engine caching. Multiplayer needs a network. Mobile browsers may suspend workers; completed work is saved, but background analysis after suspension/closure is not promised.

## Exact limits

- No rollout UI or confidence intervals. Upstream retains rollout routines, but its `SetRNG`/`ProcessEvents` hooks are stubs and its rollout context is global; this release does not distribute a validated rollout binding. Deep means tree evaluation only.
- No Jacoby, beavers, automatic opening doubles, committed takebacks, GNU position/match IDs, proprietary binary match imports, or commercial-application parity claim.
- MAT import is a tested fixed-column GNUbg/Jellyfish subset. It handles checker moves, bar/off, counts/chains, forced passes, doubles/takes/drops, scores and ordinary win summaries. Edited games, nonstandard columns, special-rule records and ambiguous terminal resignation records fail with a line-specific error. See `docs/FORMATS.md`.
- Match review shows checker and cube losses in normalized equity and filters evaluated errors. Cross-engine performance ratings are not implemented.
- No expert review/classification of advanced tactics such as blitz/backgame/holding/priming is claimed. Only directly supported topic labels are exposed.
- Browser emulation is not real-device testing. See `docs/VALIDATION.md` and `docs/benchmarks.json` for observed coverage and timings.
