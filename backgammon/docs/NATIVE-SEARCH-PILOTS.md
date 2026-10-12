# Native search experiments and request isolation

The deployed solver still uses **GNUbg bg5**, with its existing weights, search depths, filters and opening book. This investigation produced a verified request-isolation fix and four reproducible native optimization candidates. Native candidates remain experimental: the measurements do not establish a consistent enough speed gain to replace the distributed engine yet.

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

## Validation

The client unit suite passed all 19 tests. The real-WASM regression served the assembled `_site` in Chromium 145, Firefox 146 and WebKit 26: all three preserved the original queued decision after the caller edited its draft, and returned the correct cached grade afterward. Each browser also passed the existing 18 hint-reuse/fresh-grading comparisons; the maximum numerical difference was 0.00000154, within the 0.00002 tolerance. These are desktop browser checks, not physical-phone testing.
