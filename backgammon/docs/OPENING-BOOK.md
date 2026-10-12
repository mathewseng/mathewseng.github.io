# Opening book through selected fourth-turn positions

`engine/opening-book.mjs` serves genuine, precomputed GNUbg **bg5**, 3-ply checker evaluations before the engine worker starts. It is shared by Play (computer, hint and review), Trainer and Solver. Online play retains its existing prohibition on engine assistance.

## Coverage and strength

- All **15 unequal opening rolls**, both players and either dice order. Every legal resulting opening board is evaluated at 3 ply; equivalent step orders share an entry.
- Every opening within **0.040 current-cube equity** of the best 3-ply opening is included, not only the first-ranked move. That produces **34 distinct opening boards**, with every one of the **21 reply rolls** (including doubles): **714 replies**.
- **Partial later-turn coverage:** all 21 rolls at **64 selected third-turn boards** and **32 selected fourth-turn boards**, adding **2,016 decisions** (2,745 total). Here a turn means one player's complete turn, not a die or a search ply. The table still evaluates each position at **3 search plies**, including fourth-turn positions.
- Reply and later-turn generation first scores every legal result at 2 ply. It retains at least the top ten, plus **every** candidate within 0.080 of the 2-ply leader, with no count cap. Each retained candidate is then evaluated at 3 ply. The table ranks only these consistent-depth results; screened-out moves can still be better. This is tree evaluation, not a rollout, proof of optimality, or proprietary opening database.
- Entries override Quick, Standard, Deep, Expert and Auto **at these positions only**. Actual settings say **Opening book · 3 ply**, and preserve the requested preset. Research (4 ply) and rollouts always compute live. Auto returns the completed 3-ply entry rather than manufacturing intermediate depth updates or timing forecasts.
- An arbitrary legal submitted opening is covered because openings are exhaustive. If a submitted reply is outside the 3-ply shortlist, the normal live search evaluates that move and alternatives at the requested settings together. It never subtracts a 2-ply actual equity from a 3-ply book leader.

The 0.040 opening window defines “near-best” for this book; it is not a confidence interval. `index.json` records each qualifying opening's steps, loss and reply-shard identity, as well as every evaluated opening, engine revision, native asset hashes, settings and generation timestamp.

## Later-turn selection and growth

`book-branches.mjs` is a deterministic build-time planner. It follows the best-ranked opening and best-ranked reply, weights fair opening rolls equally (1/15), weights subsequent unequal rolls 2/36 and doubles 1/36, merges transpositions, then retains the 64 highest-weight third-turn boards. Equal weights use a lexical board-key tie break. After evaluating all rolls there, it follows the best-ranked third-turn moves, merges resulting boards and keeps the 32 highest-weight fourth-turn boards. The manifest records each parent board, roll and legal move, probability weight, generation signature and actual engine source hashes.

This is a **storage/generation budget**, not a claim that unlisted lines are bad or rare in human play. The original complete reply coverage after all 34 near-best openings remains intact. The later-turn selection assumes best-ranked book play; it does not cover every near-best opening/reply combination. The 64 third-turn boards represent **27.78%** of paths under the stated best-move/fair-dice model, not a measured hit rate for users. The 32 fourth-turn boards represent **2.43%** of all paths under that model (**8.74%** conditional on reaching the selected third-turn boards). Their weights count only paths through those third-turn boards; `continuationBuild.fourthMass` records that unconditional model mass. No background engine search or extra battery use is needed for lookup.

[Recorded branching counts and build metadata](opening-book-growth.json) from the current reply table:

| Allowed opening / reply | Distinct third-turn boards | Decisions with all 21 rolls |
| --- | ---: | ---: |
| Best opening, best reply | 303 | 6,363 |
| All 34 near-best openings, best reply | 684 | 14,364 |
| All 34 openings, replies within 0.020 equity | 959 | 20,139 |
| All 34 openings, replies within 0.040 equity | 1,298 | 27,258 |

These counts use the evaluated reply shortlist, not uncomputed alternatives. Exhaustive fourth-turn coverage grows again: even one chosen move for every third-turn decision can create up to 21 further roll decisions per branch before transposition deduplication. The bounded extension keeps deployment, lazy transfers and reproducible generation manageable. `inspect-book-growth.mjs` reproduces the measured counts without running WASM.

The continuation generator has its own resumable checkpoint. Its signature includes the base evaluations, native assets, scoring worker and branch planner; mismatched inputs cannot silently resume. Rebuild both generators in order when changing the engine, evaluation policy or book version. Index membership and per-file SHA-256 hashes prevent mixed-book reuse; every selected board must finish all 21 rolls before publishing the index.

## Exact context matching

The book covers the site's default **unlimited-points money game, cube enabled and centered, Jacoby enabled, immediate redoubles disabled**. Matches, Jacoby off, no-cube play, owned cubes, pending offers and beaver/raccoon rules fall back to the engine. Never reuse these numbers at a match score.

Canonical book coordinates always have the roller as Ivory moving from 24 toward 1. The adapter mirrors points, checker signs, bars and off counts for Teal, then maps moves back into the original state. Dice order is irrelevant; complete legal paths are validated before returning a result. Result identity and perspective always use the caller's original full state. Previews do not mutate it.

Current-cube equity in this centered money context is invariant under absolute cube scaling. Thus opening ties that raise the cube to 2, 4, …, 1024 still use the same entries; session score totals and the earlier automatic-double limit do not alter the decision. Native tests compare multiple cube values and mirrored players. After the index loads, an exact normalized-board membership check rejects positions outside the book without any shard download. This preserves the ordinary engine hint/grade cache for later play. A fresh direct Solver link can discover a covered third/fourth-turn board without reconstructing its history.

## Loading, offline behavior and failure

The complete book occupies 2,828,720 bytes before compression. The index is 67,389 bytes; the largest position shard is 23,098 bytes. The index contains board identities and metadata; evaluations are split into one file per board, each containing 21 rolls. Play prepares the relevant shard from the committed position before the next roll. No WASM is required for a book hit. The first uncached lookup still needs a file transfer; “instant” refers to already loaded entries, not arbitrary network conditions.

The hub does not preload the book. Book files are separate from the service worker's shell and engine groups. Only requested shards are cached, with release-specific SHA-256 checks; an old active release refuses a new mismatching file. Downloaded entries work offline. The in-memory loader retains the index and up to eight shards. Loads have a 1.5-second timeout and failed downloads back off for 30 seconds; unavailable, corrupt or mismatched data falls back to the normal engine. Cancellation rejects the analysis request immediately and late lookup results cannot populate its cache. Native benchmarks disable the book explicitly.

## Reproduce and test

```sh
sh scripts/assemble-site.sh _site
node backgammon/scripts/build-opening-book.cjs
node backgammon/scripts/build-continuation-book.cjs
node backgammon/scripts/inspect-book-growth.mjs
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node --test backgammon/tests/opening-book.test.mjs
node backgammon/tests/opening-book-browser.cjs
node scripts/run-tests.mjs
```

The generator uses the actual assembled SIMD WASM in quiet Chromium workers. Four workers by default compute independent positions (`BG_BOOK_WORKERS=1` through `8` controls the continuation generator); this is build tooling, not multithreaded browser WASM. It saves a resumable checkpoint under ignored `test-results/`, validates input hashes before resuming, and writes deployment files only after every entry completes. To rebuild after changing the inputs, move the old checkpoint out of the way. Change the shared `BOOK_ID` when changing the format, policy or engine; regenerate the offline manifest afterwards. Build timestamps and timings can differ between runs; verify numerical values within the engine's test tolerance, not timestamp-byte reproducibility.

The pure suite checks all 2,745 decisions, legal paths, exhaustive near-best opening coverage, every reply roll, both players, rule exclusions, arbitrary grading, version/failure handling, worker-free dispatch and cancellation. The browser suite serves `_site`, checks every book position, compares opening, reply, third-turn and fourth-turn sampled values against live GNUbg at 3 ply within 0.00001, tests unsupported-context fallback, measures first-transfer versus warm lookup latency, and captures desktop/mobile Solver views in Chromium, Firefox and WebKit. Screenshots and raw observations are written to `test-results/opening-book/`. These are desktop-browser measurements and phone viewport emulation, not real iPhone measurements.

The generator and adapter are GPL-3.0-or-later, under the Backgammon application's existing license. The book was generated with the pinned engine and bundled weights; no external lesson or opening database was copied. Engine source, licenses and rebuild instructions remain in [ENGINE.md](ENGINE.md).

## Measured lookup latency

[Recorded browser observations](opening-book-validation.json), M4 Pro / macOS, 2,745 warm decisions per browser:

| Browser | Median | p95 | Slowest |
| --- | ---: | ---: | ---: |
| Chromium 145 | 0.2 ms | 3.3 ms | 7.4 ms |
| Firefox 146 | below timer resolution | 4 ms | 11 ms |
| WebKit 26 | below timer resolution | 3 ms | 8 ms |

The first index lookup over local HTTP took 2.3 / 8 / 5 ms respectively, including transfer. Those are not Internet download timings. Warm measurements include legal-path validation and client dispatch, exclude file transfer, and use a fresh result for each position rather than the client's result cache. Zero-valued observations reflect browser timer resolution, not zero computation. Thirty native 3-ply cross-checks across the three browsers differed by at most **0.00000003** equity/probability. The bot committed a legal third-turn book move; direct Solver links were exercised for both third- and fourth-turn positions on desktop and phone viewports. Captured screenshots were inspected. Chromium additionally verifies a previously downloaded fourth-turn entry survives an offline reload without WASM. All 328 repository tests passed, including deployment-artifact inclusion and release hashing. The browser measurements use `BOOK_ID=jacoby-3ply-v2`.
