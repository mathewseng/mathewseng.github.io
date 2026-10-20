# Five-ply opening and reply book

The opening guide and compatible Play/Trainer/Solver checker decisions use a
separate five-ply book in `engine/opening-book-data/deep/`. The historical
three-ply book remains intact for third/fourth turns and as a download fallback.
Every result identifies its actual computation engine, book ID and depth.
The browser engine itself still supports live evaluation through four plies.

## What is computed

- Every legal resulting move for all 15 unequal opening rolls is scored at
  three, four and five plies. Identical after-positions share a computation.
- Reply coverage includes the union of the historical close-opening boards and
  every opening within 0.040 equity of the five-ply leader. Each board has all
  21 reply rolls, including doubles.
- Every retained historical reply candidate is rescored at four plies. Those
  historical sets contain at least ten moves (or every legal move), plus all
  alternatives within 0.080 of their original two-ply leader. New reply boards
  score all legal moves at three plies, retaining at least ten plus the 0.080
  window for the four-ply pass.
- The five-ply reply pass takes the union of each three- and four-ply top two
  and every candidate within 0.040 at either depth. Every displayed candidate
  is then scored at five plies. This is screening, not an exhaustive five-ply
  search over all legal reply moves. An omitted submitted move falls back to a
  fresh, internally consistent live analysis.

The context is unlimited money play, centered cube, Jacoby enabled, and
beavers/raccoons disabled. These restrictions are enforced by the same runtime
book-context gate as the historical book. Match scores, owned cubes and
immediate-redouble games continue to use live analysis.

“Five ply” describes deterministic GNUbg tree evaluation with its existing
internal pruning. It does not mean a rollout or an exact solution. The 0.040
window is a coverage choice, not a confidence interval. Additional depth does
not guarantee an improvement for every position or reliable grading of a
0.002-equity difference.

The pinned core’s `EvaluatePositionCubeful4` recursively averages all 21 dice
outcomes. Internal checker moves are selected by `FindBestMoveInEval` using
static evaluation and pruning; the recursion does not search every legal
checker choice to the remaining depth. Leaf positions still use the existing
neural evaluation and cube model. A deeper horizon therefore retains policy
and model bias, and is different from a rollout played with XGRoller+ or a
multi-ply checker policy. See `src/eval.c` in the pinned source archive.

## Recorded opening results

All 190 legal resulting opening moves (175 distinct after-positions) were
computed. The comparison matches all 15 opening rolls and 79 published XG
candidate moves, using the same candidate cohort at every depth.

| Opening metric | 3 ply | 4 ply | 5 ply |
| --- | ---: | ---: | ---: |
| Mean absolute EV difference, XG's preferred move | 0.00838709 | 0.01005632 | 0.00750817 |
| Mean absolute EV difference, all 79 shared candidates | 0.00920679 | 0.00608178 | 0.00834528 |
| Same best move as XG | 13/15 | 15/15 | 13/15 |
| Mean XG-listed loss of selected move | 0.00064000 | 0 | 0.00064000 |

Five ply reduces the mean discrepancy on XG's preferred opening moves by
10.5% relative to three ply, but does not improve best-move agreement.
Four ply selects all the published opening leaders while having worse
absolute EV agreement on those leaders. Depth is not a monotonic accuracy
scale, and the different metrics should not be conflated.

The remaining five-ply choice disagreements are 2–1 (GNUbg splits; XG slots,
with published loss 0.0079 for the split) and 6–4 (GNUbg makes the 2-point;
XG splits, with published loss 0.0017 for the 2-point). For 3–1, making the
5-point is preferred by both: GNUbg's EV changes from 0.21984838 at three
plies to 0.22987324 at five, versus XG's 0.2537 (reported confidence half-width
0.0074). The larger discrepancy remains after increasing depth.

## Recorded reply results

The completed book covers 35 opening boards and all 735 reply decisions,
including doubles. The five-ply pass evaluates 1,831 candidate moves (1,758
distinct after-positions) after screening 6,596 distinct candidates at four
plies. It retains 36 close opening choices; 6–2 played 13/5 adds a reply branch
beyond the historical book.

The XG overlap is 651 reply positions and 1,415 shared candidate moves. All
651 XG-preferred replies survived the screening, and XG lists all 651 moves
selected by each tested depth. There are 84 book decisions without a matching
XG position, and 63 XG source positions outside this book's branch coverage.

| Reply metric | 3 ply | 4 ply | 5 ply |
| --- | ---: | ---: | ---: |
| Mean absolute EV difference, XG's preferred move | 0.01898 | 0.01344 | 0.01213 |
| Mean absolute EV difference, all 1,415 shared candidates | 0.02127 | 0.01384 | 0.01315 |
| Same best move as XG | 605/651 | 616/651 | 612/651 |
| Mean XG-listed loss of selected move | 0.000522 | 0.000319 | 0.000357 |

Five ply reduces the mean discrepancy on XG-preferred replies by 36.1% versus
three ply and 9.7% versus four ply. It improves choice agreement over three
ply, but four ply still matches more of XG's first choices and has lower
reference-scored move loss. The new book improves EV agreement overall;
it does not eliminate model disagreement or make increasing depth a guarantee
of better checker choices.

The generation completed on 2026-10-20 UTC. Native three-ply parity against
all historical opening candidates had maximum absolute difference
0.00000319, below the 0.00001 threshold. The complete packed evaluations are
in `deep-book-evaluations.json`; all 9,293 native score records are retained in
`deep-book-scores.jsonl`. Historical reply three-ply scores come from the
preserved historical book, while the checkpoint includes the new branch's
three-ply scores and all native four/five-ply evaluations.

## Reproduce the computation

Use Node 20 or newer, Python 3, Clang and make. From the repository root:

```sh
node backgammon/scripts/build-deep-book-native.mjs
BG_DEEP_WORKERS=10 node backgammon/scripts/deep-book.mjs
python3 backgammon/scripts/collect-xg-opening.py
node backgammon/scripts/audit-deep-book-context.mjs
node backgammon/scripts/deep-book-comparison.mjs
node backgammon/scripts/publish-deep-book.mjs
```

The build extracts the pinned bg6 corresponding-source archive. Only the
offline bridge's depth guard is raised from four to six, and the command-line
driver is replaced with a tab-separated scoring protocol. Neural weights,
cube model and pruning remain unchanged. On ARM64 the existing bg6 WASM SIMD
operations are translated to NEON; `--scalar` builds the scalar version.
Compilation uses `-O3 -ffp-contract=off`, without fast-math. Evaluation and
pruning caches have 2²³ and 2²¹ entries per worker; this is an offline memory
budget, not a change to search strength. The manifest records the compiler,
flags, architecture, input hashes and binary hash. The web binaries are never
overwritten by this build.

Override `BG_DEEP_NATIVE` for an existing native build and `BG_DEEP_OUT` for a
checkpoint directory. The default files live under ignored `test-results/`.
The first phase checks every opening candidate against the historical WASM
three-ply results, with a maximum absolute numerical tolerance of 0.00001.
No deeper phase starts after a parity failure.

Every completed score is appended to `scores.jsonl`; partial last lines are
discarded on recovery. A process lock prevents simultaneous writers. The native build, generator, historical index and policy
are hashed and changes to those inputs cannot reuse old checkpoints. Keep
helper sources unchanged when resuming; their hashes and source base
`c13638ed22711146217cc9fabf34ca4382651d4f` are recorded separately in
`deep-book-environment.json`, along with Node, OS, CPU and worker counts.
SIGTERM/SIGINT stops workers, and restarting the same command reuses completed
scores. `status.json` records the current phase and progress. Publication
requires the complete result, validates every move and all reply coverage,
then moves a staged directory into place. It refuses to overwrite an existing
published deep directory.

## External comparison

The source is [XG's public opening book 3.70](https://www.extremegammon.com/Openingbook.aspx):
one page with 15 openings and 34 pages with 21 replies each, for 729 positions.
Its 2,584 listed candidates mix finite rollouts and XGRoller++ evaluations.
Each source URL and downloaded HTML hash is recorded, along with trial counts,
policy, probabilities and published confidence widths when supplied.
Raw HTML remains in ignored `test-results/xg-opening-source/`.

Every move is converted to its resulting board and checked against this
application's legal complete turns. This handles combined notation, repeated
moves, hits and either player perspective. Comparisons use current-cube equity
and exactly the same candidate cohort across depths. Best-move agreement and
reference loss of the selected move are separate from absolute EV deviation.
Missing moves remain uncovered; they never become zero-error observations.
Means are unweighted benchmark averages over positions or shared candidates,
not expected session loss under natural dice frequencies. Both unmatched
book decisions and XG source positions outside our branch coverage are listed.

Two source limitations are explicit:

1. XG's source enables beavers, while this book disables them. Differences
   therefore are not a clean measurement of neural-model error alone. A paired three-ply audit of the reference-best move in all 729 source
   positions found a maximum beaver-on/off difference of 0.00000015
   (mean 0.00000000379). That rules setting does not explain the observed
   three-ply discrepancies in this sample. It does not establish equivalence
   at greater depths. Full pairs are in `deep-book-context-audit.json`.
2. The opening 6–5 section has an inconsistent diagram/XGID: it encodes a 3–2
   reply after 6–5. The collector preserves that original XGID and separately
   records the standard opening position implied by the section heading and
   candidate table. All other source positions pass unmodified board/dice
   validation. This correction is included in the test suite.

The machine-readable comparison is `docs/deep-book-comparison.json`; the small
public summary is `data/deep-book-comparison.json`, rendered in the
[engine report](https://mathewseng.github.io/backgammon/reports/#opening-accuracy).
The full reference is `docs/deep-book-xg-reference.json`.
The packed evaluation dataset is `docs/deep-book-evaluations.json`; the
complete native checkpoint is `docs/deep-book-scores.jsonl`. XG data is used only
to compare the independently computed GNUbg scores, never to train, select or
replace them.

## Validation

`deep-book-comparison.test.mjs` validates source-board matching and statistics,
including uncovered candidates and the source's 6–5 inconsistency.
`deep-opening-book.test.mjs` checks published coverage, legal moves, both
perspectives, provenance, consistent-depth grading and historical fallback.
The existing opening-guide browser suite exercises the actual deep assets;
historical book/browser parity tests keep their explicit three-ply source.
The actual generation run also passed a SIGTERM/restart checkpoint check.
Three additional four-ply native/WASM spot checks have maximum numerical
difference 0.00000013; pairs are in `deep-book-native-parity.json`.

Recorded checks for this release: all 494 repository tests passed. The final
16 deployment/offline/manifest tests also passed after regenerating release
assets. Focused opening-guide and deep-book browser checks passed in Chromium
145.0.7632.6, Firefox 146.0.1 and WebKit 26.0. They cover 85 live book lookups
per browser, consistent submitted-move grading, a real one-ply WASM fallback
for an unlisted reply, Solver links, the comparison report, compact/expanded
guide layouts and responsive interaction. Chromium additionally verifies a
cached five-ply opening and reply after going offline. Desktop/mobile report,
Solver and narrow compact-guide screenshots were inspected. These are browser
emulations, not measurements on physical phones. The full browser suite was
not rerun locally for this change; the focused suites above were.
