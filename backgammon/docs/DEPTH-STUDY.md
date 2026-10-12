# 300-position comparison: 2, 3 and 4 ply

Recorded October 11, 2026, 20:14–20:33 UTC. **Three ply was the best cost/quality compromise in this sample.** Four ply changed the recommendation about as often as three ply did, but cost much more and did not improve the aggregate historical-reference result over three ply. This motivated the earlier one-second Auto policy. The current user-selected policy requires at least two ply and normally tries three; see [SEARCH-POLICY.md](SEARCH-POLICY.md). No engine settings were changed by this study.

## Evidence and method

- Same 300 decisions as the existing accuracy study: 100 each from GNUbg's contact, race and crashed benchmark classes. All have at least two legal resulting positions. Equal class weighting does not describe the frequency of positions in a user's games.
- Engine: `gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg5`, single-threaded SIMD WebAssembly, pruning enabled, deterministic, zero noise. All positions are **cubeless money** decisions, not cubeful or match-score benchmarks.
- Fixed Deep/Expert/Research presets: two ply evaluates every legal result; three ply retains at least two, up to eight candidates within 0.080 of the two-ply leader; four ply retains at least two, up to four within 0.040. This measures the application's screened presets, not exhaustive four-ply search over every legal move.
- Desktop WebKit 26.0, Apple M4 Pro (14 cores), 48 GB, Darwin 25.5.0 arm64. Actual assembled `_site` files were checked byte-for-byte against the engine source/assets. Local HTTP; no simulated phone or artificial CPU throttling.
- One fresh worker/native evaluation cache for every position/depth, one calculation at a time. Browser HTTP/compilation caches may be warm. Classes were interleaved and depth order rotated. Each completed evaluation was checkpointed; no failures, timeouts or missing samples.
- **Power changed during the run:** it began on battery with `powermode 1` and ended on AC with `powermode 0`. Background applications remained active; recorded load averages also changed. Treat timings as observations from this mixed session, not a controlled maximum-performance benchmark. The three depths for each position were measured consecutively, with their order balanced across positions.

[Raw 900 measurements and 4 supplemental grades](depth-study-results.json) · [Computed summary and per-position comparisons](depth-study-summary.json). These development reports are excluded from the offline application cache.

## How often the recommended move changes

Move identity means the canonical resulting board, so equivalent move sequences do not count as a change.

| Comparison | Changed / 300 | Rate | Contact / 100 | Race / 100 | Crashed / 100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 → 3 ply | 29 | 9.7% | 11 | 9 | 9 |
| 3 → 4 ply | 29 | 9.7% | 10 | 7 | 12 |
| 2 → 4 ply | 25 | 8.3% | 11 | 6 | 8 |

262/300 positions (87.3%) chose the same move at every depth. In 13 positions, three ply changed the two-ply choice and four ply returned to it. Seven positions had three different choices. These are recommendation changes, not counts of proven corrections.

## How much the differences matter

For each transition below, **both choices are scored at the deeper depth**, in the same position/rules context. Do not subtract a two-ply equity from a three-ply equity. Values are cubeless money equity, not win probabilities or a commercial performance rating. The 0.005/0.020 thresholds describe magnitude; they are not confidence bounds or certain-error classifications.

| Comparison | Median absolute gap among changed choices | Changes with gap > 0.005 | Changes with gap > 0.020 | Mean signed gain over all 300 positions |
| --- | ---: | ---: | ---: | ---: |
| 2 → 3 ply, scored at 3 | 0.003882 | 14 / 29 | 4 / 29 | +0.000991 |
| 3 → 4 ply, scored at 4 | 0.000707 | 7 / 29 | 2 / 29 | +0.000360 |
| 2 → 4 ply, scored at 4 | 0.000859 | 7 / 25 | 1 / 25 | +0.000426 |

For the 3 → 4 transition, 22 of 29 changed choices differ by at most 0.005 according to four ply; one is a numerical tie within 0.000001. A gap of 0.001 is one thousandth of a point of estimated expectation, not a 0.1-percentage-point change in winning chance. Four ply's own scores are evidence of what that search prefers, not independent proof of accuracy.

The narrower four-ply screen omitted the three-ply winner in four cases. Each was explicitly rescored at four ply outside the baseline timing. One omitted move was better than the default four-ply winner by 0.005460 (contact, source line 684608). The summary preserves this negative gain rather than clamping it to zero or replacing the original four-ply recommendation. The other omissions included one numerical tie. A broader screen or retaining the three-ply winner is a possible follow-up; it was not silently applied to these results.

**Subsequent implementation:** fixed Research now retains that three-ply leader; [RESEARCH-SCREEN.md](RESEARCH-SCREEN.md) reproduces all four omissions on bg6 and measures the additional work. The historical tables, timing samples and comparisons in this document remain unchanged.

## Comparison with the historical rollout reference

The same 298 positions have reference coverage for the chosen move at all three depths. Two uncovered race positions remain missing and are excluded, never assigned zero loss. All changed-choice comparisons below are covered. The reference comes from the previously recorded GNUbg 1.00 benchmark files and 1,296-game rollouts with a limited candidate list. It is old, noisy, from the same engine family, and not a modern independent gold standard or a held-out training guarantee.

Here **reference loss = reference equity of its listed best move − reference equity of our chosen move**. Both numbers come from the historical file; the engine's new equity is not subtracted from a historical equity. `scripts/benchmark-reference.mjs` reads the first candidate's absolute equity and the subsequent candidates' stored losses. The reported 0.002981 at four ply is their mean over the common 298 covered positions, **not a known distance from perfect play**, not the difference between three- and four-ply evaluations, and not a win-probability percentage. Of those 298 four-ply decisions, 241 have reference loss within 0.000001 of zero. The ten largest losses contribute 56.3% of the total.

Four ply can disagree because it still uses finite-depth neural evaluations, internal pruning and a root shortlist. The rollout reference also has sampling uncertainty and its own playing policy; it is not an exact answer to which every deeper search must converge. Zero loss relative to the engine's own best evaluated move is a different metric from agreement with this external reference.

| Depth | Mean loss against reference, common 298 positions |
| --- | ---: |
| 2 ply | 0.003193 |
| 3 ply | **0.002891** |
| 4 ply | 0.002981 |

| Transition | Reference favors deeper | Reference favors shallower | Equal within 0.000001 | Mean gain across covered 298 |
| --- | ---: | ---: | ---: | ---: |
| 2 → 3 | 15 | 11 | 3 | +0.000302 |
| 3 → 4 | 16 | 11 | 2 | −0.000090 |
| 2 → 4 | 14 | 9 | 2 | +0.000212 |

The counts above concern changed choices; unchanged choices contribute zero to the mean. Four ply improves more changed decisions than it worsens, but its regressions are larger in aggregate. This small average difference does not establish that three ply is universally stronger. The class results differ: four ply improves the contact and race reference averages relative to three ply, but worsens the crashed average. Against the reference, the median absolute difference among changed moves is 0.007851 for 2 → 3 and 0.006901 for 3 → 4, considerably different from the deeper evaluator's own margins for those switches.

## Five-ply feasibility pilot

A separate experiment on October 11, 2026, 22:05–22:11 UTC evaluated **six deliberately selected cases** at four and five ply. This is a diagnostic follow-up, not a replacement for the 300-position study and not a representative accuracy or average-latency sample. [Complete settings, inputs, hashes and results](five-ply-pilot-results.json).

The temporary engine was built from the shipped bg5 corresponding-source archive with pinned Emscripten 4.0.15. Its only C change raises `bg_score`'s checker-depth guard from four to five. GNUbg's evaluation context/cache have four depth bits and its `ScoreMove` evaluation recurses to the supplied depth. Weights, internal pruning and the SIMD implementation are unchanged. Cube bindings remain capped at four. **The experimental binary is not shipped, and application capabilities/defaults remain unchanged.**

Each position uses an identical fixed candidate pool at both depths: all original four-ply finalists, the two-/three-/four-ply winners and the historical reference's leader. This deliberately includes known disputed moves and has access to the reference answer; it must not be treated as an independent accuracy benchmark. Four-ply scores agree with the production study within 0.00001. Both depths actually ran in fresh single-threaded WASM workers in desktop WebKit 26.0, with alternating depth order and a 300-second job limit; all twelve jobs completed. The M4 Pro recorded AC power at both start and finish. One timing observation per position/depth, initialization excluded, local HTTP and potentially warm browser caches. Background apps remained running.

| Corpus index / class | Candidates | 4-ply time | 5-ply time | Choice changes? | Gain according to 5 ply | Reference loss at 4 → 5 |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 58 / contact | 6 | 1.373 s | 35.742 s | No | 0 | 0.067226 → 0.067226 |
| 89 / contact | 4 | 8.164 s | 247.724 s | Yes | 0.002858 | 0 → 0.062596 |
| 139 / race | 5 | 0.618 s | 0.529 s | No | 0 | 0 → 0 |
| 150 / race | 5 | 0.102 s | 0.119 s | No | 0 | 0.001630 → 0.001630 |
| 216 / crashed | 6 | 14.717 s | 19.432 s | Yes | 0.032305 | 0.091874 → 0.012021 |
| 250 / crashed | 2 | 0.039 s | 0.051 s | No | 0 | 0 → 0 |

Times above cover scoring the fixed pool, excluding the root screen used by application presets. They are not directly interchangeable with the earlier preset timings. Fast database/near-terminal positions and a single timing sample also mean observed time need not increase with depth in every row. No percentile or general speed multiplier is inferred from these six selected cases.

The gain column evaluates **both choices at five ply**. At contact index 89, five ply changes `8/5 9/4` to `8/5 6/1`; at crashed index 216 it changes `15/13 17/16` to `15/13 14/13`. The historical reference opposes the former and favors the latter. The broader pool also recovers the previously omitted three-ply winner at index 58 even at four ply, and five ply retains it. These results establish that a real five-ply evaluation is feasible, but not that it is uniformly more accurate or appropriate for a one-second default. Six ply has not been benchmarked. Higher-sample rollouts with explicit policy, candidate coverage and uncertainty would provide a better accuracy check than treating either depth as truth.

Reproduce without modifying the deployed engine:

```sh
# First activate the pinned Emscripten 4.0.15 environment.
sh backgammon/scripts/build-five-ply-pilot.sh
# Use the temporary PILOT_BUILD directory printed by the build:
BG_PILOT_BUILD=/path/printed/by/build node backgammon/scripts/five-ply-pilot.cjs
```

The runner starts its own local server and saves results under `backgammon/test-results/five-ply-pilot/`. The shipped source archive plus the small build script provide the complete experimental source modification. No generated experimental assets are added to deployment or the offline cache.

## Time cost on this computer

Wall time excludes initialization and includes the root screening required by the named preset. One sample per position/depth: medians and percentiles describe the distribution **across positions**, not repeat-run timing uncertainty. Supplemental arbitrary-move grades are excluded from default timing. Median fresh-worker startup was 27 ms on local HTTP; this is not an internet download benchmark.

| Depth | Mean | Median | 95th-percentile position | Maximum | Finished in ≤ 1 second |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 ply | 0.162 s | 0.044 s | 0.437 s | 9.073 s | 295 / 300 (98.3%) |
| 3 ply | 0.429 s | 0.184 s | 1.440 s | 8.810 s | 271 / 300 (90.3%) |
| 4 ply | 3.061 s | 0.854 s | 12.433 s | 26.242 s | 160 / 300 (53.3%) |

Three ply costs **2.64×** two ply on the ratio of mean times (+0.266 seconds per decision). Four ply costs **7.14×** three ply (+2.633 seconds), or **18.89×** two ply. Individual timings need not increase monotonically because of screening, fast database positions and measurement noise.

| Position class | 2-ply mean | 3-ply mean | 4-ply mean |
| --- | ---: | ---: | ---: |
| Contact | 0.171 s | 0.722 s | 6.376 s |
| Race | 0.065 s | 0.216 s | 1.100 s |
| Crashed | 0.250 s | 0.348 s | 1.708 s |

Contact positions make the cost particularly clear: only 18/100 four-ply evaluations finished within one second, compared with 77/100 at three ply. Fixed-depth timings do not directly measure Auto's cumulative 0 → 1 → 2 → 3 → 4 pipeline. Different cube/match contexts, devices, browser versions, power states and background load can change latency. These numbers are not an iPhone benchmark.

## Reproduction and validation

```sh
sh scripts/assemble-site.sh _site
node backgammon/scripts/depth-study.cjs
node backgammon/scripts/summarize-depth-study.mjs \
  backgammon/test-results/depth-study/results.json \
  backgammon/test-results/depth-study/summary.json
node backgammon/scripts/verify-depth-study.mjs \
  backgammon/test-results/depth-study/results.json
node --test backgammon/tests/depth-study.test.mjs
node scripts/run-tests.mjs
```

`BG_SITE`, `BG_CHECKPOINT` and `BG_OUTPUT` override input/output paths. Existing completed checkpoints resume only with the same engine/core assets, corpus hash and WebKit version. Choose a new checkpoint path to start an independent timing run. Keep the computer on a stable power source and avoid concurrent heavy work when seeking more controlled timings.

Validation checked all 900 samples, all 300 unique decision contexts, legality of every recorded candidate, complete two-ply move lists, SIMD use without fallback, and all four supplemental grades. All 300 fresh two-ply recommendations matched the previous accuracy report. An independent Python calculation reproduced the overall and class change counts, equity gaps, reference coverage/losses, and mean/median/p95 timings. Unit tests cover paired denominators, missing reference scores, equivalent routes, negative screening gains, incomplete/corrupt measurements and percentile calculations.

`node scripts/run-tests.mjs` passed all 307 tests, including the deployment-artifact checks. No gameplay or engine implementation changed in this study.
