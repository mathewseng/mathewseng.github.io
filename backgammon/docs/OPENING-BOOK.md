# Historical opening book with full near-best third-turn coverage

The current opening guide and compatible first/second-turn analysis prefer the
[five-ply book](DEEP-OPENING-BOOK.md). The historical data documented below is
preserved unchanged for later turns, comparison and download fallback.

`engine/opening-book.mjs` serves genuine, precomputed GNUbg **bg5**, 3-ply checker evaluations before the engine worker starts. It is shared by Play (computer, hint and review), Trainer and Solver. Online play retains its existing prohibition on engine assistance.

## Coverage and strength

- All **15 unequal opening rolls**, both players and either dice order. Every legal resulting opening board is evaluated at 3 ply; equivalent step orders share an entry.
- Every opening within **0.040 current-cube equity** of the best 3-ply opening is included, not only the first-ranked move. That produces **34 distinct opening boards**, with every one of the **21 reply rolls** (including doubles): **714 replies**.
- **Full third-turn coverage within the stated near-best window:** all 21 rolls at **1,298 distinct third-turn boards** after every qualifying opening and every evaluated reply within 0.040 equity of best. This adds **27,258 third-turn decisions**. The existing **32 selected fourth-turn boards** and their 672 decisions are retained, giving **28,659 decisions total**. Fourth-turn coverage remains partial. Here a turn means one player's complete turn, not a die or a search ply. The table still evaluates each position at **3 search plies**, including fourth-turn positions.
- Reply and later-turn generation first scores every legal result at 2 ply. It retains at least the top ten, plus **every** candidate within 0.080 of the 2-ply leader, with no count cap. Each retained candidate is then evaluated at 3 ply. The table ranks only these consistent-depth results; screened-out moves can still be better. This is tree evaluation, not a rollout, proof of optimality, or proprietary opening database.
- Entries override Quick, Standard, Deep, Expert and Auto **at these positions only**. Actual settings say **Opening book · 3 ply**, and preserve the requested preset. Research (4 ply) and rollouts always compute live. Auto returns the completed 3-ply entry rather than manufacturing intermediate depth updates or timing forecasts.
- An arbitrary legal submitted opening is covered because openings are exhaustive. If a submitted reply is outside the 3-ply shortlist, the normal live search evaluates that move and alternatives at the requested settings together. It never subtracts a 2-ply actual equity from a 3-ply book leader.

The 0.040 opening window defines “near-best” for this book; it is not a confidence interval. `index.json` records each qualifying opening's steps, loss and reply-shard identity, as well as every evaluated opening, engine revision, native asset hashes, settings and generation timestamp.

## Later-turn selection and growth

`book-branches.mjs` deterministically enumerates every qualifying reply after all 34 near-best opening boards, merges transpositions and includes all 21 dice combinations for each distinct third-turn board. The 1,357 qualifying reply paths produce 1,298 distinct boards. There is no position-count cap or probability cutoff. A stored legal parent path makes every board reproducible; `paths` counts qualifying histories rather than inventing probabilities for human choices among near-best moves.

The 32 previously published fourth-turn boards are preserved with identical evaluations. Their canonical boards and legal parent paths are retained in `scripts/retained-fourth-boards.json`, so rebuilding the opening/reply index from scratch does not lose that coverage. They were selected from the original 64-board third-turn subset by following the best-ranked move and weighting fair dice; this release does not expand fourth-turn coverage or imply that other fourth-turn positions are unimportant. Positions outside the lookup table continue to use live analysis.

[Recorded branching counts and build metadata](opening-book-growth.json) from the current reply table:

| Allowed opening / reply | Distinct third-turn boards | Decisions with all 21 rolls |
| --- | ---: | ---: |
| Best opening, best reply | 303 | 6,363 |
| All 34 near-best openings, best reply | 684 | 14,364 |
| All 34 openings, replies within 0.020 equity | 959 | 20,139 |
| All 34 openings, replies within 0.040 equity | 1,298 | 27,258 |

These counts use the evaluated reply shortlist, not uncomputed alternatives. Exhaustive fourth-turn coverage grows again: even one chosen move for every third-turn decision can create up to 21 further roll decisions per branch before transposition deduplication. Full fourth-turn generation is a separate expansion; it is not required to cover every third-turn board. `inspect-book-growth.mjs` reproduces the measured counts without running WASM.

The continuation generator uses **one atomic checkpoint file per board**, holding at most 21 results. It flushes and replaces that small file after each completed decision. It never rewrites the entire growing book. Eight independent workers run by default, with one active board per worker and a cursor-based queue. Checkpoints live under ignored `test-results/book-checkpoints/<scoring-signature>/`.

The scoring signature includes the engine revision, exact native source/data hashes, evaluation settings, rule context and scoring-worker source. Coverage policy and book version are separate: widening coverage reuses completed, identically scored boards. Existing published results are imported only after verifying their source context, shard version, SHA-256 and legal moves. Resume verifies checkpoint checksums and board identity; changed numerical inputs use a separate directory. A process lock prevents concurrent writers, and a dead process's lock can be recovered. Interruptions finish and save in-flight jobs; abrupt termination can lose only in-flight work, not completed boards. A hung evaluation has a timeout and leaves its decision unfinished for retry.

Publication is staged separately and validates every planned roll before replacing the data directory. The preceding data directory remains in the checkpoint directory as `previous-publication` for recovery. A small publication journal restores the previous complete directory if the process stops between the two directory renames. The deployment never includes checkpoints or a partially generated book.

## Exact context matching

The book covers the site's default **unlimited-points money game, cube enabled and centered, Jacoby enabled, immediate redoubles disabled**. Matches, Jacoby off, no-cube play, owned cubes, pending offers and beaver/raccoon rules fall back to the engine. Never reuse these numbers at a match score.

Canonical book coordinates always have the roller as White moving from 24 toward 1. The adapter mirrors points, checker signs, bars and off counts for Black, then maps moves back into the original state. Dice order is irrelevant; complete legal paths are validated before returning a result. Result identity and perspective always use the caller's original full state. Previews do not mutate it.

Current-cube equity in this centered money context is invariant under absolute cube scaling. Thus opening ties that raise the cube to 2, 4, …, 1024 still use the same entries; session score totals and the earlier automatic-double limit do not alter the decision. Native tests compare multiple cube values and mirrored players. After the index loads, an exact normalized-board membership check rejects positions outside the book without any shard download. This preserves the ordinary engine hint/grade cache for later play. A fresh direct Solver link can discover a covered third/fourth-turn board without reconstructing its history.

## Loading, offline behavior and failure

Evaluations are split into one file per board, each containing 21 rolls. The index contains exact board identities and metadata. Play prepares the relevant shard from the committed position before the next roll; the full book is never downloaded for a single game. No WASM is required for a book hit. The first uncached lookup still needs a file transfer; “instant” refers to already loaded entries, not arbitrary network conditions. The complete release is **28.44 MB raw / 9.66 MB gzip**, summing compression of individual files. The index is about **521 KB raw**, and the largest board shard is **23.7 KB raw**. Exact counts are recorded in `opening-book-growth.json`; gzip measurements are file-size measurements, not a claim about a particular network connection.

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

The book generators use pinned bg5 SIMD WASM in quiet Chromium workers, independently of the current live engine. `scripts/book-inputs-bg5.tar.gz` contains the exact historical loader/WASM and all transitive JS evaluator modules, with hashes and the original commit in `book-inputs-bg5.json`. The unchanged shared data package is verified separately, avoiding another 9.8 MB copy. `book-inputs.cjs` materializes these inputs under ignored `test-results/book-inputs/`; it needs neither Git history nor a compiler. `BG_BOOK_INPUT_ROOT` can select an existing directory only if every pinned file matches. Current rules/encoding must also match the recipe. The scoring signature and completed checkpoints remain unchanged. Book results continue to report bg5 while live results report bg6. `BG_BOOK_WORKERS=1` through `16` changes build concurrency (default 8); it does not change analysis depth or introduce multithreaded browser WASM. Useful commands:

```sh
# Validate inputs, import existing results and report work remaining, without publishing.
node backgammon/scripts/build-continuation-book.cjs --plan
# Gracefully stop after at least 8 new decisions, to exercise resume.
BG_BOOK_STOP_AFTER=8 node backgammon/scripts/build-continuation-book.cjs
# Resume normally; completed results are reused.
node backgammon/scripts/build-continuation-book.cjs
```

Other in-flight workers may finish after the stop threshold. SIGINT/SIGTERM also stop gracefully. Re-running a complete build's `--plan` reports zero missing decisions without loading WASM. The numerical scoring signature is independent of worker count. Change the shared `BOOK_ID` for a published coverage/format change and regenerate the offline manifest after publication. Build timestamps and durations are not numerical provenance; compare evaluation values with the tested tolerance.

`tests/book-generator.cjs` runs the pinned generator worker on opening, reply and third-turn positions and compares every ranked result with the published table. It does not modify checkpoints or publication. The pure suite checks all 28,659 decisions, legal paths, exhaustive near-best opening coverage, every reply roll, both players, rule exclusions, arbitrary grading, version/failure handling, worker-free dispatch and cancellation. The browser suite serves `_site`, checks every book position, compares opening, reply, third-turn and fourth-turn sampled values against live GNUbg at 3 ply within 0.00001, tests unsupported-context fallback, measures first-transfer versus warm lookup latency, and captures desktop/mobile Solver views in Chromium, Firefox and WebKit. Screenshots and raw observations are written to `test-results/opening-book/`. These are desktop-browser measurements and phone viewport emulation, not real iPhone measurements.

The generator and adapter are GPL-3.0-or-later, under the Backgammon application's existing license. The book was generated with the pinned engine and bundled weights; no external lesson or opening database was copied. Engine source, licenses and rebuild instructions remain in [ENGINE.md](ENGINE.md).

## Validation and measured performance

`opening-book-validation.json` records the most recent assembled-site browser run, with exact book ID, environment, timing summaries and sampled native comparisons. Raw per-decision observations remain in the ignored `test-results/opening-book/report.json`. `opening-book-growth.json` records coverage and release sizes. Browser measurements use the actual WASM and book assets served locally; phone-sized screenshots are emulation, not physical iPhone benchmarks. Native cross-checks must agree within 0.00001 equity/probability. Warm lookup timings exclude transfer and include validation/client dispatch; timer-resolution zeroes are not zero computation.

For `jacoby-3ply-v3`, all **28,659 decisions passed in Chromium 145, Firefox 146 and WebKit 26**. Warm lookup p95 was **3.3 ms, 4.0 ms and 4.0 ms**, respectively, on this Apple M4 Pro. All **42 live 3-ply WASM comparisons** passed, with maximum numerical difference **0.00000024**. Direct third/fourth-turn Solver links, book-backed bot play, unsupported-context fallback, and downloaded third/fourth-turn entries after an offline reload passed. Seven screenshots were visually inspected: desktop/phone third-turn Solver results in all three browsers, plus phone Play in Chromium.

The generation release's `node scripts/run-tests.mjs` run passed **335 tests**; a later follow-up passed **341 tests** and reconfirmed zero missing decisions with `--plan`. Assembled deployment/checkpoint checks and the full Chromium application suite also passed. Keyboard integration passed in Chromium, Firefox and WebKit. Testing corrected two existing harness races: keyboard input before the persisted turn's controls were redrawn, and an asynchronous IndexedDB predicate incorrectly used with Playwright's synchronous `waitForFunction` polling. These changes wait for observable readiness; they do not change gameplay.

[Generation observations](opening-book-generation.json): **25,914 new decisions** were computed, and all **2,745 previously published decisions** were preserved numerically. The elapsed span was **90.5 minutes**, including resume/shutdown checks, on this Apple M4 Pro. Generation used eight workers initially and ten for most of the run. Concurrent per-decision worker timing averaged **2,025.6 ms**, with **2,131.3 ms median** and **2,890.7 ms p95**; these are build timings with concurrency, not single-worker or phone latency estimates. The completed generator's `--plan` reports **27,930 reused later-turn decisions and zero missing**, without starting WASM.

Resume testing exposed Playwright's automatic signal shutdown closing workers before checkpointing. The generator now owns signal handling, and a real SIGTERM/resume check passed after that correction. Unit coverage also exercises interrupted temporary writes, checksum failures, changed-input isolation, stale locks, concurrent writers, failed publication and recovery between directory renames.
