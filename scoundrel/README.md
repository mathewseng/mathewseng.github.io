# Scoundrel

Browser-local adaptation of the solo card game by Zach Gage and Kurt Bieg,
inspired by [this tutorial](https://youtu.be/Gt2tYzM93h4).
[Original rules](https://www.stfj.net/art/2011/Scoundrel.pdf),
[readable mirror](https://aiscoundrel.com/Scoundrel.pdf).

## Play

Open `/scoundrel/`. Select an encounter and choose its action. Resolve three
encounters, carry one to the next room, and clear the entire final room.
Keyboard: 1–4 select, Enter activates the primary action when focus is outside
a button, F opens the avoidance choices, Escape deselects. Normal Tab/Enter
navigation always works. Runs, preferences, and completed-run statistics save
locally. Storage failure does not stop play. Audio is optional and off initially.
Reduced motion pauses the particle renderer and removes movement.

Avoidance explicitly offers two orders: **left** returns the four displayed
cards in order (1 → 2 → 3 → 4), and **right** reverses them (4 → 3 → 2 → 1).
Both queues go to the bottom. Buttons and horizontal touch swipes open a
preview before committing the direction. Only untouched four-card rooms may
be avoided; consecutive avoidance is prohibited. The original rules describe
scooping the room but do not specify its return order. Existing saved runs and
witness actions without a direction retain the original left-order behavior.

This version uses strictly decreasing weapon chains: equal ranks cannot follow
one another on the same weapon. The original PDF’s “lower value (less than
equal)” wording is ambiguous. All game, solver, and report calculations use the
same strict rule. Loss scores include health after overkill and every remaining
monster in both the room and deck. The final potion bonus follows the original
last-card-at-20 rule, even when that potion did not add health.

## Artwork and theme

`catalog.js` defines 44 unique names, identities, scenes and flavor texts.
Spades are the volcanic **Cinderkin**; clubs are the oceanic **Tideborn**.
Their creatures, scouts, artisans, spellcasters and elders vary in anatomy,
scale, expression, pose, setting and palette. Every monster, weapon,
and potion has its own WebP in `assets/cards/`. These are independently
generated illustrations, not recolors or crops of one shared portrait. The
dungeon background is `assets/dungeon.webp`. Original prompts and tool
provenance are in `art-prompts.json`; all were made with the built-in image
generation tool, then compressed and downsampled with `cwebp`. Responsive
images select between 320px thumbnails and 640px full illustrations. The
collection loads art lazily; its full-art viewer shows each card's name, faction/type and value.
The [art direction](docs/art-direction.md) records the original faction design
and the user's Runeterra/Hearthstone composition references.

The requested fantasy value seals intentionally replace the site’s usual
four-color playing-card faces on this page. Shared site tokens/chrome remain
loaded first. Cinzel handles display type and controls; DM Sans handles longer
copy. Both fonts are self-hosted with their OFL license files. Torchlight,
Moonstone, and Overgrown atmospheres use existing site colors without
redefining shared tokens. Atmosphere filters apply to the dungeon backdrop,
preserving each illustration's colors. The collection is available from Settings.

Desktop shows a four-card row; portrait phones show a two-by-two room. Captions
are in document flow and wrap without ellipsis. Action buttons are at least
44px; short viewports scroll instead of cropping controls. On phones the EV
table becomes stacked action rows, preserving all values without horizontal
scrolling. Dialogs respect dynamic viewport height and device safe areas.

## Hidden-deck action values

Move analysis is a **hidden-information policy**, not an oracle. The analysis
worker receives only `engine.observe(state)`: visible cards, health, equipment,
weapon-chain history, unseen card counts, and the known bottom queue. It never
receives the actual unseen order, initial shuffle, or deal seed. The solver API
rejects private game states. Its random sampling seed is derived from the public
observation, so permuting the hidden deck cannot change its EV estimates.

`knownBottom` records cards returned by left/right avoidance and removes them
as they are drawn. After the unseen portion is exhausted, those remembered
returns are genuinely known. Older saved runs without this field resume with
an empty remembered queue; new returns are tracked from then on.

`solver.js` implements Monte Carlo tree search with sampled draws **on demand**.
Future choices use the simulated observation at that point, not a pre-revealed
sampled deck. This avoids the hindsight error of solving each sampled complete
deck with perfect information and averaging those oracle scores.

- All legal actions appear with their estimated mean final score and sample
  count, including both avoidance orders and both combat methods.
- Equal-strength monsters and mechanically identical avoidance queues share
  search work. Every distinct root action gets an initial allocation before
  extra simulations focus on promising moves.
- UCB selection, empirical-variance racing, and move-ordering heuristics reduce
  work on unlikely contenders. These are approximations, not dominance proofs;
  a low-priority action remains visible in the EV table.
- A cached planner explores every sequence in the **visible room**, stopping
  before the next draw. Its heuristic values health, chain strength, and the
  carried card. This handles healing order and weapon changes more reliably
  than a single-card greedy rollout.
- Known endgames of at most eight remaining cards are solved exactly. Rollouts
  use a four-card exact tail to control their cost. Immediate terminal scores
  are exact even when unresolved card order is unknown, since their composition
  and total monster value are known.

The browser normally searches for up to 1.8 seconds / 12,000 simulations;
Search deeper allows six seconds / 60,000. The worker reports intermediate EVs
and is canceled when the state changes. Only fully determined actions carry an
Exact label. Other EVs are simulation estimates of future play, not guaranteed
scores or a proof of the best hidden-deck strategy. Their raw standard errors
are diagnostics; tree search changes its continuation policy while learning.

## 1,000-deal policy report

`/scoundrel/reports/` evaluates the hidden-deck policy on the fixed seeds
`scoundrel-study-v1-0000` through `scoundrel-study-v1-0999`, preserving and
extending the original 128-seed cohort. No deals are filtered or replaced.
The previous full-information outcomes are superseded: hindsight solutions
cannot represent normal Scoundrel play.

Mean, median, survival, and the graph describe the **actual recorded scores**
from these 1,000 policy runs. They estimate this policy’s performance, not the
true optimal population EV. Whole-number medians have no decimal suffix;
a half point is retained when the two middle scores differ by an odd number.
The chart groups wide score distributions into explicit ten-point bins.
Phone charts use vertically scrolling, tappable bars with exact counts.
Filters affect the chart and deal list; headline statistics always use all
1,000 games. Each deal has a verified move history and a seeded play link.
CSV and raw JSON are available.

Regenerate the report (Node and a C++17 compiler required):

```sh
node scoundrel/scripts/generate-report.cjs 1000 --iterations=2048
```

The generator compiles `solver/hidden-policy.cpp` into the OS temporary directory
and uses persistent workers. Every decision sends **only a public observation**
to the native process. C++ implements the same tree search and rollout policy
as the browser. A fixed 2,048 simulations per decision makes the study independent
of machine speed; native and browser results are checked against one another at
fixed budgets. The compiled policy is identified by a digest of its source,
the browser solver, and the engine.

Checkpoints resume completed games for that exact policy/budget. The published
JSON is replaced atomically only after all 1,000 games finish and their move
histories replay correctly. `CXX` selects a compiler; `--workers=N` controls
concurrency; `--checkpoint=/path/file.jsonl` chooses the checkpoint;
`--output=/path/results.json` allows smaller development cohorts. Native worker
elapsed time and heuristic allocation counts are stored with each run.

## Verification

```sh
node --test scoundrel/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node scoundrel/tests/browser.cjs
node scoundrel/tests/responsive.cjs
# With local WebKit installed, also check mobile Safari's rendering engine:
SCOUNDREL_BROWSERS=chromium,webkit node scoundrel/tests/responsive.cjs
SHELL_PAGES=/,/scoundrel/,/scoundrel/reports/ node scripts/shell-browser.cjs
```

Tests compare both solvers against an independent exhaustive search
over small dungeons, check compact transitions against the full engine, replay all
1,000 policy histories, check invariance to hidden deck permutations, and verify all 44 art hashes differ. The browser test exercises
all-action analysis, a full winning descent, save/resume, themes, collection,
responsive layouts, both avoidance directions, report filters, recorded move-history
viewers and CSV export against assembled files.
The responsive check measures actual text bounds for all 44 names, verifies
touch targets and both combat actions, and exercises the art viewer, enlarged
text and phone EV rows across ten desktop/phone viewport sizes.

Hearts and health use red, diamond weapons use blue, club Tideborn use green,
and spade Cinderkin use orange-gold. Card labels, number seals and item actions
share a black surface with light suit-colored text and borders. These semantic
colors stay consistent across all atmosphere settings. UI copy is limited
to names, status, actions, rules and analysis; flavor lore remains in the catalog
metadata but is not shown in the interface.
