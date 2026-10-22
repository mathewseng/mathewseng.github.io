# Independent learned evaluators

PureTD money and PureTD wide are experimental **live checker evaluators** in Solver → Analysis
settings. Each uses a separately trained neural network and one full turn of
lookahead. It generates and evaluates every legal root move, including moves
absent from the opening reference. It does not consult the opening book, use XG
values in search, or apply a fitted equity adjustment.

GNUbg remains the default engine and continues to provide match analysis, cube
decisions and rollouts. The new option supports money play with the cube and
Jacoby enabled, without beavers or raccoons. Unsupported positions are rejected
before loading the model. It estimates cubeful equity directly: no win/gammon
probabilities, cubeless equity or match-winning chances are invented. Saved
results retain the model hash, engine identity and search settings. With either
learned checker option selected, cube decisions use labeled GNUbg two-ply
analysis so a mixed checker/cube game review can continue.

## Complete opening comparison

The exploratory comparison covers all **729** positions and **2,584** candidate
values in the published XG 3.70 opening/reply corpus. All engines independently
generate the same **16,091** legal resulting boards. Every chosen move is covered
by the reference. Every reference candidate in the Sage comparisons was actually
evaluated at the stated depth; shallow screened values are not substituted.

| Search | XG choices / 729 | Mean XG loss of chosen move | Mean absolute EV difference | Values within ±0.005 / 2,584 |
| --- | ---: | ---: | ---: | ---: |
| GNUbg 2 ply, ordinary money rules | 673 | 0.000618 | 0.023750 | 213 |
| Sage 2 ply (one subsequent turn) | 665 | 0.000871 | 0.030672 | 160 |
| Sage 3 ply (two subsequent turns) | 680 | 0.000505 | 0.023072 | 212 |
| PureTD 0 ply | 692 | 0.000339 | 0.007792 | 1,148 |
| PureTD 1 ply | 704 | 0.000167 | 0.004474 | 1,669 |
| PureTD wide 0 ply | 701 | 0.000156 | 0.006047 | 1,412 |
| PureTD wide 1 ply | 705 | 0.000088 | 0.003791 | 1,881 |

PureTD wide's one-ply mean absolute difference is about 84% smaller than the GNUbg
two-ply result **on this selected opening corpus**. This is not a general
playing-strength or Elo result. **703 values still miss the requested 0.005
tolerance**, and 24 choices differ. Its largest absolute difference is 0.028724.
An average below the tolerance does not satisfy an every-position requirement.
The larger model was selected for testing because its author reported better
self-play performance; the two model comparisons here are exploratory, not a
held-out model-selection test. The smaller model is retained as a faster option.

By stage, the smaller one-ply model agrees on all 15 opening choices and 689 of
714 replies; the wider one agrees on 14 openings and 691 replies. The wider
model's sole opening disagreement is 6–4: it makes the two-point instead of
splitting and bringing down a builder. XG's printed gap is only 0.0017, with
individual reported margins of 0.0022 and 0.0020, so the ranking difference alone
does not establish a meaningful playing-strength loss. All six listed 6–4 EVs
are within ±0.005. For opening 2–1, both models choose XG's slot; every one of its
five listed candidate EVs is within ±0.005. Wide estimates the slot at 0.009986
versus XG's 0.0115. Other opening EVs still miss the tolerance.

On the **same 666 positions and 1,494 common candidate values** as the existing
deeper book, historical GNUbg five-ply matches 625 XG choices with mean absolute
EV difference 0.012891. PureTD wide one-ply matches 644 with mean difference
0.003216 and 1,195 values within ±0.005. Historical four-ply matches 631 with
mean difference 0.013426. These are matched coverage comparisons; the historical
book retains its original engine provenance and finalist filter, while PureTD
scores every legal root. The source is `deep-book-comparison.json`, whose hash is
recorded in the new input manifest. The older results are not rewritten.

The ordinary GNUbg comparison uses Jacoby with beavers/raccoons off, matching
PureTD's supported rules. A separate beavers-on GNUbg run chose the same 673
reference moves and had virtually the same mean EV difference. Sage uses beavers
without raccoons. The published XG references use Jacoby and immediate redoubles;
therefore none of these tree comparisons is a fully identical XG rule comparison.
The references themselves are finite rollouts or XGRoller++ estimates, often
with small printed margins. They are not exact truth. See the preserved source
attribution and margins in `deep-book-xg-reference.json`.

Sage counts the initial checker move as a ply. GNUbg and PureTD count subsequent
lookahead turns. A larger displayed ply number across engines is not evidence of
a deeper or stronger policy. Root filtering also differs: GNUbg/PureTD score all
legal roots at the stated depth; Sage uses its documented default search filter.

## 4–4 after the 4–1 slot

| Move | XG | PureTD wide 1 ply | Difference |
| --- | ---: | ---: | ---: |
| 24/20* 20/16* 13/9(2) | 0.6118 | 0.628880 | +0.017080 |
| 24/20* 20/16* 8/4(2) | 0.6005 | 0.604517 | +0.004017 |
| 24/20*(2) 13/9(2) | 0.5589 | 0.568099 | +0.009199 |

PureTD wide chooses XG's move here, but its top-two gap is 0.024363 compared with
XG's 0.0113, and two of three EVs remain outside tolerance. Switching models is not
a resolution of this discrepancy. This deterministic tree comparison does not
isolate full-game continuation error or sampling noise. The separately frozen
corrected-GNUbg full-game experiment performs that test; these results do not
alter its candidates, policies, seeds, stopping rule or interpretation.

## Source, model and implementation

- [PureTD source](https://github.com/alexstrehl/backgammon-ai-engine/tree/18b0a80d258e388a2ed04b0f9d81993fb6723e1b),
  commit `18b0a80d258e388a2ed04b0f9d81993fb6723e1b`, MIT, © 2026 Alex Strehl.
  The pinned checkpoint is `best_models/cubeful_money_512_512_256_256.pt`.
  See also [the author's paper](https://arxiv.org/html/2608.15146v2).
- The exported BGNV2 model uses `cubeful_perspective196`, 200 input features,
  hidden widths 512/512/256/256, ReLU, and one equity output. It contains 562,945
  parameters and is 2,251,884 bytes. SHA-256:
  `2cd329209d05f4652b79c095df585c0eddbbc6b8f8b6901eb4bfce7ace8f1a96`.
- The wider checkpoint is
  `best_models/experimental/cubeful_money_768_768_256_256_256.pt`, with 1,073,665
  parameters and widths 768/768/256/256/256. Its exported file is 4,294,768 bytes,
  SHA-256 `cd48b1bb58ed4a7c903c030b33d36467127b3e3b5ad0410dc8cf770e0d2d109f`.
  Both checkpoints and their provenance are included in the source archive.
- [Sage source](https://github.com/markbgsage/bgsage/tree/139427d826dd67798226e7d23c003c90315306ba),
  commit `139427d826dd67798226e7d23c003c90315306ba`, default stage-11 models,
  MPL-2.0. Its source/model Git blob identities are preserved in
  `learned-sage-source-lock.json`. Sage is a research comparison, not a shipped
  browser engine.
- GNUbg uses the corrected pinned research build documented in
  `FILTERED-ROLLOUT-FIX.md`. The direct two-ply checker driver does not use the
  filtered rollout selector. It scores every root with normal internal pruning.

The PureTD source archive contains unmodified upstream files and the original
checkpoint, each verified against its Git blob hash. Our two browser inference
backends change memory layout and batching only. SIMD shares weight loads across
four board rows and accumulates each output's inputs in their original order.
The scalar fallback interleaves eight independent outputs and skips zero
activations. Both disable floating-point contraction and preserve the trained
weights. The small-batch SIMD path avoids computing unused rows. No source from
XG or proprietary XG model is included.

The adapter independently checks the complete legal resulting-board set and
player orientation. Forced passes use the opponent's pre-roll value, including
the opponent's legal cube decision at one ply. Terminal checker results use the
upstream exact payoff handling. The model represents ongoing ordinary money
cube play rather than a finite match or a specially capped cube game. Values are
in units of the current cube. Search runs in a dedicated worker with cancellation,
bounded result caching, and a separate cache from GNUbg and reference books.

## Reproduction and evidence

`engine/source/puretd/release.json` pins every shipped asset, the source archive
and both custom backends. With Emscripten 4.0.15 and Python with torch/numpy:

```sh
python backgammon/scripts/build-puretd.py \
  --emcc /path/to/emscripten/emcc --python /path/to/python \
  --out /tmp/puretd-rebuilt
```

The builder verifies all upstream Git blobs, exports the original checkpoint and
requires every output to match the release hashes. The recorded export used
Python 3.11, torch 2.14.1 and numpy 2.4.6. Build verification is recorded in
`puretd-rebuild-validation.json`.

Generate the exact canonical comparison inputs:

```sh
node backgammon/scripts/learned-evaluator-inputs.mjs /tmp/openings.json
node backgammon/scripts/learned-evaluator-inputs.mjs /tmp/openings-gnu.json --gnu
```

Use the pinned upstream source on `PYTHONPATH`. Build its native reference C API
with `c_api/backend_ref.build.sh`; the original runs also used an Apple Accelerate
CBLAS build. The CBLAS zero-ply run agreed with the scalar native reference on all
16,091 values to within 0.000000805, with no changed best moves. CBLAS one-ply
values are retained as the deeper numeric oracle. Examples:

```sh
python backgammon/scripts/run-learned-evaluator.py --engine puretd \
  --inputs /tmp/openings.json --model /path/to/money.bin --level 1 \
  --backend ref --out /tmp/puretd-1ply.jsonl
python backgammon/scripts/run-learned-evaluator.py --engine sage \
  --inputs /tmp/openings.json --level 3 --beavers --out /tmp/sage-3ply.jsonl
```

For GNUbg, build a fresh research directory with
`node backgammon/scripts/build-filtered-rollout-native.mjs /tmp/gnu-study`.
Link `scripts/learned-gnu-score.c` against that directory's objects excluding
`obj/gnubg-core.o`, with `src` and `src/lib` include paths and `-lm`. Then run:

```sh
python backgammon/scripts/run-learned-evaluator.py --engine gnu \
  --inputs /tmp/openings-gnu.json --level 2 \
  --gnu-driver /path/to/learned-gnu-score --gnu-root /tmp/gnu-study \
  --out /tmp/gnu-2ply.jsonl
```

All raw comparisons and hashes are listed in `learned-evaluator-inputs.json`.
`node backgammon/scripts/compare-learned-evaluators.mjs` recomputes the complete
candidate differences and the compact public report. It refuses missing or
duplicate positions, changed raw files, uncovered chosen moves, and Sage
reference candidates that were not evaluated at the claimed depth. Native run
timings are exploratory and must not be treated as a controlled speed benchmark.

`puretd-native-parity.json.gz` includes independent native values for all opening
positions at zero/one ply and 210 additional geometry fixtures: contact, race,
crashed positions, forced passes, bar entries, oversized dice and early wins,
both player orientations, and all three cube-ownership contexts. Historical GNU
reference equities are not used for these money-game geometry tests. Regenerate
them with `puretd-parity-inputs.mjs` and `puretd-native-parity.py`.
`puretd-wide-native-parity.json.gz` runs the same fixtures against the wider model.

After assembling `_site`, run the actual worker/UI and native-parity checks:

```sh
BG_MODULES=puretd-parity,puretd-ui,puretd-loading,learned-evaluators BG_BROWSERS=chromium,firefox,webkit \
  node backgammon/tests/browser.cjs
BG_PURETD_MODEL=wide BG_TEST_OUT=backgammon/test-results/puretd-wide \
  BG_MODULES=puretd-parity BG_BROWSERS=chromium,firefox,webkit \
  node backgammon/tests/browser.cjs
node backgammon/scripts/summarize-puretd-validation.mjs
node --test backgammon/tests/puretd.test.mjs backgammon/tests/learned-evaluators.test.mjs
```

Chromium/SIMD checks every opening and all 210 additional fixtures at both depths.
Every browser/backend checks every opening and additional fixture at zero ply,
all 15 opening rolls and one of each of the 21 reply rolls in different opening
contexts at one ply, and a fixed every-fifth general
corpus context plus all 30 edge cases at one ply. These verify numerical implementation,
legal coverage, orientation and persistence; they do not prove XG accuracy.
The original Chromium scalar runs used an every-21st-position opening/reply
subset; their complete SIMD one-ply checks are unchanged. The revised subset
avoids repeatedly selecting the same reply roll from the sorted corpus. The
validation summary records the actual indices for every browser/model run.

For exploratory search latency with three repetitions, rotating method order,
fresh workers per repetition and no reference/result-cache hits:

```sh
BG_MODULES=checker-speed BG_BROWSERS=chromium,webkit,firefox \
  node backgammon/tests/browser.cjs
```

This optional measurement covers ten fixed positions, records startup separately
and allows native position caches to warm naturally. It is not a timing test,
an isolated-machine benchmark or evidence of general playing strength.
