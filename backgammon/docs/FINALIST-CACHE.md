# Reuse completed finalists when grading an unlisted move

Research can grade any complete legal turn, including one outside its hint list. Previously that request evaluated the new move **and repeated every existing four-ply finalist**. A sufficiently large search evicted native transposition entries, so the repeated work could cost several seconds. The evaluator now retains the completed scores and calculates only the missing candidates at the requested depth.

This extends the earlier three-ply cache to four ply. It does not reduce the candidate list, change search depth, neural weights, pruning, the Research leader-retention policy, or Auto's minimum-depth and five-second next-stage policy. The engine remains **`gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg6`**. The opening book remains pinned to its original bg5 generator and evaluations.

## Boundaries and correctness

- Each of the two depths has its own cache, holding at most 32 completed candidate scores for one exact position and root-candidate set. FIFO eviction keeps arbitrary-move grading bounded; evicted scores are calculated again.
- The position key includes points, bar, off, dice, player, phase, cube value/owner, scores, match length, rules, Crawford state and any pending offer. An automatically screened root set has separate identity from an exhaustive root set.
- Only successful native numeric results are cached. Every request still generates and validates its legal complete turns; notation and preview paths come from that request. Returned values and nested probabilities are copied.
- A new legal submitted move is added explicitly and evaluated at the **same depth and original decision context** as its alternatives. A grade cannot add that move to a later hint or alter earlier results. Incomplete/illegal submissions fail before cache reuse.
- Shutdown and worker termination release the caches. Nothing is persisted or shared between workers or engine versions. Cube analysis and rollouts do not use this cache.

The existing client optimization still grades moves already in a completed hint without another worker job. This change helps the remaining case: an unlisted move that genuinely needs a new calculation. In Auto, a hint and a grade can have different screened root sets; those contexts deliberately do not share these finalists.

## Measurements

Apple M4 Pro, Darwin 25.5.0 arm64, Chromium 145.0.7632.6, October 12, 2026, 14:01–14:08 UTC. AC power was observed at the start. Ordinary background applications remained active; no heavy validation suite ran during the timed study. This is desktop local HTTP, not an iPhone or network-transfer benchmark.

The baseline evaluator is pinned to commit `0d5408ed2f7fd6fbda553002adcd19f14c584767`. Both arms load identical bg6 SIMD assets. Each pair starts fresh workers and alternates arm order by sample. The sequence is a Research hint, two distinct legal moves absent from that hint, then the hint again. Initialization is recorded separately and excluded from search timings. HTTP/WASM compilation caches may be warm; native caches are fresh at the first hint and remain warm within the sequence. Opening-book lookup is bypassed. The measurements call the evaluator directly to isolate this layer, rather than timing the client result cache.

Fifteen paired sequences completed: five diagnostic positions × three samples. All 60 paired stages retained the same recommendations, legal-result coverage and units. The maximum difference in equity, probability, match-winning chance or loss was **0.00000024** (acceptance tolerance 0.00002). Every new unlisted move added exactly one native four-ply call in the updated evaluator. Repeating the hint added none. This verifies numerical agreement on these cases; it is not an independent playing-strength measurement.

Median **milliseconds**, n=3 per cell. Each grade column is a separate submitted move:

| Position | First hint, before → now | Unlisted move A, before → now | Unlisted move B, before → now |
| --- | ---: | ---: | ---: |
| Contact | 5,136 → 5,102 | 7,659 → 2,770 | 7,570 → 2,696 |
| Race | 356 → 356 | 52.3 → 52.8 | 65.9 → 66.1 |
| Bearoff | 5.1 → 5.1 | 1.1 → 1.0 | 1.2 → 1.1 |
| Crashed | 8,974 → 8,994 | 10,193 → 1,934 | 9,719 → 1,405 |
| Owned-cube seven-point match | 7,187 → 7,222 | 9,912 → 2,853 | 9,920 → 2,812 |

The expensive grading cases saved roughly 64–86%. Race and bearoff were already cheap because native caches retained useful work. The first search is unchanged in scope; small timing differences are noise, and no cold-search improvement is claimed. The repeated hint took 0.3–0.9 ms through the evaluator, but the application client already bypasses that work when it retains the whole hint.

[Recorded inputs, raw timings, call counts, scores, hashes and observed ranges](finalist-cache-results.json) preserve all evidence. Identical answer payloads are shared by `answerId` to keep the report compact. Three samples support medians and observed ranges, not p95 or confidence intervals. These selected cases do not estimate the frequency of this workload in ordinary play.

## Reproduction and validation

```sh
# Run timed work without concurrent heavy tasks.
BG_CASES=contact,race,bearoff,crashed,match BG_PRESETS=research BG_SAMPLES=3 \
  node backgammon/scripts/finalist-cache-study.cjs
node backgammon/scripts/summarize-finalist-cache.cjs \
  backgammon/test-results/finalist-cache/chromium.json

node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node scripts/run-tests.mjs
BG_BROWSERS=chromium,firefox,webkit node backgammon/tests/browser.cjs
```

`BG_BROWSER`, `BG_CASES`, `BG_PRESETS`, `BG_SAMPLES` (1–5), and `BG_OUTPUT` select separate study runs. The baseline commit must exist locally. Each completed pair is checkpointed; incomplete reports are rejected by the summarizer. Startup and compute remain separate. A worker sequence exceeding 240 seconds fails explicitly rather than recording a successful latency.

`tests/finalist-cache.test.mjs` covers missing-candidate call counts, immutable results/paths, context/depth isolation, bounded eviction, illegal submissions, failed native evaluations and disposal. Its new cache-behavior regressions failed against the previous evaluator. The assembled real-WASM `tests/research-screen.cjs` also compares progressive Research and unlisted-move grades against fresh workers, verifies player reversal and an owned-cube match, and redispatches a later hint after clearing the client cache. It is included in the full browser suite.

The release's local Node run passed **364 tests**, including the assembled-site artifact and offline-manifest checks. The focused assembled-worker suite passed in **Chromium 145.0.7632.6, Firefox 146.0.1 and WebKit 26.0** with SIMD, and in Chromium with forced scalar WASM: three decision contexts per browser/backend, each including a fresh independent grade. The largest warm-versus-fresh grading difference in those twelve contexts was **0.00000001**, with a 0.00001 tolerance. Solver screenshots were captured and inspected at **1366×768** and **390×844**. These are desktop/emulated viewport checks; no physical-phone benchmark is claimed.
