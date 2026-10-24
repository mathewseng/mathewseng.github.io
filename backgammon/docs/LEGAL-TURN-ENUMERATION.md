# Exact legal-turn enumeration, October 22, 2026

`legalTurns` now skips a repeated partial board when it has the same unused
double dice. Those nodes have identical possible completions, so expanding the
first one preserves every distinct legal result, its first legal path and the
original result order. The node key includes the board, both bars, both off
counts and the remaining dice. The visited set exists only during one call.

This is exact duplicate elimination in the JavaScript root move generator.
GNUbg search filters, depth, native arithmetic, weights and rollout policies
are unchanged. `legalPaths` remains exhaustive for interactive move drafts.
Ordinary rolls retain the old traversal: their paths only reconverge at the
final board, where `legalTurns` already removes duplicates.

The differential test compares the new generator with exhaustive `legalPaths`
followed by the previous first-result deduplication. It makes 4,634 comparisons
from the 300 historical checker positions and 31 authored checker fixtures,
using each original roll, all six doubles, and both orientations. Another 360
comparisons cover all ordered rolls for forced passes, bar priority, maximum
dice use, the higher-die rule, oversized bearoffs and early wins. Full state,
canonical path and ordering must match exactly. Input immutability and fresh
result objects are checked separately.

## Recorded speed and numerical parity

Five alternating paired samples on Apple M4 Pro, macOS Darwin 25.5.0. Each
enumeration sample averages 50 calls after warmup. Median milliseconds:

| Position | Chromium 145, before → after | Firefox 146, before → after | WebKit 26, before → after |
| --- | ---: | ---: | ---: |
| Starting 3–3, 536 paths / 73 results | 2.442 → 1.030 | 3.080 → 1.200 | 2.440 → 1.040 |
| Contact 3–3, 799 paths / 88 results | 3.600 → 1.364 | 4.240 → 1.580 | 3.680 → 1.380 |
| Race 3–3, 621 paths / 64 results | 2.846 → 1.088 | 3.320 → 1.240 | 2.900 → 1.080 |
| Starting 3–1 control, 31 paths / 16 results | 0.132 → 0.134 | 0.160 → 0.160 | 0.160 → 0.140 |

The browser experiment also compares complete native analyses using the same
captured evaluator and WASM assets, with only the rules module substituted.
It uses four positions, Quick/Standard/Deep, five alternating pairs, and a
fresh worker/native cache for every sample. All 120 pairs across Chromium and
WebKit had exactly equal candidate sets, ordering, canonical steps, equities,
probabilities and result metadata, excluding elapsed time and request ID.
Firefox ran enumeration comparisons only.

End-to-end Quick analysis improved from 6.5 to 4.7 ms for starting 3–3 and 9.0
to 6.3 ms for contact 3–3 in Chromium. WebKit measured 8 to 6 ms and 10 to 7 ms.
Two-ply native analysis remains dominated by GNUbg: starting/contact Deep
medians were 625.6/633.4 ms before and 626.5/626.9 ms after in Chromium, and
629/646 ms before and 632/653 ms after in WebKit. These samples do not establish
a meaningful Deep-search speedup. Bearoff and ordinary-roll controls showed no
consistent improvement.

These are local desktop timings with background load, not physical-phone
results or a universal speed guarantee. Median/range are recorded; no tail
latency is estimated from five samples. Faster enumeration does not establish
stronger play or closer agreement with XG.

Raw timings, positions, asset hashes, exact native numerical rows and
per-sample numerical checksums:

- [Chromium](legal-turns-speed-chromium.json)
- [Firefox](legal-turns-speed-firefox.json)
- [WebKit](legal-turns-speed-webkit.json)

Reproduce from the repository root:

```sh
node --test backgammon/tests/legal-turns.test.mjs
node backgammon/scripts/legal-turns-benchmark.cjs
BG_BROWSER=webkit node backgammon/scripts/legal-turns-benchmark.cjs
BG_BROWSER=firefox BG_MICRO_ONLY=1 node backgammon/scripts/legal-turns-benchmark.cjs
```

The benchmark serves captured repository files itself. Baseline rules are
pinned to `570f30472ec96b2450ed2822be344391f228c139`; all other modules and
native assets are shared between variants. Native initialization and asset
transfer are recorded separately and excluded from the measured analysis.
