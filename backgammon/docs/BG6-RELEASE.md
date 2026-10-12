# bg6 native engine release

**GNUbg Core `955555c69adebb1d7de23abc1018074158621168+bg6`** reduces native computation while retaining the existing model and search policy. The precomputed opening/reply/third-turn book remains the original bg5 calculation. Its results are labeled bg5; fresh calculations are labeled bg6.

## Implementation

Three measured optimizations are combined in `engine/source/native-search-bg6.patch`:

- Calculate four independent output neurons together with ordinary WASM SIMD. A small packed copy of existing output weights preserves each neuron's accumulation order and leaves the original serialization format intact.
- Calculate four hidden activations together, retaining the original sigmoid approximation, constants, cutoff and arithmetic order.
- Replace linear duplicate-move lookup with an 8,192-slot index. Full seven-word position keys resolve collisions; insertion order and the first legal move path are retained. Generation counters avoid repeatedly clearing the 64 KiB index. They reset for each generation and whenever maximum-dice filtering replaces the list; wraparound clears the counters.

The index is larger than the native move buffer's 3,875-entry bound. It has the same non-reentrant lifetime as that buffer; the application serializes one calculation per single-threaded worker. The scalar fallback also uses the index. The additional neural SIMD is confined to the SIMD build.

Packed weights add about 6.6 KiB across the six networks. If this optional allocation fails, evaluation uses the original output loop. Destruction releases the copy; original output-major weights remain available for saving. Required original network allocations retain upstream behavior.

Weights, bearoff/MET data, search depth, pruning, candidate filters, RNG and rollout policy are unchanged. No fast-math, relaxed SIMD, threads or cross-origin-isolation headers are introduced. These changes improve implementation speed; they are not evidence of a stronger neural model or increased playing strength.

## Exact-release timing

The [machine-readable release record](bg6-release.json) keeps executable/data/evaluator hashes, canonical positions, all paired times and hashes of numerical results. These measurements use the final, uninstrumented bg6 assets, including the allocation fallback and deterministic link order. Experimental predecessor measurements remain in [NATIVE-SEARCH-PILOTS.md](NATIVE-SEARCH-PILOTS.md).

Apple M4 Pro, macOS/Darwin 25.5 arm64; Chromium 145 and desktop WebKit 26. Five alternating baseline/candidate pairs per case and depth, fresh worker/native caches for each arm. Startup is recorded separately. Browser HTTP/compilation caches can be warm. Timed runs were sequential, with other applications still active. These are not physical iPhone measurements.

Three-ply computation medians, **bg5 → bg6**, in milliseconds:

| Case | Chromium | WebKit |
| --- | ---: | ---: |
| Opening | 1,797 → 1,599 | 1,990 → 1,669 |
| Contact | 745 → 660 | 803 → 680 |
| Race | 115 → 102 | 127 → 106 |
| Cube | 303 → 266 | 326 → 274 |
| Doubles | 2,269 → 2,018 | 2,429 → 2,056 |
| Match score | 792 → 718 | 847 → 742 |
| Small bearoff | 5.4 → 5.5 | 6 → 7 |

For these seven cases, summing the measured computation times gives a 9.3% three-ply reduction in Chromium and 13.7% in WebKit; two-ply totals fell 7.2% and 13.4%. This is the workload's observed total, not a prediction for an arbitrary game distribution. Small bearoff calls did not improve and can regress by about a millisecond. Five samples support exploratory medians, not a reliable p95. All 140 timed comparisons returned identical recorded numerical results and best decisions.

The separate 300-position two-ply run passed with zero recorded numerical differences and identical best decisions. It is a functional cross-release check: one pair per position, overlapping other checks, so its timings must not be used as latency estimates. The Auto policy still requires at least two plies, normally attempts three, and uses observed timings to estimate the next stage. This release does not guarantee a one-second result.

## Native and lifecycle checks

The diagnostic build is separate from the timed/distributed executables. It adds test-only bindings and allocation failure injection; their hashes are recorded independently.

- 6,144 seeded neural cases cover all six networks and compare full/incremental execution with the corresponding baseline mode. Recorded outputs match exactly; this does not assert identical rounding between full and incremental arithmetic themselves.
- 334 authored/reference boards × 21 rolls × full/partial generation = 14,028 native move cases. All 405,696 ordered entries, move paths and maximum dice/pip counts match bg5. Tests exercise 4,856 hash collisions and repeated counter wraparound with a populated index.
- 1,536 binary load/evaluate/save/destroy cycles cover all six networks. Half force the packed-weight allocation to fail. Output and saved bytes remain identical; measured allocated-heap change is zero after each warmed group. Repeated destruction is checked. This measures allocations visible to `mallinfo`, not arbitrary browser memory or every upstream allocation failure.
- All 34 study fixtures were freshly rescored with the actual bg6 assets. Their ordered candidates, equity and probabilities matched the previous bg5 results exactly.

`validate-engine-release.cjs` serves the real assembled `_site` without substituting binaries. It checks scalar/SIMD numerical parity, money/match/cube/player context, arbitrary grading, seeded rollout/resume/cancellation, cache isolation, failed loading/fallback/retry and queued-draft immutability in Chromium, Firefox and WebKit. The full application browser suite and the opening-book suite separately exercise Play, Trainer, Solver, direct links and downloaded offline book entries.

All three browsers passed **645 native comparisons** (maximum scalar/SIMD difference 0.00000006), **15 cache-context comparisons** (maximum 0.00000078), **30 loading/fallback cases**, and **54 hint-reuse comparisons** (maximum 0.00000154), plus queued-draft isolation. Tolerances remain 0.00001 for native/context and 0.00002 for reuse. The repository suite passed **348 tests**, including deployment, historical provenance and pinned-input validation.

The full assembled Chromium application suite also passed, including real WASM, automatic depth selection, checker/cube interactions, mobile layouts and controls, keyboard/touch, history and review, persistence, cancellation, offline behavior and safe service-worker updates. Its report records 55 primary screenshots plus screenshots from the individual suites; the release record preserves its hash. This does not claim a new live PeerJS signaling test.

## Historical book and resumability

The book retains all 28,659 decisions, including 27,258 third-turn decisions at 1,298 distinct boards. Its 0.040 near-best window and two-ply candidate screening are unchanged. See [OPENING-BOOK.md](OPENING-BOOK.md) for the exact coverage boundary; fourth-turn coverage remains partial.

Generators now use an independently pinned bg5 input bundle rather than whichever native engine happens to be deployed. The recipe includes every transitive evaluator module, native hashes and original commit. The unchanged 9.8 MB data package is verified and shared. The generator needs neither Git history nor a compiler. Current rule/encoding hashes must still match before planning. Tampered inputs are rejected.

The original scoring signature is unchanged. A completed `--plan` reuses all **27,930 later-turn decisions**, with **zero missing** and no WASM startup. Historical results are never relabeled as newly computed bg6 analysis. Engine/cache versioning separates new native results and rollout checkpoints from older engine versions.

All **28,659 decisions** passed again in each of Chromium 145, Firefox 146 and WebKit 26. All **42 sampled live bg6 3-ply comparisons** passed (maximum difference 0.00000024), including mirrored players and cube scaling. Direct third/fourth-turn Solver links, book-backed bot turns and downloaded entries after an offline reload passed. Seven screenshots were inspected: desktop and phone-width third-turn Solver results in all three browsers, plus Chromium phone-width Play. Phone widths are emulation, not device testing. The separately pinned generator worker also reproduced every ranked move in opening/reply/third-turn samples within 0.00000004.

## Rebuild and reproduce

Use the pinned Emscripten 4.0.15 toolchain and [ENGINE.md](ENGINE.md). The bg6 source archive contains all modified source, original data, licensing and both build variants. Source order is sorted; the archive has deterministic timestamps/ownership and excludes macOS metadata files. A fresh archive extraction reproduced both loaders, both WASM executables, shared data and the source archive byte-for-byte. `engine/assets.sha256` records published hashes. Production source/loaders contain no diagnostic bindings.

```sh
sh backgammon/scripts/build-engine.sh
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
BG_OUTPUT=backgammon/test-results/bg6/release-validation.json \
  node backgammon/scripts/validate-engine-release.cjs
BG_BOOK_OUTPUT=backgammon/test-results/bg6/book-browser \
  node backgammon/tests/opening-book-browser.cjs
node backgammon/tests/browser.cjs
node backgammon/tests/book-generator.cjs
node backgammon/scripts/build-continuation-book.cjs --plan
node scripts/run-tests.mjs
```

For paired release timings, set `BG_BASELINE` to the pinned book input directory's `backgammon/engine/vendor/simd` and `BG_CANDIDATE` to the repository's `backgammon/engine/vendor/simd`. `require('./backgammon/scripts/book-inputs.cjs').resolveBookInputs()` resolves/verifies the former. Run `native-search-pilot.cjs` with `BG_SAMPLES=5`, then repeat with `BG_BROWSER=webkit` and a distinct output path. Use `BG_CORPUS=1 BG_PRESETS=deep BG_SAMPLES=1` for the 300-position functional comparison. Both arms use the same current JavaScript evaluator; native executable hashes distinguish the historical bg5 baseline from bg6.

To reproduce diagnostic checks, extract the bg6 source archive to a separate temporary directory, run `patch-native-probes.py` and `patch-lifecycle-probe.py` on it, then build its SIMD variant. Compare with an instrumented bg5 baseline using `check-native-probes.cjs`, `BG_REQUIRE_LIFECYCLE=1` and explicit `BG_BASELINE`/`BG_CANDIDATE`. These instruments must never be applied to distributed assets. `summarize-engine-release.cjs` creates the durable record only from completed reports and refuses failed/incomplete checks.
