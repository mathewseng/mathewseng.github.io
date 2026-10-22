# Six-reply full-game precision study

The completed 4,096-trial full-game cohort left six sampled reply leaders different from the historical XG reference. The new fixed study evaluates all 20 retained alternatives in those six positions at 32,768 fresh trials per move: 655,360 trials in 20,480 batches. This includes the third retained leader in 62$–32, which the earlier historical fixed pair did not compare directly against XG.

The signed plan is `reply-fullgame-precision-inputs.json`. Commit the plan before collection. Candidates, policies, seeds and sample sizes do not change after results are inspected. All six positions use the existing Full/strong policy: 2-ply checker and cube decisions throughout, no turn cutoff, eligible bearoff endpoints, variance reduction, Jacoby on and beavers off. The native build and runtime assets are unchanged. Seeds exclude every prior planned experiment, including both completed precision studies. There is no pooling or optional stopping.

Inference uses 1,024 independent blocks per move. Shared seeds preserve paired covariance. There are separate simultaneous 95% Student-t families for six historical fixed-pair gaps and 14 XG-choice-versus-other-retained-move contrasts. These families do not jointly provide one 95% guarantee. A confidence interval crossing zero means unresolved, not equivalent or proven sampling noise. A persistent preference against XG demonstrates a disagreement under our continuation policy, not necessarily a defect in the neural weights. XG's reference has sampling uncertainty and uses beavers; its marginal confidence bounds do not provide paired covariance.

After complete provenance, seed, candidate, statistical and application validation, replace all six entries together as a precision refinement under the unchanged policy, regardless of their winning moves. Do not select a publication subset or force XG rankings. Any subsequent policy/rule experiment requires its own independent fixed plan and must retain these results.

The user also requests close EVs and matching choices throughout the opening/reply book. The broader baseline is 15/15 opening choices and 636/651 reply choices matching XG, not six remaining differences across the entire book. The additional nine differing replies and all absolute EV differences must remain visible in the accuracy audit. Use 0.005 absolute equity as the working closeness target unless the user specifies otherwise; this engineering tolerance is distinct from statistical confidence and reference uncertainty.

Run with Node 22:

```sh
BG_ROLLOUT_WORKERS=12 BG_ROLLOUT_REMOTE_WORKERS=10 node backgammon/scripts/run-fullgame-ablation.mjs --residual-precision
```

The default checkpoint directory is `backgammon/test-results/reply-fullgame-precision-v1`. Scheduling may change without changing the signed sample. Progress reports counts only; inspect equities after the entire fixed sample completes.

Published per-move reference values retain their original XG contributor credits.
The summarizer joins credits by the legal resulting board against the unchanged
reference collection, verifies each equity, and records the attribution file's
SHA-256. This adds source metadata without changing the sample or inference.

## Completed results — 22 October 2026

All 655,360 trials completed: 32,768 per retained move, 20,480 complete batches,
with the signed sample and continuation policy unchanged. All six independent
book entries were updated together, including positions that still disagree.

| Position | Sampled leader matches XG | Inference across retained alternatives |
| --- | --- | --- |
| 32 down → 51 | No | Unresolved |
| 41 slot → 44 | No | Persistent policy disagreement |
| 51 slot → 52 | No | Unresolved |
| 64 point → 33 | Yes | Unresolved |
| 64 split → 21 | No | Unresolved |
| 62 slot → 32 | Yes | Unresolved |

For 41 slot → 44, GNUbg favors `24/16 8/4(2)` over XG's
`24/16 13/9(2)` by 0.01608, with simultaneous 95% bounds
[0.00539, 0.02677]. XG instead favors its choice by 0.01130.
The GNUbg estimate for XG's choice is 0.58499 versus the published 0.61180,
a difference of −0.02681. The alternative's estimate is 0.60107 versus 0.60050.
This is position- and move-dependent; applying a global EV offset would not fix it.

This disagreement persists without a turn cutoff. More trials under the same
policy have not removed it. They do not identify whether the cause is checker
play, cube play, the evaluator, move filtering or the different reference rules.
The other five positions are unresolved, not proven equivalent or proven to
have disagreed solely because of sampling noise. Two sampled leaders moved into
agreement with XG, but neither is statistically ahead of every retained move.

Eighteen of the 20 candidate means are within the user's 0.005 tolerance.
The other exception is `13/8 13/11` after 51 slot → 52, at +0.00581 versus XG.
These are descriptive distances from uncertain historical reference estimates;
they do not establish joint 0.005 equivalence. Across the broader independent
book, the updated audit reports 15/15 opening choices and 638/651 reply choices
matching XG; only 180/651 reference-best reply EVs are within 0.005.
The general GNUbg evaluator therefore does not satisfy the requested accuracy
throughout the book.

As an exploratory influence check after completion, deleting any one of the
1,024 paired blocks in the persistent case leaves its mean XG-minus-alternative
gap between −0.01652 and −0.01555. The slow final batch is not the sole cause.
This check does not replace or modify the prespecified confidence intervals.
All batches, including that batch, remain in the published results.

The application uses the separately attributed published XG values for covered
opening/reply positions under their matching money/Jacoby/beaver/raccoon context.
Uncovered guide positions use labeled GNUbg fallback. No independent GNUbg EVs
or rankings were edited to resemble XG, and imported-reference agreement is not
claimed as an improvement in the independent evaluator.
