# Reusing completed 3/4-ply checker evaluations

`EngineClient` can now grade a submitted move from a completed Expert or Research hint when that exact legal resulting board is already in its evaluated list. It validates the submitted complete path first, then uses the original decision's candidate equities at the same depth. This reduces duplicate work; it does not change the neural network, pruning, search depth or evaluation units.

Previously, fixed 3/4-ply grades always created a separate worker job because the submitted move could be outside the hint's shortlist. GNUbg's internal cache often made that second job cheap. However, a sufficiently large deep search evicted earlier internal entries, making the second job expensive again. The application now reuses the finished answer directly where it is sufficient.

## Safeguards

- Full position, dice, player, cube, scores, match length, rules, engine version and preset must match.
- The move must be a legal complete turn and appear in the completed hint at the exact requested depth. Equivalent paths are compared by resulting board.
- A move outside the shortlist still triggers a real search that includes it. A hint's ranked list is never assumed exhaustive.
- Auto retains its independent grading request: a hint can stop on a clear lead, while grading the actual move disables that shortcut. Rollouts also keep their own candidate/sample identity.
- A grade queued behind its matching hint reuses the result when that hint completes. Raising the grade's priority promotes the in-flight hint instead of cancelling work it needs.
- Cached results are copied separately from editable returned results. Editing candidate equities, probabilities, preview steps or screening metadata cannot poison subsequent cached answers.
- Memory and queue bounds stay at 64 results and 32 jobs. Repeated projections do not create additional cache entries.

## Measured effect

Apple M4 Pro, macOS/Darwin 25.5 arm64, Chromium 145.0.7632.6, local HTTP serving assembled `_site`, real SIMD GNUbg **bg5**. Opening-book lookup is disabled. Each pair starts fresh native workers and alternates the old/new order. Initialization is excluded; the hint is computed first, then its lowest-ranked evaluated candidate is submitted. Both arms use identical native assets, presets and positions. Five paired samples per case; these are medians, not p95s or real-phone measurements.

| Position | Depth | Previous grade time | Reused grade time |
| --- | ---: | ---: | ---: |
| Contact | 3 | 1.6 ms | 0.4 ms |
| Contact | 4 | 6,004.0 ms | 0.4 ms |
| Race | 3 | 1.6 ms | 0.3 ms |
| Race | 4 | 1.6 ms | 0.4 ms |
| Bearoff | 3 | 1.5 ms | 0.3 ms |
| Bearoff | 4 | 1.4 ms | 0.3 ms |
| Starting board, double threes | 3 | 110.5 ms | 2.4 ms |
| Starting board, double threes | 4 | 7,903.3 ms | 2.3 ms |
| Seven-point match | 3 | 0.9 ms | 0.2 ms |
| Seven-point match | 4 | 8,949.6 ms | 0.1 ms |

The first hint still has to run its search. For example, median 4-ply contact hint time was 6,344 ms before and 6,337 ms after; no cold-search speedup is claimed. Sub-millisecond timing is noisy. The large savings apply to repeated grading of already evaluated moves, not arbitrary unseen positions.

All measured grades preserved the submitted resulting board, equity within 0.00001 and loss within 0.00002 of the original client. Each optimized hint/grade pair sent one native analysis job instead of two. This is numerical agreement at fixed settings, not evidence of stronger play. [Raw Chromium pairs, timings, client hashes and summaries](screened-reuse-chromium.json) retain all observations.

## Verification

All **70 paired real-engine comparisons** passed: 50 pairs in Chromium, ten in Firefox 146.0.1 and ten in WebKit 26.0. The [Firefox](screened-reuse-firefox.json) and [WebKit](screened-reuse-webkit.json) reports are single-pair functional checks, partly concurrent with other tests; their recorded times are not comparable repeated-run benchmarks. Reports include canonical positions and hashes of the assembled client and native inputs.

The repository suite passed **339 tests**, and the latest targeted client suite passed **18 tests**, including an additional book/cube cache-isolation regression added after the full run started. The full assembled Chromium application regression also passed. Current desktop Auto-analysis and 320×568 Solver screenshots were visually inspected. None of these checks establishes stronger play or faster cold search.

## Reproduce

```sh
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node backgammon/scripts/screened-reuse-benchmark.cjs
BG_BROWSER=firefox BG_SAMPLES=1 node backgammon/scripts/screened-reuse-benchmark.cjs
BG_BROWSER=webkit BG_SAMPLES=1 node backgammon/scripts/screened-reuse-benchmark.cjs
node --test backgammon/tests/client.test.mjs backgammon/tests/adaptive.test.mjs
node scripts/run-tests.mjs
```

The baseline client is pinned to `62f0259034e730a3783c980c86da259ba5b62a3a`. `BG_BASELINE_REF`, `BG_BROWSER`, `BG_SAMPLES` (1–10; default 5) and `BG_OUTPUT` allow separate experiments. Avoid concurrent benchmarks. The one-pair Firefox/WebKit runs check real engine behavior across browsers; they do not support repeated-run latency claims.
