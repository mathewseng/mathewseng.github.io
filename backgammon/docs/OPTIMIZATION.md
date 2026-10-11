# Solver optimization audit

## October 11, 2026: correctness before reuse

The real-WASM reuse regression exposed two bugs in the pinned core's native cache. These existed below the application's full-context cache key:

- Running Quick/Standard before Deep on the initial 3–3 roll in a five-point match changed repeated Deep candidate equities by up to **0.00400553**. GNUbg's cube-efficiency model depends on the root depth, while the old native key encoded only remaining depth. bg4 adds the model bit to cubeful keys. Fresh Deep and Quick → Standard → Deep then agreed on this fixture; repeat differences were limited to float32 arithmetic (observed maximum 0.00000154).
- Switching from money play to 6–6 in a seven-point match on the initial 3–1 roll changed candidate equities by up to **1.34952295**; the reverse order differed by up to **0.67476153**. The old key could encode both money play and double-match-point identically. bg4 adds a match-context bit. Both directions then agreed exactly with fresh-worker evaluations on this fixture.

These are reproducible binding/cache corrections, not a claim of stronger neural weights or a new exact solver. The upstream revision, weights, scalar `-O2` build, pruning and search presets remain unchanged. Both fixes are in `scripts/patch-engine.py` and the bg4 corresponding-source archive. Old saved analyses retain their recorded engine version; reanalyze them to use bg4. Historical speed/reference reports retain their original observation date/version unless explicitly regenerated.

## Reuse and scheduling

Quick/Standard/Deep evaluate every distinct legal result at one depth. A hint and a subsequent arbitrary-move grade can share those scores. Submitted turns are still validated (including complete-dice use), and each caller receives its own `actual`/loss fields. Equivalent dice orders grade the same result. Screened searches and rollouts remain separate because the submitted move can change their finalist set.

Foreground duplicates now promote queued background jobs instead of waiting behind unrelated low-priority work. Completed rollout checkpoints reach every subscriber. Stale worker errors and failed worker creation cannot poison the replacement worker or prevent retry.

`tests/engine-reuse.cjs` uses the assembled real WASM for 18 position/preset combinations, including 73-result doubles and match play. It checks in-flight reuse, cached arbitrary moves outside the old 40-hint limit, unchanged candidate coverage, probabilities, match units and grading. `tests/engine-cache-context.cjs` compares five mixed-depth/money/match cache sequences against fresh workers. Native float32 comparisons allow 0.00001 equity; request identity, job count, legal result keys and context separation are exact checks. Mock-worker tests cover cancellation, generation errors, initialization failures and queue promotion.

## Benchmark reproduction

After assembling `_site`, run `node backgammon/scripts/reuse-benchmark.cjs` with no concurrent heavy work. It serves the previous client directly from pinned Git revision `d20e9891b702a808f2b3b320014cb6ab9ab66e24` alongside the current client. **Both use the same bg4 engine** to isolate scheduling/cache savings. It records five alternating paired samples for five position classes at Quick/Standard/Deep, including all raw samples, first-search time, subsequent-grade time, synchronous dispatch time and total time. Initialization is excluded; the second calculation has warm native caches. Output: `docs/reuse-benchmark.json`. Five samples support median and range, not p95. This is a desktop local-HTTP measurement, not a physical-phone benchmark.

Observed Deep **subsequent-grade** medians on Apple M4 Pro / Chromium 145 (milliseconds; n=5 per column):

| Position | Previous client | Reuse | Reuse range |
| --- | ---: | ---: | ---: |
| Opening | 1.0 | 0.2 | 0.2–0.3 |
| Contact | 31.2 | 0.5 | 0.4–0.6 |
| Race | 1.8 | 0.5 | 0.4–0.6 |
| Bearoff | 1.1 | 0.4 | 0.3–0.5 |
| Doubles, 73 legal results | 169.3 | 3.3 | 3.2–4.3 |

Each hint-plus-grade pair sent two native search requests with the previous client and one with reuse. First-search complexity is unchanged by the client optimization; the raw file records those timings separately. These measurements do not establish a speedup for unrelated positions or devices.

## Remaining optimization work

Validation also regenerated all 34 authored study fixtures and the 300-position historical cubeless reference report with bg4. All 900 reference best-move selections (300 positions × three presets) were unchanged. The mixed-context and full-candidate reuse regressions passed Chromium, Firefox and WebKit; actual rollout cancellation/resume passed all three engines. The reference corpus is cubeless and does not by itself exercise the two native cubeful-cache bugs.

Release checks: 292 repository tests passed; all 13 targeted deployment/offline-manifest checks passed; the complete assembled-site Chromium suite passed. Phone study-preview and nine-viewport layout/touch checks also passed in Firefox and WebKit. Screenshots were inspected for 320px and 375px study flows, 390px play/editing/Library, cube review, and 844×390 landscape play. These are desktop browser emulations, not physical-phone measurements.

The wider solver goal remains active. Prototype scalar/SIMD builds exist but are not deployed; they need reproducible build integration, cross-browser and numeric comparison, capability fallback and workload-level measurements. Deeper search/filter accuracy and rollout policy remain separate questions requiring external-reference evidence. No faster but weaker preset is substituted silently, and these cache improvements do not establish that every possible engine optimization is complete.
