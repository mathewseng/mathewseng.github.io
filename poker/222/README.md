# 222

Static, dependency-free page at `/poker/222/`: a table simulator, a spot solver, a doubling-cube trainer, peer-to-peer online play, and precomputed cube reports for the flipping game 222. Serve the repository over HTTP; the page uses module workers, so it does not run from `file://`.

## Rules

Each player holds six cards and shares a five-card board dealt flop, turn, river. Hole cards are private while a cube action remains; once no action is left (or at a table with no cube) every hand is tabled and the rest is a flip. Once a flop is out, every six-card hand is split automatically into three two-card Omaha hands (exactly two hole cards plus exactly three board cards):

1. **Hand 1** is the two hole cards used by the best Omaha hand available from all six cards.
2. **Hand 2** is the best two of the remaining four.
3. **Hand 3** is the last two.

When several candidate pairs make the same best hand, the higher-ranked cards are used first, then the higher suit (spades > hearts > diamonds > clubs). Hand 1 is worth 3 points, hand 2 is worth 2 and hand 3 is worth 1. A tie splits a hand's points. Winning all three outright scoops for a 4-point bonus (10 points in all). With more than two players every pair of players settles separately, so a seat's net is the sum over its opponents.

## Doubling cube (two players)

Backgammon terms, hands face up. The cube starts centered at 1. **Double** offers to play on for twice the stake. The opponent may **drop** (the doubler wins 5 points per unit of the cube before the double), **take** (the cube doubles and the taker owns it), or **beaver** (take and immediately redouble while keeping the cube; the doubler may then take at four times or drop for twice the usual cost). Showdown pays the net points times the cube.

Variants:

- **Flop cube**: the button may double on the flop; no river action.
- **River cube**: the button may double on the river.
- **Flop and river**: the button may double on the flop; on the river the non-button may double if the cube is still centered, otherwise the cube owner may redouble.

## Hidden information

While a cube action remains, each seat's numbers are against the opponent's **range**: every hand the opponent could hold given the visible cards, weighted by the equilibrium strategy once a cube action has been taken (after a flop take, for example, the button's range is its doubling range and the opponent's range is its taking range). The solver in `solver.mjs` samples hands for both players and turn-and-river runouts, then runs counterfactual regret minimization (CFR+) over the whole cube tree: the flop double, the drop/take/beaver reply, the beaver reply, and, in the flop-and-river variant, the river decision in each cube state. Strategies can be mixed; the reported equities are for the actual hand against the opponent's equilibrium range, in points at the current cube. The actual hands are index 0 of their sampled sides, so a known hand's strategy is always available. River decisions on the actual runout are solved as a separate subgame with the ranges carried over from the flop solve.

Once no cube action remains the hands are tabled: `engine.mjs` then enumerates every runout (or samples when the count is large) and the numbers are perfect-information. Ticking "Table hands" in the simulator or spot solver shows the face-up analysis of a pending decision (`analyzeDecision`): there a flop decision enumerates all 666 runouts with the river cube resolved by backward induction, and a river decision follows the last-roll rule.

## Pages

- **Simulator**: 2–7 players; step forward and back through the streets; click any card and then a deck card to edit a spot. Two-player tables show each seat's numbers against the opponent's range while a cube action remains and the equilibrium for the pending decision (mix and equity of every option for both actual hands); tick "Table hands" for the face-up view.
- **Spot solver**: type hands, board, button and cube state and solve. In a two-player spot the second hand may be blank: the first seat is solved against the full range.
- **Cube trainer**: play the cube game against the equilibrium bot. Its cards stay hidden until no action remains; every decision is graded against the equilibrium in points; review earlier streets with the street buttons.
- **Play online**: PeerJS rooms through `shared/peer-room.js`; the host runs the deal and hides other players' hands until they are tabled; every client computes its own range numbers and sees its own decisions graded.
- **Reports**: how often each cube action is taken per variant, from `data/cube-report.json`: the hidden-information equilibrium over random boards, and face-up play for comparison.

## Numbers

EVs are expected net points over the remaining runouts. Against a range they are sampled (exact once at most one card is to come with a weighted range). Once tabled, the worker pool enumerates every completion when the count is below the precision limit (Fast 40,000; Standard 400,000; Exact always) and samples otherwise. The precision setting also picks the solver size (hands sampled per side, runouts, CFR iterations). Win and tie are the chances a hand is the outright best or tied for best at showdown. Colors scale with the number: green is good for the seat shown, red is bad.

## Regenerate the reports

```sh
node poker/222/simulation/cube-report.mjs 200000 12 20261003 480
node --test poker/222/tests/engine.test.mjs poker/222/tests/solver.test.mjs
```

Arguments are face-up deals, threads, seed and equilibrium boards. Each face-up deal is played under optimal cube strategy in all three variants with the button on seat 1; each equilibrium board is solved with hidden hands at standard precision.
