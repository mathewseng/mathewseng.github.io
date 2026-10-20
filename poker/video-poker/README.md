# Video Poker

Static app at `/poker/video-poker/`. Uses the shared shell, tokens and playing-card renderer. No build step, server, API key, or external runtime dependency. All calculations run locally in a cancellable worker.

## Scope and rules

17 single-draw presets: Jacks or Better (9/6), Tens or Better (6/5), Bonus (8/5), Bonus Deluxe (9/6), Double Bonus (10/7), Double Double Bonus (9/6), Triple Double Bonus (9/7), Triple Bonus Plus (9/5), Super Double Bonus (9/5), White Hot Aces (9/5), All American (40/8/8/8), full-pay Deuces Wild, Not So Ugly Ducks, Bonus Deuces Wild (10/4/4), Joker Poker (kings or better, 7/5), 2–7 Low, and Badeucey.

The scope is conventional five-card, single-draw games. Multi-stage games (Ultimate X, Super Times Pay, etc.), side bets and progressive jackpots are not modeled. Max-coin royal payouts are normalized to one practice credit; there is no variable coin-count penalty. The joker game has 53 cards; all others have 52. No discarded card can return. Custom category payouts persist in local storage; practice bankroll and in-progress hands are session-only.

2–7 payouts are interpreted as **total returns including the stake**, following ordinary video-poker convention. J-high therefore pushes. Aces are high; pairs, straights and flushes lose. A-2-3-4-5 is ace-high, not a straight. The wheel is 7-5-4-3-2. Awards within a half never stack.

The user's confirmed Badeucey convention is **qualifying push + low points + badugi points**. Both qualifiers are mandatory: a five-card high-card hand (five different ranks, no straight/flush) AND a four-card badugi. Aces are high in both halves; 5-4-3-2 is the best badugi. The four-card badugi is chosen from any four of the five cards. Both games use one draw.

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

Keep the qualifying push at 1 credit.

| Low | Original | Suggested | Badugi | Original | Suggested |
| --- | ---: | ---: | --- | ---: | ---: |
| 9-high | 1 | 2 | 9-dugi | 1 | 2 |
| 8-high | 2 | 4 | 8-dugi | 2 | 4 |
| 7-high | 4 | 10 | 7-dugi | 4 | 9 |
| Wheel | 8 | 20 | 6-dugi | 8 | 20 |
| | | | 5-dugi | 16 | 40 |

The original's simultaneous qualification requirements are restrictive. Merely doubling all point awards produces 91.7011823013% RTP. The suggested table produces 98.8782635432%; increasing only its 7-dugi award from 9 to 10 pushes RTP to 100.5247328788%. These are practical integer candidates near a 99% target, not a uniquely optimal payout design. Larger top awards affect volatility; this analysis establishes mean return, not session-risk equivalence.

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

A five-bit superset Möbius transform computes the 32 numerators in 80 subtractions. Subsets use colex combinatorial indexing (`sum choose(card[i], i+1)`) with separate offsets by size. This handles all 2,598,960 starting hands (2,869,685 with a joker), without suit-isomorphism assumptions. Float64 arrays hold the subset sums; compensated summation accumulates full-game EV. Tie handling favors holding more cards within 1e-12; this has no material effect on reported RTP. Per-hand ranking shows all 32 decisions and EV loss relative to the maximum.

The same `engine.js` evaluator and `solver.js` are used in play, browser worker and offline analysis. The worker never blocks the UI and is terminated on cancellation or game changes. Edits invalidate old results, and changing games/payouts during a live wager is disabled. A manually entered study hand cannot pay credits: Deal always starts a new random hand.

## Reproduce and test

```sh
node poker/video-poker/scripts/analyze.cjs
node --test poker/video-poker/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node poker/video-poker/tests/browser.cjs _site
SHELL_PAGES=/poker/video-poker/,/poker/,/ node scripts/shell-browser.cjs
node scripts/run-tests.mjs
```

`analysis.json` is deterministic and records engine/solver SHA-256 hashes, all preset payouts and returns, candidate tables, and sensitivity experiments. The generator takes about a minute depending on hardware. Browser full-game calculations usually take a few seconds on a desktop and longer on mobile. Browser smoke screenshots are written under `/tmp/video-poker-*.png`.

Tests cover rank categories, wild cards, kicker boundaries, the lowball wheel, both Badeucey qualifiers and the additive push, shuffled-deck invariants, direct draw enumeration independent of the subset algorithm, constant-pay normalization, published whole-game return benchmarks, and report reproducibility. Browser checks exercise every variant, exact worker replies, all holds, study/play separation, payout edits, recommendations, persistence, cancellation and responsive views.

## References

Paytables and independent return benchmarks: [Wizard of Odds summary](https://wizardofodds.com/games/video-poker/summary/), [All American](https://wizardofodds.com/games/video-poker/tables/all-american/), [full-pay Deuces Wild](https://wizardofodds.com/games/video-poker/tables/deuces-wild/), and [Joker Poker](https://wizardofodds.com/games/video-poker/tables/joker-poker-kings-or-better/). Custom-game results are original calculations in this repository.
