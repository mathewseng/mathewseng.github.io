# Scoundrel

Browser-local adaptation of the solo card game by Zach Gage and Kurt Bieg,
inspired by [this tutorial](https://youtu.be/Gt2tYzM93h4).
[Original rules](https://www.stfj.net/art/2011/Scoundrel.pdf),
[readable mirror](https://aiscoundrel.com/Scoundrel.pdf).

## Play

Open `/scoundrel/`. Select an encounter and choose its action. Resolve three
encounters, carry one to the next room, and clear the entire final room. The
carried card stays in its original slot; new cards fill empty slots left to right,
including a partial final room. Current saved games adopt this layout.
Keyboard: 1–4 select, Enter activates the primary action when focus is outside
a button, F opens the avoidance choices, Escape deselects. Normal Tab/Enter
navigation always works. Runs, preferences, and completed-run statistics save
locally. Storage failure does not stop play. Audio is optional and off initially.
Reduced motion pauses the particle renderer and removes movement.

Avoidance explicitly offers two orders: **left** returns the four displayed
cards in order (1 → 2 → 3 → 4), and **right** reverses them (4 → 3 → 2 → 1).
Both queues go to the bottom. Previews label draw positions 1st–4th and the
first/last endpoints, with the remaining-deck count ahead of these cards.
Buttons and horizontal touch swipes open a
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

`catalog.js` defines the 44 distinct names, roles, scenes and flavor texts shared
by the game and `/scoundrel/gallery/`. Spades are slate-and-charcoal **Stonekin**;
clubs are green **Treefolk**. Diamonds are nine different blue-steel weapon types,
and hearts span nine red healing-liquid shades, from rose and coral to garnet.
Each illustration has its own silhouette, scene, local colors and lighting.

Every card has an independently generated WebP in `assets/cards/`, with 960px
full illustrations and 320px responsive thumbnails. The eight approved color-story
samples are part of the final set; the other 36 were generated for the release.
Exact successful prompts, references, provenance and asset hashes are recorded
in `art-prompts.json`. Images use the built-in generation tool and proportional
`cwebp` compression. The dungeon background remains `assets/dungeon.webp`.
The [art direction](docs/art-direction.md) records the shared visual language.

The dedicated **Collection** page has all 44 cards, suit filters, name/role search,
shareable card links, a full-art viewer and navigation within the filtered set.
Arrow keys, previous/next buttons and touch swipes browse the viewer; Escape closes
it and returns focus. Dungeon and collection cards follow pointer position with
3D pitch, yaw, a slight roll, moving light, and directional shadows. Hovering
rotates the whole card rather than zooming its illustration.
Entrance and viewer transitions, tilt and light effects respect reduced motion.
Images load lazily, with neighboring viewer artwork prefetched. The game retains
its compact in-game collection and links to the full page.

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

Click **Cards left** or **Cards resolved** to open the deck overview. All 44
cards stay in canonical suit/value order; the opposite state is dimmed, and
current-room cards have a dot. The toggle switches the highlighted set. Landscape
uses suits as rows; portrait phones use suits as columns with a sticky header.
Every tile opens its full artwork. Cards left includes the current room, so the
left and resolved counts always sum to 44. The inventory receives only the
public observation and cannot expose the unseen deck order.

## Hidden-deck action values

A 100,000-simulation search starts automatically on load and after every action,
even with the analysis panel closed. Opening or hiding the panel reuses that
search and its current results. A new position cancels the old worker; the
existing Search to 1M control extends the current tree.

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
  count, including both avoidance orders and both combat methods. Rows sort by
  descending EV with two decimal places, with pending estimates last. All
  equivalent best actions are highlighted; shared sample counts describe one pool, not independent samples.
- Equivalent public successor distributions share search work at every tree
  node, before any hidden draw is sampled. Canonical states preserve health,
  equipment, chain limit, potion availability, carried cards, occupied slots and
  return order. Equal-strength monsters in different slots can differ when
  their carry positions affect a later return queue.
  Inert used potions in a final room below 20 health can also be canonicalized;
  final-potion bonuses at 20 remain distinct. Equal immediate healing does not
  merge moves that leave different potions to carry forward. Every distinct
  root action gets an initial allocation before
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

With Best move enabled, the browser automatically runs 100,000 simulations
for each position without a wall-clock cutoff (unless all root values are
already exact). EVs and the live counter update at 1,000-simulation intervals
through 10,000, then at 10,000-simulation intervals through 100,000. The worker
is canceled and a fresh automatic search starts when the state changes.
**Search to 1M** extends that same tree and random stream to 1,000,000 total
simulations, reporting every 10,000. The button can be used during the automatic
search; the worker finishes its 100k batch before continuing. Exactly solved
positions stop immediately. Only fully determined actions carry an
Exact label. Other EVs are simulation estimates of future play, not guaranteed
scores or a proof of the best hidden-deck strategy. Their raw standard errors
are diagnostics; tree search changes its continuation policy while learning.

## Hidden-deck policy report

`/scoundrel/reports/` evaluates consecutive fixed seeds beginning at
`scoundrel-study-v1-0000`. No deals are filtered or replaced. The report states
the actual cohort size and fixed simulation budget; these are measured policy
outcomes, not perfect-information solutions or proven optimal population EVs.

The chart has one thin bar per integer score, including zero-count positions,
with mean, median, and first/third quartile lines. Quartiles use R-7 linear
interpolation. Whole-number medians have no decimal suffix. The full plot fits
phones; a Score control supports precise touch/keyboard filtering. Cohort filters
affect the plot and deal list; headline statistics always describe the full study.
Every deal has a verified history and seeded play link. CSV export includes the
budget. The compact JSON manifest contains every score; lossless histories live
in checksum-indexed shards of 1,000 games and load only when opened.

Regenerate a large report (Node and a C++17 compiler required):

```sh
node scoundrel/scripts/generate-report.cjs 100000 --iterations=8192 --workers=12 --output=/path/study/outcomes.json --checkpoint=/path/study/checkpoint.jsonl --deadline=2026-10-22T11:35:00Z
node scoundrel/scripts/publish-study.cjs /path/study/outcomes.json
```

Every decision sends **only a public observation** to a persistent native worker.
The native implementation matches the browser policy at the same simulation
budget. The published 100,000-game study retains its original frozen policy
revision and results; later solver improvements do not relabel historical runs.
Its histories and Play links explicitly use the historical carry-to-first-slot
layout, so their recorded scores remain reproducible. New studies record
`policy.keepSlots` and use the current layout.
Fixed-size buffers, exact canonical state keys, cached visible-room
heuristics, precomputed utility arithmetic, and a shared combinadic room cache
reduce overhead. The shared cache is a sparse ~4 GiB file in the OS temporary
directory, keyed by the compiled revision; workers share its physical pages.
If mapping is unavailable, a bounded private cache is used. No actual unseen
card order enters either cache. Native/browser and shared/private parity are
tested. The policy digest includes the native source, browser solver, and engine.

The runner checkpoints every game, writes a progress JSON file, and resumes
only a compatible revision/budget/seed cohort. It repairs a torn final checkpoint
record and replay-checks resumed games. At `--deadline`, or on SIGTERM/SIGINT, it
stops assigning new games, completes active ones, and publishes the complete
contiguous prefix. It never drops losses to meet the deadline. Shards are written
before the manifest is atomically replaced. `--progress`, `--seed-prefix`, `CXX`,
`--workers`, `--checkpoint`, and `--output` control development runs. The separate
publisher verifies every checksum and move history before updating website data.

The [October 22 overnight study](docs/overnight-study-2026-10-22.md) records the
benchmark, frozen run, deadline, and monitoring/publication instructions.

## Verification

```sh
node --test scoundrel/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node scoundrel/tests/browser.cjs
node scoundrel/tests/deck-overview.cjs
node scoundrel/tests/analysis.cjs
node scoundrel/tests/responsive.cjs
node scoundrel/tests/gallery.cjs
# With local WebKit installed, also check mobile Safari's rendering engine:
SCOUNDREL_BROWSERS=chromium,webkit node scoundrel/tests/responsive.cjs
# Also prove a full background search finishes before the panel is opened:
SCOUNDREL_COMPLETE_SEARCH=1 node scoundrel/tests/deck-overview.cjs
SHELL_PAGES=/,/scoundrel/,/scoundrel/gallery/,/scoundrel/reports/ node scripts/shell-browser.cjs
```

Tests compare both solvers against an independent exhaustive search
over small dungeons, check compact transitions against the full engine, replay all
all published policy histories, check invariance to hidden deck permutations, and verify all 44 art hashes differ. The browser test exercises
all-action analysis, a full winning descent, save/resume, themes, collection,
responsive layouts, both avoidance directions, a full 100k worker budget, search
cancellation, extension to 1M, decimal formatting, fixed carry slots, equivalent
best choices, report filters, recorded move-history viewers and CSV export against assembled files.
The responsive check measures actual text bounds for all 44 names, verifies
touch targets and both combat actions, and exercises the art viewer, enlarged
text and phone EV rows across ten desktop/phone viewport sizes.

Hearts and health use red, diamond weapons use blue, club Treefolk use green,
and spade Stonekin use slate. Card labels, number seals and item actions
share a black surface with light suit-colored text and borders. These semantic
colors stay consistent across all atmosphere settings. UI copy is limited
to names, status, actions, rules and analysis; flavor lore remains in the catalog
metadata but is not shown in the interface.
