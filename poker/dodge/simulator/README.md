# Dodge table simulator, cube trainer, online rooms

Static page at `/poker/dodge/simulator/`. No build step. The heavy work runs in a module Web Worker (`worker.js`) over `engine.mjs`; the page is `index.html` + `app.js` + `styles.css`. Online play uses `shared/peer-room.js` and PeerJS like the Mixed Poker table.

## Rules

- 2–4 players, one card each from a 52-card deck.
- The lowest card draws first. Suit breaks ties: clubs lowest, then diamonds, hearts, spades. The ace counts high for this rule by default (toggle on the page).
- Players draw one card at a time in clockwise seat order and keep every card.
- A straight or better busts (straight, flush, full house, quads, straight flush, royal flush; aces high or low, no wraparound). A busted player draws no more.
- Last player still drawing wins. If the deck runs out first the survivors split.
- Doubling cube (2 players, money game): the player on turn may double before drawing; the opponent takes (cube doubles, they own it, only the owner may redouble) or passes (doubler wins the current stake).

Seventeen cards always contain five of a suit, so a hand of `n` cards busts within `17 − n` draws. With three players the deck cannot run out (`3 × 17 = 51`); with four it can, about 0.09% of games from the opening deal.

## Numbers

| Stat | Method |
| --- | --- |
| Equity | Joint Monte Carlo of the whole table from the current position (splits count fractionally). |
| Bust next / in 2 / in 3 | Exact: every 1-, 2-, 3-card completion from the remaining deck is enumerated (`exactBustWithin`). |
| Draws to bust (median, mean, histogram) | The player's own further draws including the bust card, drawing alone from the current deck. First three draws exact, tail Monte Carlo renormalized onto the exact survival mass (`bustDistribution`). |
| Cube equities | `analyzeCube`: every possible next card is expanded exactly. Each child position is valued by `raceCubeDP`, a dynamic program over cube states (centered / on-turn owns / other owns) on a race model built from both players' hazard sequences (probability of busting on each future draw given survival). Deep precision adds a second exact ply. Equities are in units of the current cube from the on-turn player's side; the responder's take/pass view is the negation. |

Correct cube play: double when `min(Double/Take, Double/Pass) > No double`; take when `Double/Take < +1` from the doubler's side (i.e. the taker's equity beats −1). The "equivalent win %" column is `(E / stake + 1) / 2`, with stake 2 on the doubled rows.

The race model ignores card-removal interaction beyond the exact ply and treats each player's later hazards as fixed given survival. Tests check that its cubeless equity matches the joint simulation to within noise and that 1-ply and 2-ply decisions agree closely.

What the solver finds (30,000 self-play games, both sides on the solver):

- The cube is live in almost every game: 96% of games see a double, the cube is turned in 82%, 14% end with a pass, 15% reach 4 or higher. Doubles per game: 1.12.
- The take point is the dead-cube 25%: every double at a responder win chance of 25% or more is taken and every one below is passed. Two-ply analysis moves take equities by less than 0.005, so cube ownership is worth almost nothing here. Most games end by a bust before the owner ever reaches a profitable redouble, so the recube vig that lowers backgammon take points to about 21% barely exists.
- Doubling starts early. Because a draw can swing the game instantly, the solver doubles at a cubeless win chance of 65% on average (minimum 50%), and in almost every position above 70%. At the very top the double is a coin-flip with No double because the opponent passes either way.
- The first drawer (lowest card) is a real underdog: 43% cubeless over two players, 41% under cube play, and −0.25 points per game. The second drawer makes the first double twice as often.

The full tables are on the Reports tab.

## Page

- **Table simulator**: deal, draw, play out, click a deck card to deal that exact card, Edit a seat to build a position, "Solve a spot" to type a position like a solver input (shareable `#spot=` link), ◀ ▶ stepping (arrow keys) through every change. Cube mode (2 players) shows the solver table and shades each deck card by the drawer's win chance after that card.
- **Cube trainer**: play against a bot that follows the solver. After each double, take, or pass the solver table shows every option with the correct play marked and the equity lost. Step back through a finished game to see the numbers at each point.
- **Play online**: peer-to-peer rooms for 2–4 seats; the host's browser runs the table, all cards are public, everyone sees the live stats and (with the cube on) the solver table.
- **Reports**: precomputed self-play and table statistics (below).

All numbers are color coded red → amber → green (equity relative to a fair share, bust odds inverted, draws-to-bust higher is greener).

## Reports

```sh
node poker/dodge/simulator/simulation/report.mjs table 3000000 12   # → data/table-report.json
node poker/dodge/simulator/simulation/report.mjs cube 30000 1000 12  # → data/cube-report.json
```

`table` plays cubeless games for 2, 3 and 4 players (equity by draw order and starting rank, 2-player 13×13 rank matrix, game length, bust categories, deck-out rate). `cube` plays 2-player money games with both sides taking every cube decision from the 1-ply solver (1,000 rollouts per child): how often the cube is turned, doubles per game, take and pass rates by win chance, cube levels, when the first double comes, hand sizes at the double, final cube and points distributions.

## Tests

```sh
node --test poker/dodge/simulator/tests/simulator.test.mjs
```
