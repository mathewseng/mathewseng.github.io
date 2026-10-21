# Video Poker

Static app at `/poker/video-poker/`. Uses the shared shell, tokens and playing-card renderer. No build step, server, API key, or external runtime dependency. All calculations run locally in a cancellable worker.

## Scope and rules

17 single-draw presets: Jacks or Better (9/6), Tens or Better (6/5), Bonus (8/5), Bonus Deluxe (9/6), Double Bonus (10/7), Double Double Bonus (9/6), Triple Double Bonus (9/7), Triple Bonus Plus (9/5), Super Double Bonus (9/5), White Hot Aces (9/5), All American (40/8/8/8), full-pay Deuces Wild, Not So Ugly Ducks, Bonus Deuces Wild (10/4/4), Joker Poker (kings or better, 7/5), 2–7 Low, and Badeucey.

The scope is conventional five-card, single-draw games. Multi-stage games (Ultimate X, Super Times Pay, etc.), side bets and progressive jackpots are not modeled. Max-coin royal payouts are normalized to one practice credit; there is no variable coin-count penalty. The joker game has 53 cards; all others have 52. No discarded card can return. The Custom variants group appears first in the variant dropdown. Integer category payouts, the optional double-on-draw rule, and Badeucey qualification rules persist in local storage; practice bankroll and in-progress hands are session-only.

2–7 payouts are interpreted as **total returns including the stake**, following ordinary video-poker convention. J-high therefore pushes. Aces are high; pairs, straights and flushes lose. A-2-3-4-5 is ace-high, not a straight. The wheel is 7-5-4-3-2. Awards within a half never stack.

The user's confirmed Badeucey convention is **qualifying push + low points + badugi points**. By default both qualifiers are mandatory: a five-card high-card hand (five different ranks, no straight/flush) AND a four-card badugi. Aces are high in both halves; 5-4-3-2 is the best badugi. The four-card badugi is chosen from any four of the five cards. Both games use one draw.

The Badeucey paytable and editor separate the qualifying return, five-card low points, and four-card badugi points. T-high low and T-high badugi awards start at 0 (disabled), preserving the original return; both accept integer awards. The fixed qualifying return is 1.

Badeucey qualification can instead require 3 or 2 distinct ranks in different suits, or no badugi at all. The five-card requirement can be high card only, any unpaired hand (including straights/flushes), or any hand (including pairs). Optional rank caps apply to all five cards and to a qualifying badugi subset independently; aces remain high. A badugi cap is satisfied if a subset of the required size meets the cap, even if a larger badugi has a higher card. No badugi requirement ignores that cap.

Qualification and point awards are separate: five-card low points always require a genuine 2–7 high-card hand, and badugi points always require four cards. A three-card badugi may therefore qualify for the push and low points, but earns no badugi points. Apply changes before playing or solving. Applying a recommendation restores its original qualification rules as well as its payouts.

## Optional double on draw

The payout lab offers a single-stake or optional double-on-draw variant for each custom game. The player sees five cards, chooses holds, and may pay one additional credit immediately before drawing to double the entire final payout. At least one card must be replaced: standing pat cannot double. Badeucey’s qualifying push returns both credits when doubled, and every awarded point doubles too. The double button is disabled when all cards are held or the extra credit is unavailable. Full-game analysis assumes a credit is available; per-hand play analysis respects the current bankroll and preserves that availability in the decision-review snapshot.

The solver compares **63 actions**: 32 single-stake holds and 31 doubled holds. If a hold’s one-credit expected gross return is `r`, its single-stake net EV is `r − 1` and its doubled net EV is `2r − 2`. The player maximizes net profit per initial deal, including when comparing a doubled draw with standing pat. A positive-EV double is not necessarily best if another hold pays more. A double improves on the same single-stake draw only when `r > 1`.

For double-on-draw analysis:

- `netEV` is expected net profit per initial deal, after all stakes.
- `doubleFrequency` counts deals where the best doubled draw strictly beats every single-stake action (tolerance `1e-12`).
- `doubleTieFrequency` separately counts deals where doubling and single stake are equally optimal; the chosen policy uses single stake on ties, then holds more cards.
- `averageStake = 1 + doubleFrequency`.
- `expectedReturn = netEV + averageStake`.
- `rtp = expectedReturn / averageStake`, so it uses **all money wagered**, not just the initial stake. Maximizing net EV and maximizing an RTP ratio are different objectives; this solver optimizes net EV.

Per-hand rows retain `ev = netEV + 1` for compatibility and expose `netEV`, `grossEV`, `stake`, and `doubled` explicitly. The double-on-draw UI displays net EV. Ordinary games keep their original gross-return display. Post-draw review identifies both the committed hold and its stake; doubling is never inferred from the final cards.

## Exact results

All numbers below use optimal strategy recalculated for the corresponding paytable, every initial deal and every possible legal replacement. They are exhaustive numerical calculations, not simulations. RTP includes returned stake; net EV = RTP − 1 per credit bet.

| Game | Original RTP | Original net EV | Recommended RTP | Recommended net EV |
| --- | ---: | ---: | ---: | ---: |
| 2–7 Low | 82.2244659992% | −0.1777553400 | 99.3738073684% | −0.0062619263 |
| Badeucey | 62.8247933400% | −0.3717520666 | 98.8782635432% | −0.0112173646 |

### Suggested 2–7 total returns

| Category | Original | Suggested |
| --- | ---: | ---: |
| J-high | 1 | 1 |
| T-high | 2 | 2 |
| 9-high | 3 | 4 |
| 8-high | 4 | 5 |
| 7-high | 5 | 7 |
| Wheel | 10 | 25 |

This preserves the lowest two tiers while improving stronger lows and creating a larger top prize. House edge: 0.6262%. If the originally listed numbers were intended as **net winnings plus returned stake**, the original 2–7 game instead returns **121.3907945363%**; that alternative is explicitly analyzed in `analysis.json`. It is not the shipped default.

### Suggested Badeucey points

Keep the qualifying push at 1 credit and the original high-card / four-card qualification rules.

| Low | Original | Suggested | Badugi | Original | Suggested |
| --- | ---: | ---: | --- | ---: | ---: |
| T-high | 0 | 0 | T-dugi | 0 | 0 |
| 9-high | 1 | 2 | 9-dugi | 1 | 2 |
| 8-high | 2 | 4 | 8-dugi | 2 | 4 |
| 7-high | 4 | 10 | 7-dugi | 4 | 9 |
| Wheel | 8 | 20 | 6-dugi | 8 | 20 |
| | | | 5-dugi | 16 | 40 |

The original's simultaneous qualification requirements are restrictive. Merely doubling all point awards produces 91.7011823013% RTP. The suggested table produces 98.8782635432%; increasing only its 7-dugi award from 9 to 10 pushes RTP to 100.5247328788%. These are practical integer candidates near a 99% target, not a uniquely optimal payout design. Larger top awards affect volatility; this analysis establishes mean return, not session-risk equivalence.

### Qualification sensitivity

With the original point awards (including both T tiers at 0), perfect-play returns change substantially:

| Five-card requirement | Minimum badugi | RTP |
| --- | ---: | ---: |
| High card | 4 | 62.8247933400% |
| High card | 3 | 105.9993923718% |
| Any hand | 4 | 84.3210858433% |
| Any hand | 3 | 146.8655491537% |

These results are recorded in `analysis.json`. The original recommendation applies only to its original qualification rules. Re-solve after any rule or payout change; the editor clears stale results when either changes.

## Payout options

There are three single-stake and three double-on-draw options per custom game. All use integer payouts and target approximately 99% total-stake RTP under optimal net-profit strategy. These are practical alternatives, not a proof of a unique optimum. The descriptions distinguish how the awards are allocated; no volatility or session-risk equivalence is claimed. Applying an option restores all of its rules as well as its paytable.

### 2–7 Low options

Payout order is **J / T / 9 / 8 / 7 / wheel**, including the stake.

| Stake rule | Option | Payouts | RTP | Net EV / deal | Double frequency |
| --- | --- | --- | ---: | ---: | ---: |
| Single | Balanced | 1 / 2 / 4 / 5 / 7 / 25 | 99.373807% | -0.006262 | — |
| Single | Broad low awards | 1 / 2 / 4 / 6 / 8 / 9 | 99.035379% | -0.009646 | — |
| Single | Wheel prize | 1 / 2 / 3 / 4 / 5 / 60 | 99.026237% | -0.009738 | — |
| Optional 2× | Balanced doubles | 1 / 2 / 3 / 4 / 5 / 32 | 99.079366% | -0.011282 | 22.5426% |
| Optional 2× | Broad low awards | 1 / 2 / 3 / 5 / 6 / 21 | 99.024944% | -0.011736 | 20.3657% |
| Optional 2× | Wheel prize | 1 / 1 / 2 / 3 / 5 / 67 | 98.866349% | -0.013434 | 18.5049% |

### Badeucey options

Every option requires a five-card high-card hand and the listed minimum badugi size, with no rank caps. The qualifying return is **1**. Low-point order: **T / 9 / 8 / 7 / wheel**. Four-card badugi-point order: **T / 9 / 8 / 7 / 6 / 5**. A three-card badugi can qualify but never earns badugi points.

| Stake rule | Option | Min. badugi | Low points | Badugi points | RTP | Net EV / deal | Double frequency |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| Single | Balanced | 4 | 0 / 2 / 4 / 10 / 20 | 0 / 2 / 4 / 9 / 20 / 40 | 98.878264% | -0.011217 | — |
| Single | Paying tens | 4 | 1 / 1 / 2 / 4 / 8 | 1 / 1 / 2 / 4 / 8 / 155 | 98.929433% | -0.010706 | — |
| Single | Three-card qualifier | 3 | 0 / 1 / 1 / 2 / 4 | 0 / 1 / 1 / 2 / 4 / 39 | 99.078095% | -0.009219 | — |
| Optional 2× | Four-card doubles | 4 | 0 / 1 / 2 / 4 / 8 | 0 / 1 / 2 / 4 / 8 / 110 | 99.006471% | -0.011164 | 12.3682% |
| Optional 2× | Paying tens | 4 | 1 / 1 / 2 / 4 / 8 | 1 / 1 / 2 / 4 / 8 / 83 | 99.016623% | -0.011248 | 14.3790% |
| Optional 2× | Three-card doubles | 3 | 0 / 1 / 1 / 2 / 4 | 0 / 1 / 1 / 2 / 4 / 5 | 98.977665% | -0.011996 | 17.3400% |

With original payouts, double on draw gives 2–7 Low **89.555692% RTP**, **−0.119773 net EV/deal**, and **14.6780%** strict doubling frequency; Badeucey gives **71.274365% RTP**, **−0.315068 net EV/deal**, and **9.6819%** strict doubling frequency. Extra tie frequencies are reported separately in `analysis.json`. Enabling doubling on the old balanced single-stake recommendations instead produces **111.355399%** and **118.935572%** RTP, respectively; use the dedicated double tables when targeting 99%.

## Solver derivation

Let `P(F)` be the total payout of a final five-card hand `F`. For every subset `S` of up to five cards, construct

```
T(S) = sum of P(F) over all five-card F containing S.
```

For an initial hand `D` and held subset `H`, inclusion–exclusion eliminates every initial discard:

```
U(H,D) = sum over X ⊆ (D \ H) of (−1)^|X| T(H ∪ X)
EV(H | D) = U(H,D) / choose(N − 5, 5 − |H|)
RTP = average over all D of max over H ⊆ D of EV(H | D)
```

A five-bit superset Möbius transform computes the 32 numerators in 80 subtractions. Subsets use colex combinatorial indexing (`sum choose(card[i], i+1)`) with separate offsets by size. This handles all 2,598,960 starting hands (2,869,685 with a joker), without suit-isomorphism assumptions. Float64 arrays hold the subset sums; compensated summation accumulates full-game EV. Tie handling favors holding more cards within 1e-12; this has no material effect on reported RTP. Per-hand ranking shows all 32 decisions and EV loss relative to the maximum. After each draw, a decision review automatically shows the chosen hold’s EV, the best hold’s EV and the EV given up, calculated from the original deal rather than the final cards. The top five alternatives are shown with the chosen hold pinned when it falls outside them; all 32 remain available. A pre-draw solution is reused when available, and starting a new hand cancels stale review work.

The same `engine.js` evaluator and `solver.js` are used in play, browser worker and offline analysis. The worker never blocks the UI and is terminated on cancellation or game changes. Edits to payouts, qualifiers or the doubling rule invalidate old results, and changing games, rules or payouts during a live wager is disabled. A manually entered study hand cannot pay credits: Deal always starts a new random hand.

## Reproduce and test

```sh
node poker/video-poker/scripts/analyze.cjs
node --test poker/video-poker/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node poker/video-poker/tests/browser.cjs _site
SHELL_PAGES=/poker/video-poker/,/poker/,/ node scripts/shell-browser.cjs
node scripts/run-tests.mjs
```

`analysis.json` is deterministic and records engine/solver SHA-256 hashes, all preset payouts and returns, candidate tables, and sensitivity experiments. `payout-options.json` defines the additional integer options; the analysis generator recalculates their exact strategies rather than scaling an old return. The generator takes several minutes depending on hardware. Browser full-game calculations usually take a few seconds on a desktop and longer on mobile. Browser smoke screenshots are written under `/tmp/video-poker-*.png`.

Tests cover rank categories, wild cards, kicker boundaries, the lowball wheel, Badeucey qualification combinations, subset rank limits, T-high awards and the additive push, shuffled-deck invariants, direct draw enumeration independent of the subset algorithm, constant-pay normalization, published whole-game return benchmarks, and report reproducibility. Browser checks exercise every variant, exact worker replies, all holds, study/play separation, payout/rule edits, recommendation rule restoration, saved-paytable migration, double settlement and eligibility, net-EV decision review, option application, persistence, cancellation and responsive views.

## References

Paytables and independent return benchmarks: [Wizard of Odds summary](https://wizardofodds.com/games/video-poker/summary/), [All American](https://wizardofodds.com/games/video-poker/tables/all-american/), [full-pay Deuces Wild](https://wizardofodds.com/games/video-poker/tables/deuces-wild/), and [Joker Poker](https://wizardofodds.com/games/video-poker/tables/joker-poker-kings-or-better/). Custom-game results are original calculations in this repository.
