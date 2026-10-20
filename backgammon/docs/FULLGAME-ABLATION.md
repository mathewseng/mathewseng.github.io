# Full-game cutoff, checker and cube ablation

This experiment follows the independent 4,096-trial confirmation. It tests opening 2–1 and the 14 replies whose preference against the published XG book survived that confirmation's simultaneous intervals. The positions and competing moves are fixed before collecting new samples.

## Controlled comparisons

| Policy | Checker play | Cube decisions | Endpoint |
| --- | --- | --- | --- |
| Short | GNUbg 2-ply for two turns, then 1-ply | 2-ply throughout | After five turns, evaluate at 2-ply |
| Full, matched | Same as Short | Same as Short | No turn cutoff |
| Full, stronger checker | 2-ply throughout | 2-ply throughout | No turn cutoff |
| Full, deeper cube | 2-ply throughout | 3-ply throughout | No turn cutoff |

Both simulated players use the same settings. The first contrast changes only the cutoff, the second changes late checker play, and the third changes cube depth. These are conditional effects at the stated settings, not a complete factorial experiment or proof that deeper policies are universally stronger. Normal GNUbg move filters remain enabled; a ply label does not imply exhaustive minimax search.

Full-game means play continues to a cube pass, game completion, or an eligible bearoff database endpoint. There is no five-turn neural evaluation endpoint. The neural evaluator still informs checker and cube decisions, and supplies variance-reduction control variates. Variance reduction subtracts the sampled roll's estimate from its exact dice-weighted mean; this is distinct from terminating the simulation at that estimate. Cubeless probabilities reported when the cubeful game ends by a pass can still use GNUbg's conditional evaluation. The primary outcome here is cubeful equity.

## Fixed samples and analysis

Each of the 30 disputed moves receives 1,024 fresh trials under each policy. The stronger-checker policy additionally evaluates all 15 other previously retained moves, so it can support a coherent comparison of the complete retained candidate set. Total: **138,240 trials**, in **4,320 independent batches of 32**. The count was fixed before examining any new equity estimates; timing pilots and implementation parity samples are excluded. There is no significance-driven stopping and no pooling with earlier experiments.

Candidates and policies for a position share the same per-trial dice seeds. Different positions have disjoint seeds, and every actual seed is checked against both preceding experiments and the timing/parity checks. GNUbg seeds trial `i` with `(batch seed + 256*i) mod 2^32`; the experiment uses a 65,536 increment between batches.

For each batch, the move gap is the previous GNUbg choice minus the XG choice. Positive favors the previous choice. Each causal contrast is the new policy's gap minus the preceding policy's gap, using the same paired batches. A negative shift moves the preference toward XG. This difference of differences preserves covariance both between the competing moves and between policies.

Two-sided Student-t intervals use independent batch means (31 degrees of freedom). The three primary effects across 15 positions form a 45-contrast family with Bonferroni simultaneous 95% coverage. The four policy gaps across 15 positions form a separate 60-contrast family. Each family has its own coverage statement; they do not jointly constitute a single 95% family. Ordinary 95% intervals are also saved. An interval crossing zero is unresolved, not evidence of equality.

All retained moves were screened in earlier three-/four-/five-ply work. Completing this candidate set does not eliminate screening risk. Mean agreement and gap error across these deliberately selected disagreements describe this cohort; they do not measure general playing strength.

## What the experiment can identify

A clear shift when the cutoff alone is removed is evidence of a truncated-endpoint effect under the unchanged continuation policy. A shift from Full/matched to Full/stronger-checker identifies the effect of continuing with stronger checker settings. A shift from Full/stronger-checker to Full/deeper-cube identifies the effect of the cube setting.

Residual disagreement in full-game results is not, by itself, proof of a defective neural network. It can reflect checker/cube policy, move filters, rule differences, sampling uncertainty, or uncertainty in the reference. These ablations do not replace the neural network while holding decisions fixed. The XG numbers are published historical rollouts, not a newly run XG executable. XG enables beavers; this experiment retains the earlier GNUbg Jacoby-on, beavers-off rules to avoid confounding the cutoff comparison.

## Implementation and reproduction

The offline native build applies `scripts/rollout-ablation.patch` to the existing bridge, separating the previously coupled cutoff and late-player controls. It also permits 3-ply cube evaluation. Browser engine assets are not rebuilt by this experiment. The original seven-field native protocol remains available in ordinary builds; `--ablation` selects the eleven-field experiment protocol.

Before the run, 12 seeded cases (two positions, two moves each, three existing policies) reproduced the baseline native JSON exactly, including scores, probabilities, standard errors and policy metadata. See `fullgame-native-validation.json`. Statistical fixtures test paired covariance, effect direction, complete candidate comparisons and rejection of incomplete, duplicate, mis-seeded, mislabelled or nonfinite records.

From the repository root, using Node 22, Python 3 and clang:

```sh
node backgammon/scripts/build-rollout-native.mjs /tmp/bg-fullgame-ablation-v1 --ablation
BG_ROLLOUT_WORKERS=8 node backgammon/scripts/run-fullgame-ablation.mjs
python3 backgammon/scripts/summarize-fullgame-ablation.py --publish
node --test backgammon/tests/fullgame-ablation.test.mjs
```

`BG_ROLLOUT_NATIVE` selects a build directory and `BG_ABLATION_OUT` selects the checkpoint directory. The fixed sample count is not a runtime knob. SIGTERM stops after active batches finish; restarting resumes the same signed plan. Complete raw batches, seeds, build hashes and source hashes are retained. Publication rejects incomplete or altered samples. Rebuilding generates a new build manifest; use a new checkpoint directory for an independently rebuilt experiment.

## Book update decision rule

The separately recorded `fullgame-promotion-plan.json` fixes the publication rule before inspecting new equities. A complete Full/strong cohort qualifies only if its mean absolute fixed-pair gap difference from XG improves on the fresh Short baseline, it has at least as many fixed-pair mean preferences for XG, and at least one cutoff or checker effect shifts clearly toward XG under the planned simultaneous interval. If it qualifies, all 15 positions and all their retained alternatives are updated together at the same policy and sample count. Individual positions are not cherry-picked from the new winners. This is a targeted engineering acceptance test, not independent evidence of general playing strength. The deeper-cube arm cannot replace a full candidate comparison unless its other alternatives are also computed.

## Independent opening 2–1 precision confirmation

Before inspecting any new equity comparisons, a separate 4,096-trial confirmation was added for the user's specifically requested opening 2–1. It runs Short, Full/matched and Full/strong, with two disputed moves under the first two policies and all four retained alternatives under Full/strong: **32,768 additional trials**, in 1,024 batches. Every actual trial seed is disjoint from all preceding experiments and all 1,024-trial primary-ablation seeds, including planned trials that had not yet run. The primary experiment, its sample count and its acceptance rule are unchanged.

This confirmation uses 128 independent batches per move/policy (127 degrees of freedom). Cutoff and checker effects form a two-comparison simultaneous 95% family; the three policy gaps form a separate three-comparison family. The results are analyzed independently, without pooling with the 15-position ablation. Its complete Full/strong comparison can replace the 1,024-trial opening entry as a precision refinement only after the primary cohort qualifies; all four alternatives are replaced together regardless of which move wins. No deeper-cube claim is inferred from this supplement.

The additional plan is recorded in `opening-fullgame-confirmation-inputs.json`. Run and summarize it with:

```sh
BG_ROLLOUT_WORKERS=2 node backgammon/scripts/run-fullgame-ablation.mjs --opening-confirmation
python3 backgammon/scripts/summarize-fullgame-ablation.py --opening-confirmation --publish
```

The default checkpoint directory is `test-results/opening-fullgame-confirmation-v1`. The primary native executable is reused. This supplement was chosen for greater precision on the explicitly requested opening, before viewing the primary run's equity results; it is not a significance-driven extension of a revealed result.
