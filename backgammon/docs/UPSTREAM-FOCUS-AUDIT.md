# Independent GNUbg integration audit

The shipped engine and an unmodified GNUbg 1.08.003 build agree on 89 checker
evaluations across 45 decision contexts: the disputed 4–4 reply at 0, 2 and
3 ply, and every one of the 21 immediate rolls after each of its two double-hit
continuations. Four continuations are forced passes. Maximum absolute equity
difference is 0.00000356; maximum outcome-probability difference is 0.00000170.
The declared numerical tolerance is 0.0001, well below the requested 0.005 EV
accuracy target. The audit is deterministic and adds no games to the frozen
163,840-game policy study.

This checks integration with GNUbg, not playing strength against XG. Both
implementations use the same neural weights, bearoff data and match-equity
table. The independent program uses its own original source, parsing, move
generation and evaluation code. It reproduces the preference for making the
4-point. The early-position discrepancy with XG therefore is not explained
by a porting or probability-scaling error in the tested inputs. Errors in
later decisions were outside this audit. A separate full-game trace subsequently
found a filtered move-selection defect, repaired in bg9; see the
[regression](filtered-rollout-regression.json). Shared GNUbg modeling assumptions
and XG policy differences can still matter after that repair.

## Comparable settings

All cases use Jacoby money play, an ordinary centered cube, deterministic
noiseless evaluation and internal pruning. Each CLI invocation starts fresh.
Its root move filters are disabled so every printed candidate uses the
requested depth. Up to five reported candidates are compared per case,
including all five outcome probabilities. Each parsed move must produce a
board in our full legal-result set before its equity is compared.

The depth condition matters: GNUbg can label a filtered or forced candidate
as 0-ply while retaining the requested deeper search's cube-efficiency
context. Comparing that printed equity to a standalone 0-ply call produces
spurious differences of about 0.03 here. Disabling root filters eliminates
that settings mismatch; the final audit rejects unexpected shallower output.
Neither implementation was adjusted to reproduce the other's values.

The official build is scalar x86_64 under Rosetta, using installed libraries.
Readline, threading, GUI and Python integration are disabled. Evaluation,
rollout, neural-network, RNG, move-filter, CLI and position-encoding sources
were checked byte-for-byte against the pinned source archive. These native
timings are not used to claim a speed improvement. See the
[build record](upstream-focus-build.json), [all numerical comparisons](upstream-focus-validation.json)
and [original source archive](https://deb.debian.org/debian/pool/main/g/gnubg/gnubg_1.08.003.orig.tar.gz).

To reproduce with an independently built GNUbg and matching data:

```sh
GNUBG_BIN=/path/to/gnubg GNUBG_DATA=/path/to/data \
  node backgammon/scripts/audit-upstream-focus.mjs
node --test backgammon/tests/upstream-focus.test.mjs
```

The data directory must include `gnubg.wd`, `gnubg.weights`, `gnubg_os0.bd`,
`gnubg_ts0.bd` and `met/Kazaross-XG2.xml`. Their hashes are retained in the
comparison report. The original full-game data remains unchanged and is now explicitly scoped
to the affected historical selector.
