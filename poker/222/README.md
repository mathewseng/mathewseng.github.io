# 222

Static, dependency-free page at `/poker/222/`: a table simulator, a spot solver, a doubling-cube trainer, peer-to-peer online play, and precomputed cube reports for the flipping game 222. Serve the repository over HTTP; the page uses module workers, so it does not run from `file://`.

## Rules

Each player holds six cards and shares a five-card board dealt flop, turn, river. Everything is face up. Once a flop is out, every six-card hand is split automatically into three two-card Omaha hands (exactly two hole cards plus exactly three board cards):

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

Because every card is visible, the optimal strategy is pure minimax. A flop decision enumerates all 666 turn-and-river runouts and values each river by backward induction over the river cube; river decisions are the classic last-roll rule (double when ahead but not "too good"; a locked scoop is worth more than the drop). Under optimal play a beaver is never correct, because a correct double is never behind.

## Pages

- **Simulator**: 2–7 players; step forward and back through the streets; click any card and then a deck card to edit a spot; the two-player cube panel shows the optimal action and both players' option equities for any variant and cube state.
- **Spot solver**: type hands, board, button and cube state and solve.
- **Cube trainer**: play the cube game against the solver; every decision is graded in points; review earlier streets with the street buttons.
- **Play online**: PeerJS rooms through `shared/peer-room.js`; the host runs the deal and every client computes its own equities.
- **Reports**: how often each cube action is taken per variant, from `data/cube-report.json`.

## Numbers

EVs are expected net points over the remaining runouts. The worker pool enumerates every completion when the count is below the precision limit (Fast 40,000; Standard 400,000; Exact always) and samples otherwise. Win and tie are the chances a hand is the outright best or tied for best at showdown. Colors scale with the number: green is good for the seat shown, red is bad.

## Regenerate the reports

```sh
node poker/222/simulation/cube-report.mjs 200000 12 20261003
node --test poker/222/tests/engine.test.mjs
```

Arguments are deals, threads and seed. Each deal is played under optimal cube strategy in all three variants with the button on seat 1.
