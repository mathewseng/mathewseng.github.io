# Metrics Notes

## House Edge

The app reports `houseEdgePct` as the negative of modeled player EV. A favorable rule set can show a negative house edge, which means the modeled player EV is positive.

The estimate starts with a deck-count baseline and applies rule deltas for:

- H17
- Double restrictions
- DAS / NDAS
- Peek / no-peek handling
- Surrender mode
- Resplits, RSA, HSA
- Charlie rules
- Blackjack payout
- Optimization mode

These figures are for quick comparison and UI feedback. They should not be treated as a replacement for a full composition-dependent EV calculator.

## Standard Deviation

`stdevPerHand` is a modeled per-hand standard deviation. `stdevPerWager` divides that value by a typical wager-normalization factor.

## Margin Score

Each chart cell includes a compact `m` score. It is not a dollar EV. It is a display-grade confidence/margin signal used by the inspector so close decisions and count-sensitive cells can be identified quickly.

## Hi-Lo Count

The count tracker uses standard Hi-Lo tags:

- `2` through `6`: +1
- `7` through `9`: 0
- `10` through `A`: -1

The chart applies the active true count directly. The count panel has separate controls for running count and true count. When the running-count control or card buttons are used, true count is `running count / decks remaining`, with decks remaining rounded to 0.01 decks. When the true-count slider is used, that value is applied directly.

Finite-deck probability weights remove known dead cards before EV is calculated. Chart rows remove a representative player hand plus the dealer upcard. The hand solver removes the exact selected player cards plus the dealer upcard, so a hand like `77` removes two sevens from the remaining shoe before action EVs are compared.

## EV View

The browser EV view computes legal action choices for each chart cell:

- Stand
- Hit with optimal continuation
- Double when legal
- Split when the row is a pair
- Surrender when legal

Each cell stores the best EV, the EV gap to the second-best legal choice, all legal action EVs, and the distribution of final player totals or busts when perfect strategy is followed from that cell.

## Count Indexes

In Custom mode, displayed indexes are calculated from EV crossover points using a Hi-Lo-constrained shoe model. The rank probabilities preserve visible dead-card removal, then solve a maximum-entropy card mix whose expected Hi-Lo tag balance moves by `-trueCount / 52` per card. That is the missing step from earlier builds: the old code used an arbitrary exponential tilt, which made `15 vs T` appear near `+1.5`; the current model puts that crossover near the published `+4` while still allowing high-precision decimals.

The Index Group menu can also show published Hi-Lo groups, including Illustrious 18, Fab 4, Sweet 16, Catch 20, Catch 22, BJA S17/H17, and JackAce MD S17. The visible range slider defaults to -5 through +10; the number boxes can be typed beyond that slider span when a wider filter is needed. Displayed index values can be rounded from 0 to 3 decimal places.
