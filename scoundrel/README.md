# Scoundrel

Browser-local adaptation of the solo card game by Zach Gage and Kurt Bieg,
inspired by [this tutorial](https://youtu.be/Gt2tYzM93h4).
[Original rules](https://www.stfj.net/art/2011/Scoundrel.pdf),
[readable mirror](https://aiscoundrel.com/Scoundrel.pdf).

## Play

Open `/scoundrel/`. Select an encounter and choose its action. Resolve three
encounters, carry one to the next room, and clear the entire final room.
Keyboard: 1–4 select, Enter activates the primary action when focus is outside
a button, F avoids an untouched room, Escape deselects. Normal Tab/Enter
navigation always works. Runs, preferences, and completed-run statistics save
locally. Storage failure does not stop play. Audio is optional and off initially.
Reduced motion pauses the particle renderer and removes movement.

This version uses strictly decreasing weapon chains: equal ranks cannot follow
one another on the same weapon. The original PDF’s “lower value (less than
equal)” wording is ambiguous. All game, solver, and report calculations use the
same strict rule. Loss scores include health after overkill and every remaining
monster in both the room and deck. The final potion bonus follows the original
last-card-at-20 rule, even when that potion did not add health.

## Artwork and theme

`catalog.js` defines 44 unique names and subjects. Spades are the skeletal
**Hollow Court**; clubs are the woodland **Briarborn**. Every monster, weapon,
and potion has its own WebP in `assets/cards/`. These are independently
generated illustrations, not recolors or crops of one shared portrait. The
dungeon background is `assets/dungeon.webp`. Original prompts and tool
provenance are in `art-prompts.json`; all were made with the built-in image
generation tool, then compressed and downsampled with `cwebp`.

The requested fantasy value seals intentionally replace the site’s usual
four-color playing-card faces on this page. Shared site tokens/chrome remain
loaded first. Cinzel handles display type and controls; DM Sans handles longer
copy. Both fonts are self-hosted with their OFL license files. Torchlight,
Moonstone, and Overgrown atmospheres use existing site colors without
redefining shared tokens. The collection is available from Settings.

## Oracle and action values

The optional oracle knows the actual remaining dungeon order. With full
information the game is deterministic: an action’s EV is its final score under
the best continuation, not an expectation over unknown future draws. This is
not a solution of the hidden-information game.

`solver.js` uses complete rollouts, a room-based beam, health dominance,
memoized exhaustive refinement, and an admissible score upper bound. Every
reported lower bound has a complete legal witness replayed through the engine.
Every legal action is analyzed separately in `solver-worker.js`, so barehanded
and armed fights, waste potions, new weapons, and avoidance are all listed.
Workers are canceled on state changes. Incumbent lines survive when followed.

“Proven” means exhaustive refinement completed or a legal line attained the
upper bound. Otherwise a range shows the achievable score and an upper bound
on the optimum; it must never be described as an exact EV. Search deeper
increases the budget. A best-found move is not necessarily a globally optimal
move until its score dominates every alternative’s upper bound. Full-deck
optimality is not guaranteed within the interactive search budget.

## Reports

`/scoundrel/reports/` displays a 128-deal seeded study, the mean and median
optimal-score bounds, achieved-score distribution, survival bounds, and proof
coverage. Filters, an upper-bound histogram, per-deal replay links, CSV export,
and raw JSON are included. Proven-only results are explicitly labeled as a
selected subset rather than a population estimate. Mean/median bounds describe
search uncertainty; the achieved-mean standard error describes sampling spread
and must not be used as a confidence interval for the unknown optimal mean.

Regenerate the tracked study:

```sh
node scoundrel/scripts/generate-report.cjs 128
```

Four Node workers use deterministic seeded Fisher–Yates shuffles, fixed rollout,
beam, and refinement budgets. A ten-minute emergency time limit guards a
pathological deal. The beam phase may exceed the refinement state budget. Each
stored row contains its seed, score, upper bound, proof status, visited states,
and complete verified witness line. Timing does not affect the published
study’s ordinary runs; there were no emergency timeouts.

## Verification

```sh
node --test scoundrel/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node scoundrel/tests/browser.cjs
SHELL_PAGES=/,/scoundrel/,/scoundrel/reports/ node scripts/shell-browser.cjs
```

Tests compare the optimized solver against an independent exhaustive search
over small dungeons, check its transitions against the full engine, replay all
study witnesses, and verify all 44 art hashes differ. The browser test exercises
all-action analysis, a full winning descent, save/resume, themes, collection,
responsive layouts, report filters and CSV export against assembled files.
