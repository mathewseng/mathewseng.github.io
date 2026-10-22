# Internal checker pruning and the Verify control

Disabling GNUbg's internal pruning does **not** resolve 4–4 after the 4–1 slot, and this experiment does not establish a general improvement in EV accuracy. The optional **Verify · unpruned** control provides an independent calculation of Research's checker finalists with that approximation removed. Auto, Research, rollout policies and reference books retain their existing settings.

Verify uses Research's normal two-ply shortlist and retains the normal three-ply Expert leader. It evaluates every displayed finalist, including a submitted move, at four ply with internal pruning disabled. This expands the checker moves considered by the full evaluation network inside lookahead; it does not make the root shortlist or the entire game tree exhaustive. It bypasses opening books. The result records `pruning: false`, while the screening metadata separately records normal pruning. Prepared grades and native/JavaScript caches distinguish the two policies.

Verification is implemented by the optional `bg_score_config` native export. The historical `bg_score` ABI and `engine/source/bridge.c` remain intact. A runtime without the new export rejects checker verification explicitly. Cube requests under Verify use the existing four-ply Research cube search, record `pruning: true`, and explain that the verification control applies to checkers.

## Separate deterministic experiment

The [summary](internal-pruning-audit.json) and [compressed inputs, complete scores and diagnostic source](internal-pruning-audit-data.json.gz) preserve the evidence. This is separate from the frozen cube-policy v2 rollout experiment; no v2 inputs, results, seeds, source files or claims were changed or pooled.

Before scoring, the experiment selected 20 previously unused positions from each of GNUbg's historical contact, race and crashed benchmark files. Selection used a recorded SHA-256 salt and excluded all 300 board keys in the earlier local accuracy corpus. These are 60 distinct boards, each evaluated in three contexts: the original cubeless money position, Jacoby money with an ordinary cube, and a seven-point match at scores 2–4 with the mover owning a two-cube. They are not an independent engine benchmark or a guaranteed holdout from neural-network training.

All 1,914 legal root moves across 180 contexts were scored at two ply with internal pruning on and off. Both depth fields passed to GNUbg were two, avoiding mixed root-depth cube-efficiency settings. Arm order alternated; caches were cleared between positions/policies and reused among root candidates. Native source, weights, exact bearoff data and other search settings were identical. The driver linked unchanged objects from the documented v2 native runtime, with the fixed checker-context cache enabled and experimental cube rules disabled.

Only **one of 180** recommendations changed. At contact position 13 in its original cubeless context, the unpruned choice gained 0.002177 under its own two-ply evaluation. Its historical rollout loss decreased from 0.042907 to 0.016492. The other 179 choices were unchanged, but individual candidate equities changed by as much as **0.046567**. Three selected-move equities changed by more than 0.005. A stable move recommendation therefore does not establish equally accurate move values.

Historical reference comparisons use only the 60 cubeless contexts. The published candidate lists cover 263 evaluated moves and 57 of the 60 selected moves under both policies. Three uncovered selected moves are excluded from selected-move metrics explicitly. Root-weighted errors first average over the covered candidates within each position, then weight all 60 positions equally. These old GNUbg rollout values are noisy estimates from the same engine family, not exact truth or XG values.

| Descriptive metric | Pruned | Unpruned |
| --- | ---: | ---: |
| Selected-move mean reference loss, 57 covered roots | 0.002810 | 0.002347 |
| Selected-move absolute EV error, 57 covered roots | 0.019206 | 0.019158 |
| Root-weighted candidate absolute EV error, 60 roots | 0.019283 | 0.019383 |
| Root-weighted candidate RMSE, 60 roots | 0.029192 | 0.029374 |

The move-loss improvement comes entirely from one changed decision. Candidate absolute error improved in eight roots and worsened in thirteen; the rest were unchanged within 0.0000001. These mixed, small changes do not support advertising unpruned evaluation as generally more accurate.

## Four-ply and focused checks

After completing the two-ply experiment, a fixed subset—source positions 0 and 10 in each class, in all three contexts—tested the actual Research shortlist at four ply. Both arms retained identical finalists and the normal Expert leader. Across 18 contexts and 45 finalists, no recommendation changed; the largest candidate EV change was 0.004078.

Native CPU time for the final four-ply scores totaled 32.773 seconds with pruning and 73.718 seconds without it. The median per-position ratio was 1.90×, and the largest individual unpruned search took 13.235 CPU seconds. At two ply the totals were 6.697 and 11.010 seconds. These are single native samples on an Apple M4 Pro with ordinary concurrent work, not browser, phone or repeated-run latency claims. They support warning that verification costs more time.

For the two 4–4 continuations after 4–1 slot, the separate four-ply root probe used the production future-beaver approximation:

| Move after the double hit | Pruned EV | Unpruned EV |
| --- | ---: | ---: |
| 8/4(2) | 0.648958445 | 0.649341226 |
| 13/9(2) | 0.638151109 | 0.638208032 |
| 13/9 minus 8/4 | −0.010807336 | −0.011133194 |

Both still prefer 8/4(2). These are deterministic root estimates, not replacement full-game rollout results. Disabling pruning does not explain the remaining disagreement with the published XG rollout.

The independent probe matched the existing native bridge on 36 context/depth inputs within 0.0000001; pruning on/off was exactly equal on 18 zero-ply controls. The [new configurable ABI validation](checker-verification-native-validation.json) matched that independent probe on 72 context/depth/policy inputs, with a maximum difference of 0.000000005 from JSON formatting. Unit tests additionally cover identical Research/Verify finalists, separate caches, unlisted submitted moves, preserved Auto settings, unsupported-runtime failure and truthful cube metadata. Browser release validation is recorded separately by the release process.
