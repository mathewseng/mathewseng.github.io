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
