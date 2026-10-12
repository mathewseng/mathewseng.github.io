# Native search experiments and request isolation

This historical investigation used deployed **GNUbg bg5** and produced a request-isolation fix and reproducible native optimization candidates. The combined candidate subsequently passed the additional memory, reproducibility and release checks documented in [BG6-RELEASE.md](BG6-RELEASE.md). Other candidates remain experimental; the measurements below retain their original executable identities.

## Shipped correctness fix

`EngineClient` now snapshots submitted checker moves and rollout options when a request enters its queue. Previously it copied the position but retained references to the caller's move array and rollout checkpoint. Editing those objects while the worker was loading or busy could change the eventual calculation without changing the job's cache identity. The fix keeps the original legal decision, trial count, seed and nested resume data together.

A regression first reproduced the changed move being sent to the worker. Unit tests now cover nested move/checkpoint edits. The assembled-site, real-WASM reuse test also queues one legal move, replaces the caller's draft with a different legal move, and checks both the calculated grade and its subsequent cached result against the original decision. This addresses reliable grading; it does not change GNUbg's playing strength.

## Where computation goes

A Chromium CPU profile of the authored contact position at four ply attributed approximately **46%** of sampled self-time to `NeuralNetEvaluate`, **18%** to `CalculateHalfInputs`, **8%** to duplicate move storage and **6%** to `SanityCheck`. Inlined work is charged to its enclosing function. These percentages describe one diagnostic position, not the entire 300-position corpus. Profiling uses an optimized `-g2` build solely to retain function names.

The [recorded results](native-optimization-pilot.json) retain canonical positions, presets, executable/data/evaluator hashes, every measured time, candidate counts, best moves, numerical-output hashes and maximum differences. Full candidate lists and CPU profiles remain under ignored `test-results/`; the scripts regenerate them.

## Experiments

| Candidate | Change | Evidence and decision |
| --- | --- | --- |
| Larger caches | Evaluation entries from 2¹⁹ up to 2²¹; pruning entries from 2¹⁶ up to 2¹⁹ | 48 searches. Some four-ply searches benefited, but others slowed. Observed WASM heap rose from 64 MiB to about 157 MiB. Keep current defaults. |
| SIMD hidden activation | Four independent sigmoid calculations, preserving the existing approximation and constants | 42 paired Chromium comparisons at two/three ply. Mixed timing results; not selected for deployment. |
| Indexed native moves | Resolve duplicate resulting boards with a 64 KiB index and full-key collision checks, preserving insertion order | 84 paired Chromium/WebKit comparisons. Mostly modest savings, with regressions/noise in some cases. Requires exhaustive native move-list differential tests before any release. |
| SIMD output neurons | Pack existing output weights into groups of four, then calculate independent output neurons together with unchanged accumulation order | 140 paired Chromium/WebKit comparisons, plus all 300 reference positions at two ply in Chromium. **440 pairs passed with zero recorded differences** in candidate equities, probabilities, match equity or tested cube outcomes, and identical winners. Promising, but not a proven production speedup. |

All builds use the pinned Emscripten 4.0.15 toolchain, the bg5 corresponding source and the same data package. No fast-math, relaxed SIMD, threads, new weights, shallower searches or narrower candidate filters are introduced. These tests measure implementation agreement, not stronger play.

Rebuilding the output-neuron candidate through `build-native-pilot.sh output` reproduced its JavaScript loader, WASM executable and data package byte-for-byte. Its experimental WASM SHA-256 is `3c3ec6eb0e02d341f8696aab89277f523328a907b2e8991302146c561bd90161`.

The repeated experiments used an Apple M4 Pro on macOS/Darwin 25.5 arm64, Chromium 145 and desktop WebKit 26. They are not physical iPhone measurements. Each arm starts a fresh worker, records initialization separately and times its first search. Repeated pairs alternate execution order. One-pair corpus comparisons are functional checks, not repeated-run latency estimates.

Background load changed substantially during the output-neuron experiments. For example, baseline contact two-ply timings moved from roughly 325 ms in earlier experiments to roughly 863 ms in that Chromium run. This prevents treating cross-run times as comparable or claiming a dependable percentage improvement. Even paired medians have noise. The cache diagnostic has only one observation per configuration; its final match/four-ply cases also overlapped an experimental compilation. None of these observations establishes the one-second latency target.

## Reproduce

Activate Emscripten 4.0.15, then run from the repository root. Builds use fresh temporary directories and never replace deployed files.

```sh
sh backgammon/scripts/build-native-pilot.sh output
# Use the printed PILOT_BUILD directory below.
BG_CANDIDATE=/absolute/PILOT_BUILD/dist_simd BG_SAMPLES=5 \
  node backgammon/scripts/native-search-pilot.cjs
BG_BROWSER=webkit BG_CANDIDATE=/absolute/PILOT_BUILD/dist_simd BG_SAMPLES=5 \
  BG_OUTPUT=backgammon/test-results/output-pilot/webkit.json \
  node backgammon/scripts/native-search-pilot.cjs
BG_CORPUS=1 BG_PRESETS=deep BG_SAMPLES=1 \
  BG_CANDIDATE=/absolute/PILOT_BUILD/dist_simd \
  BG_OUTPUT=backgammon/test-results/output-pilot/corpus.json \
  node backgammon/scripts/native-search-pilot.cjs
```

`build-native-pilot.sh` also accepts `activation`, `move-index`, `cache` and `profile`. Cache experiments use `BG_CACHE_BUILD=/absolute/PILOT_BUILD/dist_simd node backgammon/scripts/cache-pilot.cjs`. Profiling uses `BG_PROFILE_BUILD=/absolute/PILOT_BUILD/dist_simd node backgammon/scripts/profile-native.cjs`. `BG_PRESETS`, `BG_TOPICS`, `BG_BROWSER`, `BG_SAMPLES` and `BG_OUTPUT` narrow or separate native comparisons. Run timed experiments sequentially, with other heavy work stopped when practical.

`summarize-native-pilots.cjs` reads the seven completed experiment files listed in that script and produces the checked-in summary. Keep separate output paths when repeating an experiment. A failed or incomplete run is not accepted as a completed report.

Before promoting a native candidate: repeat timings under more stable load, verify Firefox and scalar fallback behavior, extend mixed-context/cache/rollout and allocation-failure checks, publish corresponding source and a distinct engine revision, and retain honest provenance for the existing bg5 book. Its stored evaluations must not be relabeled as having been generated by a new engine.

## Follow-up experiments

The [follow-up measurements](native-optimization-followup.json) keep a separate record of repeated output-neuron tests, hidden-neuron tiling, local pruning-state reuse, and a combined candidate. Earlier measurements above retain their original executable hashes and are not overwritten.

The combined candidate applies **output-neuron SIMD, hidden-activation SIMD and the indexed duplicate-move lookup** together. It preserves per-neuron floating-point accumulation order, the original sigmoid approximation, full position-key checks and generated move insertion order. The index adds 64 KiB; packed output weights add approximately 6.6 KiB. Depths, weights, match tables, search filters and the data package stay unchanged. Each worker is still single threaded.

Five paired repetitions per position/depth in Chromium 145, WebKit 26 and Firefox 146 produced **210 comparisons with zero recorded numerical differences and identical best decisions**. Median paired reductions in three-ply computation time were:

| Case | Chromium | WebKit | Firefox |
| --- | ---: | ---: | ---: |
| Opening | 9.4% | 13.7% | 7.0% |
| Contact | 11.9% | 15.9% | 22.0% |
| Race | 11.8% | 14.4% | 10.4% |
| Cube | 12.8% | 14.7% | 7.4% |
| Doubles | −6.2% | 12.6% | 6.3% |
| Match score | 6.7% | 10.9% | 7.6% |

A negative value means slower. These are medians of paired percentage differences, not ratios of the separately calculated median times. The first Chromium doubles run overlapped a substantial change in background load; a separate ten-pair repeat measured **6.6% lower doubles time** (baseline/candidate medians 2,248/2,073 ms) and **14.1% lower match time** (889/741 ms), again with identical outputs. Both runs are retained. The 5–7 ms bearoff cases showed roughly a 1 ms regression in Chromium/WebKit, where timer granularity matters. No overall weighted speedup is claimed from these seven authored cases.

Absolute Firefox times were considerably slower in this automated desktop run: the three-ply opening medians were 20,331/18,819 ms, compared with 1,883/1,726 ms in Chromium. The report records this observation without attributing it to a particular JIT or CPU mechanism. It is not a physical iPhone forecast. These results motivate a release candidate; they do not establish a universal latency improvement or the one-second target.

Two other approaches were not selected. Tiling hidden neurons into groups of sixteen reduced accumulator loads/stores but showed inconsistent timings, including regressions. A private, class-consistent incremental state for the pruning network also failed to show a dependable gain. Those pruning networks have only 8 or 16 hidden neurons, so preparing input differences can offset the saved multiplication work. These findings do not establish that either approach is unsuitable on every processor.

The native differential harness tests below the application's candidate shortlist. Across **334 authored/reference boards and all 21 rolls**, both full and partial native move generation matched the baseline: **14,028 cases and 405,696 ordered move entries**, including step paths and maximum dice/pip counts. It exercised **4,856 hash collisions** and repeated generation-counter wraparound with an already populated index. Full-key collision checks and epoch resets therefore received direct coverage.

All six actual neural networks also passed **6,144 seeded input evaluations**, each checking full and incremental execution against the corresponding baseline mode. Inputs include sparse zeroes, ones and fractional values, with changes between evaluations. Nine significant decimal digits preserve the C float outputs for comparison; the recorded outputs matched exactly. This does not claim that incremental arithmetic and full arithmetic produce the same rounding as one another.

Research-only `native-probes.c` bindings and collision counters are compiled into separate instrumented executables. Timings use the uninstrumented candidate. Neither build replaces a distributed asset. The probe report records both executable hashes; the timing report independently records its executable hashes.

```sh
sh backgammon/scripts/build-native-pilot.sh combined
BG_CANDIDATE=/absolute/combined-build/dist_simd BG_SAMPLES=5 \
  BG_OUTPUT=backgammon/test-results/combined-pilot/chromium.json \
  node backgammon/scripts/native-search-pilot.cjs
# Repeat with BG_BROWSER=webkit and BG_BROWSER=firefox and distinct outputs.

BG_NATIVE_PROBES=1 sh backgammon/scripts/build-native-pilot.sh baseline
BG_NATIVE_PROBES=1 sh backgammon/scripts/build-native-pilot.sh combined
BG_BASELINE=/absolute/instrumented-baseline/dist_simd \
  BG_CANDIDATE=/absolute/instrumented-combined/dist_simd \
  BG_OUTPUT=backgammon/test-results/combined-pilot/probes.json \
  node backgammon/scripts/check-native-probes.cjs

BG_CANDIDATE=/absolute/uninstrumented-combined/dist_simd \
  BG_OUTPUT=backgammon/test-results/combined-pilot/validation.json \
  node backgammon/scripts/validate-native-candidate.cjs
```

The last command serves the assembled application and substitutes only the experimental SIMD loader/executable over local HTTP. It compares with the unchanged production scalar build, exercising authored fixtures, a 300-position corpus in Chromium, cube/match/perspective contexts, arbitrary-move grading, seeded rollout/resume, cache reuse, and loading/fallback/retry cases. Result metadata still says bg5 because this is a test substitution; the report is explicitly marked experimental and records the actual asset hashes. It must not be presented as a separately released engine version.

`build-native-pilot.sh` additionally accepts `baseline`, `hidden-block` and `prune-state`. `summarize-native-followup.cjs` refuses incomplete or failed inputs and records every paired timing with a hash of the complete numerical outputs. Five to ten timing repetitions support exploratory medians; they do not establish a reliable p95 or a physical-phone speed estimate. Allocation-failure and release/version/provenance work remain necessary before promoting the combined candidate.

## Validation

The client unit suite passed all 19 tests. The real-WASM regression served the assembled `_site` in Chromium 145, Firefox 146 and WebKit 26: all three preserved the original queued decision after the caller edited its draft, and returned the correct cached grade afterward. Each browser also passed the existing 18 hint-reuse/fresh-grading comparisons; the maximum numerical difference was 0.00000154, within the 0.00002 tolerance. These are desktop browser checks, not physical-phone testing.

The combined native candidate subsequently passed **645 production-worker numerical comparisons**: 415 in Chromium (including the 300-position corpus), 115 in Firefox and 115 in WebKit. Maximum scalar/candidate difference was **0.00000006**, with identical best decisions. All **15 warm/fresh cache-context comparisons** passed (maximum difference 0.00000078), as did **30 loading/fallback/retry cases** across the three browsers. Seeded rollout, cancellation and cross-backend checkpoint resume were included in each browser's numerical suite. The thresholds remain 0.00001; zero recorded differences in the separate native SIMD baseline comparisons above should not be confused with these scalar comparisons.

The complete site test run passed **341 tests**. The third-turn book's completed `--plan` check reused all **27,930 later-turn decisions with zero missing**, without starting WASM. Live checks confirmed all five Backgammon routes and an exact match between the published and local `jacoby-3ply-v3` index. At that stage no native candidate assets or test bindings were distributed. The later bg6 release is documented separately; it contains no test bindings.
