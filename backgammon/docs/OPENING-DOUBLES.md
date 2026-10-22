# Starting-position doubles

The opening guide includes doubles as study positions, although a real game
rerolls tied opening dice. They help illustrate how double rolls develop the
starting position. There are no reply branches after these hypothetical
openings. The ordinary opening/reply guide still includes all 21 reply rolls,
including doubles, under its existing XG-reference/five-ply fallback policy.

## Evaluation and coverage

The separate doubles book uses the same pinned GNUbg core, neural weights,
bearoff databases, deterministic tree search and internal pruning as the
five-ply GNUbg opening book. It scores **every legal resulting move** at
three, four and five plies, without a shallow candidate filter:

| Roll | Legal resulting moves evaluated at each depth |
| --- | ---: |
| 1–1 | 42 |
| 2–2 | 75 |
| 3–3 | 73 |
| 4–4 | 52 |
| 5–5 | 4 |
| 6–6 | 11 |
| Total | 257 |

The guide ranks the complete five-ply candidate set and shows the leader plus
every alternative within 0.040 current-cube points. All displayed EVs and
losses come from the same five-ply comparison. Intermediate-depth rankings do
not select or exclude candidates. Identical resulting positions can reuse a
score; move order and dice history do not change their evaluation context.

The context is money play, centered cube one, Jacoby on, beavers/raccoons off.
The book ID is `jacoby-starting-doubles-5ply-v2`; the old three-ply book ID is
rejected rather than relabeled as five ply. Starting doubles do not use the
published XG opening reference because that reference covers unequal openings.
Matching the deep GNUbg book's search method is not evidence of equal accuracy
to XG rollouts. Five-ply scores remain model estimates, not exact solutions;
additional depth does not guarantee a better ranking on every position.

## Computed results

All six leaders remain unchanged from three through five plies. The complete
five-ply comparison finds no second move within the guide's 0.040 window;
the guide therefore correctly shows one move for each starting double.

| Roll | Best move | 3-ply equity | 5-ply equity | 5-ply gap to second |
| --- | --- | ---: | ---: | ---: |
| 1–1 | `8/7(2) 6/5(2)` | 0.331746 | 0.343164 | 0.048429 |
| 2–2 | `13/11(2) 6/4(2)` | 0.354440 | 0.364974 | 0.057129 |
| 3–3 | `8/5(2) 6/3(2)` | 0.366760 | 0.382924 | 0.048478 |
| 4–4 | `24/20(2) 13/9(2)` | 0.482250 | 0.491881 | 0.116108 |
| 5–5 | `13/3(2)` | 0.184588 | 0.190988 | 0.200754 |
| 6–6 | `24/18(2) 13/7(2)` | 0.593219 | 0.602727 | 0.236612 |

## Reproduction

```sh
node backgammon/scripts/build-deep-book-native.mjs
BG_DEEP_WORKERS=8 node backgammon/scripts/build-opening-doubles.mjs
```

`BG_DEEP_NATIVE` can select an existing pinned build. `BG_DOUBLES_OUT` selects
the checkpoint directory (default `backgammon/test-results/opening-doubles-5ply`).
`BG_DEEP_WORKERS` accepts 1–12 workers. An optional configured SSH host in
`BG_DEEP_REMOTE` and its absolute `BG_DEEP_REMOTE_PATH` split workers evenly
between two computers. The generator checks that the remote executable and
all runtime data have exactly the same SHA-256 hashes before using it.

Every completed score is appended to a checkpoint with the original and
resulting XGIDs, search depth, values and elapsed time. SIGTERM/SIGINT stop
workers without publishing an incomplete book. A restart reuses finished
scores, drops an incomplete final log line and rejects different evaluator
or runtime data. Coverage/publication changes can reuse unchanged evaluator
scores. A lock prevents concurrent writers to one checkpoint.

The generator verifies native scores against all 16 historical 3–1 candidates
before computing the doubles. It validates all published moves and writes the
complete book atomically, only after all three depth passes finish.

## Recorded data and checks

- `engine/opening-book-data/doubles/index.json`: complete five-ply candidates,
  settings, coverage, native build/data hashes and audit/checkpoint digests.
- `docs/opening-doubles-evaluations.json.gz`: all 257 candidate moves with
  three-, four- and five-ply values and the full computation provenance.
- `docs/opening-doubles-scores.jsonl.gz`: complete native score records.

`opening-doubles.test.mjs` checks exhaustive legal-move coverage, every packed
score against its native record, consistent-depth loss calculations, all close
alternatives, both board orientations, stale-book rejection and numerical
agreement with shared after-positions in the existing five-ply opening book.
Guide tests preserve all six doubled replies to standard openings and reject
requests for replies after hypothetical doubles. Browser tests cover both
layouts, mouse/touch interaction, previews, retries and mobile sizes.
