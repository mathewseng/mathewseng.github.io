# Analysis ahead

Play prepares the current human checker/cube decision before Hint or Confirm, grades completed drafts, then explores likely legal continuations using the same worker and bounded result cache. This moves computation earlier; it does not make a cold GNUbg search faster or guarantee instant replies.

Current-position work uses priority −5, draft grading −4, foreground decisions 10/20, historical review −10, and speculative future positions −20. Matching requests promote/reuse in-flight work; unrelated higher-priority requests terminate the worker if needed. At most one speculative request is submitted at once. Game/position/controller/preset changes invalidate its plan. Hidden pages remove queued background requests and terminate active background computation; foreground requests remain foreground. Engine failure never changes the game or substitutes a heuristic move.

Up to three checker/cube alternatives within 0.020 equity seed a plan. For each future roll, all 21 unordered dice pairs are possible; non-doubles have twice a double’s chance weight. These weights and candidate rank prioritize preparation, not estimate win chances. The horizon includes the current checker turn and the following turn; the plan refreshes as play advances. The default bounds are 24 future evaluations, a 20-second scheduling allowance, 96 planned positions and 64 cached results. A synchronous evaluation already started can exceed the scheduling allowance. Settings → Analyze ahead disables this extra work. Online and same-device games do not prepare future decisions.

**Live dice are unchanged.** The planner never calls a random source, commits events, or reserves dice. It enumerates hypothetical rolls independently of the user’s actual decision. Random rolls, takeback replay and online recovery continue through the existing table policy. No future dice or seeds enter network messages or backups.

The client shares checker searches across reversed dice orders but re-tags completed/intermediate results with each caller’s exact position key. A completed Auto hint may grade an included finalist only if it stopped at maximum depth or the next-stage cost limit. Clear-lead stops remain ineligible, because actual-move grading disables that gate. Unlisted legal moves still get a new grading request with consistent candidate depths. Cube advice is still GNUbg-backed; the bot skips search only when doubling is legally unavailable, then rolls normally.

## Observed integration timings

Apple M4 Pro, 48 GiB, macOS 26.5.1, local assembled site, October 13, 2026. One sample per browser; fresh worker, potentially warm browser compilation/HTTP caches. Other repository tests ran concurrently. The starting board used 4–1, default money rules with beavers/raccoons, Auto review and a Quick bot. These are functional timing checks, not a phone benchmark, median, p95 or accuracy study.

| Browser | Initial preparation (startup + search) | Completed depth | Cached confirmation analysis |
| --- | ---: | ---: | ---: |
| Chromium 145 | 16.09 s | 4 ply | 0.3 ms |
| WebKit 26 | 15.38 s | 4 ply | below its 1 ms timer resolution |
| Firefox 146 | 10.98 s | 3 ply (predicted next-stage cost) | below its 1 ms timer resolution |

The player could move and undo while the real worker calculated. Hint, draft grading and confirmation reused the completed evaluation; the bot also reused the prepared cube result. A player deciding before preparation finishes will still wait for required analysis. No reduction in raw search time is claimed. [Raw integration records](prethink-results.json) include per-request priorities, depths, timings and cache outcomes.

## Validation

- `node scripts/run-tests.mjs`: 389 repository tests passed.
- `tests/prethink.test.mjs`: unbiased chance enumeration, legal near-best transitions, cube response perspective, no mutation, budget, cancellation, foreground isolation and mode/visibility exclusions.
- `tests/client.test.mjs`: reversed dice metadata, immutable results, shared foreground/background requests, Auto reuse boundaries, unlisted moves and context/depth isolation.
- Assembled Chromium/Firefox/WebKit: advanced mouse/touch/keyboard, C/D/P roles, nine viewport classes, Beginner bar entries/highlights, live Auto/fixed-depth games, prethinking with real WASM. Chromium additionally ran engine reuse/cache-context checks across opening, contact, race, bearoff, doubles and match situations.
- Screenshots inspected: 1366×768 desktop, 390×844 portrait (including the D cube badge), 844×390 landscape and Settings. Emulation, not physical iPhone testing.

Reproduce: `node backgammon/scripts/offline-manifest.mjs`, `sh scripts/assemble-site.sh _site`, then `BG_BROWSERS=chromium,webkit,firefox npm run test:backgammon:play`. For the broader interaction checks use `BG_MODULES=bar-entry,highlight-actions,touch-advanced,prethink-ui node backgammon/tests/browser.cjs`.
