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

## bg4 release evidence

Validation also regenerated all 34 authored study fixtures and the 300-position historical cubeless reference report with bg4. All 900 reference best-move selections (300 positions × three presets) were unchanged. The mixed-context and full-candidate reuse regressions passed Chromium, Firefox and WebKit; actual rollout cancellation/resume passed all three engines. The reference corpus is cubeless and does not by itself exercise the two native cubeful-cache bugs.

Release checks: 292 repository tests passed; all 13 targeted deployment/offline-manifest checks passed; the complete assembled-site Chromium suite passed. Phone study-preview and nine-viewport layout/touch checks also passed in Firefox and WebKit. Screenshots were inspected for 320px and 375px study flows, 390px play/editing/Library, cube review, and 844×390 landscape play. These are desktop browser emulations, not physical-phone measurements.

## bg5: SIMD with a verified scalar fallback

The production build now contains a standard SIMD executable plus the unchanged bg4 scalar executable. The neural weights and bearoff/MET package are identical; the default search depths and pruning are unchanged. Four independent hidden neurons are computed together without changing input summation order. The SIMD build uses `-O3 -flto -msimd128 -ffp-contract=off`; no relaxed SIMD, fast-math or threads. A capability probe selects the executable, and a failed SIMD load/compile/initialization retries the scalar build. The compiler is pinned to Emscripten 4.0.15, with both build targets in the corresponding source archive.

`docs/backend-validation.json` records **645 comparisons**: 415 in Chromium, 115 in Firefox and 115 in WebKit. These cover all 34 authored fixtures at 0/1/2 ply, additional cube/match/player contexts, 3/4-ply samples, an arbitrary legal move, seeded rollouts and a SIMD-to-scalar checkpoint resume. Chromium additionally compares all 300 historical reference positions at Deep. Best decisions and candidate coverage agree. The largest observed difference across checked equities, probabilities and standard errors was **0.00000006**, below the 0.00001 test tolerance. Each browser also passed ten actual-HTTP asset, fallback, failure and retry cases. This proves tested implementation agreement, not perfect neural accuracy.

### Paired measurements

Run `node backgammon/scripts/native-benchmark.cjs` with no other heavy jobs. The committed `data/native-benchmark.json` retains every raw sample, canonical position, setting, build flag, executable hash, browser version and startup component. The public engine report can switch browser, depth and cache condition. Older depth/rollout reports remain labeled with their original engine and date.

Observed Deep first-search medians on **Apple M4 Pro / macOS Darwin 25.5.0**, milliseconds, **five alternating paired fresh workers** per cell:

| Position | Chromium 145 scalar → SIMD | Firefox 146 scalar → SIMD | WebKit 26 scalar → SIMD |
| --- | ---: | ---: | ---: |
| Opening | 167.1 → 138.1 | 1958 → 1512 | 184 → 151 |
| Contact | 436.5 → 351.5 | 4938 → 3897 | 450 → 370 |
| Race | 71.3 → 65.3 | 624 → 539 | 75 → 68 |
| Bearoff | 2.3 → 2.4 | 4 → 3 | 3 → 3 |
| Cube | 8.3 → 7.5 | 60 → 47 | 10 → 9 |
| Doubles | 841.0 → 688.7 | 9720 → 7795 | 876 → 730 |
| Match score | 211.9 → 176.0 | 2055 → 1667 | 202 → 164 |

The opening/contact/doubles samples saved about **17–23%** of first-search compute time across these browser runs. This is a local desktop HTTP workload comparison, not a phone benchmark or a universal speed promise. Browser HTTP/WASM compilation caches may be warm even when the native evaluation cache is fresh. Three additional within-worker repeats show that already-cached calculations are mostly sub-millisecond to a few milliseconds; many differences there are beneath useful timer resolution. Small bearoff/cube timings do not establish a reliable speed gain. No p95 is claimed from five samples.

### bg5 release checks

All 34 study fixtures were rescored with bg5. The regenerated 300-position historical reference report checked 900 best-move selections across Quick/Standard/Deep; none changed from bg4. The corpus limitations above still apply.

With the October 11 mobile improvements included, 293 repository tests and the full assembled-site Chromium suite passed, including real WASM, backend fallback/cancellation, offline updates, saved work and the new mobile task flows. Firefox and WebKit passed the real-engine research/report and mobile-flow suites. The paired benchmark report was visually inspected at desktop and phone widths; browser emulation is not physical-device testing. Engine/source asset checksums all match the distribution manifest.

### Accuracy work still open

The faster executable preserves the existing decisions; it does not introduce stronger weights or a new rollout policy. Expert/Research still use a screened root list, and rollouts still use 0-ply checker/cube decisions. Those limits need separate experiments against recorded reference positions and a separately built GNUbg executable before changing defaults or claiming stronger play. GNUbg’s [official manual](https://www.gnu.org/software/gnubg/manual/gnubg.html) describes deeper rollout policies and their substantial cost. The next investigation is explicit, reproducible 2-ply rollout policy with correctly initialized move filters, bounded checkpoint batches, and measured policy differences—not merely increasing sample count or silently calling a deeper tree search a rollout.
