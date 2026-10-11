# Opening and first-reply book

`engine/opening-book.mjs` serves genuine, precomputed GNUbg **bg5**, 3-ply checker evaluations before the engine worker starts. It is shared by Play (computer, hint and review), Trainer and Solver. Online play retains its existing prohibition on engine assistance.

## Coverage and strength

- All **15 unequal opening rolls**, both players and either dice order. Every legal resulting opening board is evaluated at 3 ply; equivalent step orders share an entry.
- Every opening within **0.040 current-cube equity** of the best 3-ply opening is included, not only the first-ranked move. That produces **34 distinct opening boards**, with every one of the **21 reply rolls** (including doubles): **714 replies**.
- Reply generation first scores every legal result at 2 ply. It retains at least the top ten, plus **every** candidate within 0.080 of the 2-ply leader, with no count cap. Each retained candidate is then evaluated at 3 ply. The table ranks only these consistent-depth results; screened-out moves can still be better. This is tree evaluation, not a rollout, proof of optimality, or proprietary opening database.
- Entries override Quick, Standard, Deep, Expert and Auto **at these positions only**. Actual settings say **Opening book · 3 ply**, and preserve the requested preset. Research (4 ply) and rollouts always compute live. Auto returns the completed 3-ply entry rather than manufacturing intermediate depth updates or timing forecasts.
- An arbitrary legal submitted opening is covered because openings are exhaustive. If a submitted reply is outside the 3-ply shortlist, the normal live search evaluates that move and alternatives at the requested settings together. It never subtracts a 2-ply actual equity from a 3-ply book leader.

The 0.040 opening window defines “near-best” for this book; it is not a confidence interval. `index.json` records each qualifying opening's steps, loss and reply-shard identity, as well as every evaluated opening, engine revision, native asset hashes, settings and generation timestamp.

## Exact context matching

The first version covers the site's default **unlimited-points money game, cube enabled and centered, Jacoby enabled, immediate redoubles disabled**. Matches, Jacoby off, no-cube play, owned cubes, pending offers and beaver/raccoon rules fall back to the engine. Never reuse these numbers at a match score.

Canonical book coordinates always have the roller as Ivory moving from 24 toward 1. The adapter mirrors points, checker signs, bars and off counts for Teal, then maps moves back into the original state. Dice order is irrelevant; complete legal paths are validated before returning a result. Result identity and perspective always use the caller's original full state. Previews do not mutate it.

Current-cube equity in this centered money context is invariant under absolute cube scaling. Thus opening ties that raise the cube to 2, 4, …, 1024 still use the same entries; session score totals and the earlier automatic-double limit do not alter the decision. Native tests compare multiple cube values and mirrored players. A cheap unchanged-own-checkers gate avoids book lookups after the opening pair, preserving the ordinary engine hint/grade cache.

## Loading, offline behavior and failure

The index is small; replies are split into one file per opening board, each containing 21 rolls. Play prepares the relevant shard from the committed position before the reply roll. No WASM is required for a book hit. The first uncached lookup still needs a file transfer; “instant” refers to already loaded entries, not arbitrary network conditions.

The hub does not preload the book. Book files are separate from the service worker's shell and engine groups. Only requested shards are cached, with release-specific SHA-256 checks; an old active release refuses a new mismatching file. Downloaded entries work offline. The in-memory loader retains the index and up to eight shards. Loads have a 1.5-second timeout and failed downloads back off for 30 seconds; unavailable, corrupt or mismatched data falls back to the normal engine. Cancellation rejects the analysis request immediately and late lookup results cannot populate its cache. Native benchmarks disable the book explicitly.

## Reproduce and test

```sh
sh scripts/assemble-site.sh _site
node backgammon/scripts/build-opening-book.cjs
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node --test backgammon/tests/opening-book.test.mjs
node backgammon/tests/opening-book-browser.cjs
node scripts/run-tests.mjs
```

The generator uses the actual assembled SIMD WASM in quiet Chromium workers. Four workers compute independent reply positions; this is build tooling, not multithreaded browser WASM. It saves a resumable checkpoint under ignored `test-results/`, validates input hashes before resuming, and writes deployment files only after every entry completes. To rebuild after changing the inputs, move the old checkpoint out of the way. Change `BOOK_ID` and the generator's id when changing the format, policy or engine; regenerate the offline manifest afterwards. Build timestamps and timings can differ between runs; verify numerical values within the engine's test tolerance, not timestamp-byte reproducibility.

The pure suite checks all 729 decisions, legal paths, exhaustive near-best opening coverage, every reply roll, both players, rule exclusions, arbitrary grading, version/failure handling, worker-free dispatch and cancellation. The browser suite serves `_site`, checks every book position, compares sampled values against live GNUbg at 3 ply within 0.00001, tests unsupported-context fallback, measures first-transfer versus warm lookup latency, and captures desktop/mobile Solver views in Chromium, Firefox and WebKit. Screenshots and raw observations are written to `test-results/opening-book/`. These are desktop-browser measurements and phone viewport emulation, not real iPhone measurements.

The generator and adapter are GPL-3.0-or-later, under the Backgammon application's existing license. The book was generated with the pinned engine and bundled weights; no external lesson or opening database was copied. Engine source, licenses and rebuild instructions remain in [ENGINE.md](ENGINE.md).

## Measured lookup latency

[Recorded browser observations](opening-book-validation.json), M4 Pro / macOS, 729 warm decisions per browser:

| Browser | Median | p95 | Slowest |
| --- | ---: | ---: | ---: |
| Chromium 145 | 0.2 ms | 3.2 ms | 3.9 ms |
| Firefox 146 | below timer resolution | 4 ms | 6 ms |
| WebKit 26 | below timer resolution | 3 ms | 4 ms |

The first index lookup over local HTTP took 3.1 / 7 / 5 ms respectively, including transfer. Those are not Internet download timings. Warm measurements include legal-path validation and client dispatch, exclude file transfer, and use a fresh result for each position rather than the client's result cache. Zero-valued observations reflect browser timer resolution, not zero computation. Eighteen native 3-ply cross-checks across the three browsers differed by at most **0.00000002** equity/probability. Both the bot's committed opening and desktop/phone Solver views were exercised; their captured screenshots were inspected. Chromium additionally verifies a previously downloaded reply survives an offline reload without WASM.
