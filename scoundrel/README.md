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
it and returns focus. Pointer movement tilts cards gently and moves a soft light.
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
budget. Fixed-size buffers, exact canonical state keys, cached visible-room
transitions, precomputed utility arithmetic, and a shared combinadic room cache
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
node scoundrel/tests/responsive.cjs
node scoundrel/tests/gallery.cjs
# With local WebKit installed, also check mobile Safari's rendering engine:
SCOUNDREL_BROWSERS=chromium,webkit node scoundrel/tests/responsive.cjs
SHELL_PAGES=/,/scoundrel/,/scoundrel/gallery/,/scoundrel/reports/ node scripts/shell-browser.cjs
```

Tests compare both solvers against an independent exhaustive search
over small dungeons, check compact transitions against the full engine, replay all
all published policy histories, check invariance to hidden deck permutations, and verify all 44 art hashes differ. The browser test exercises
all-action analysis, a full winning descent, save/resume, themes, collection,
responsive layouts, both avoidance directions, report filters, recorded move-history
viewers and CSV export against assembled files.
The responsive check measures actual text bounds for all 44 names, verifies
touch targets and both combat actions, and exercises the art viewer, enlarged
text and phone EV rows across ten desktop/phone viewport sizes.

Hearts and health use red, diamond weapons use blue, club Treefolk use green,
and spade Stonekin use slate. Card labels, number seals and item actions
share a black surface with light suit-colored text and borders. These semantic
colors stay consistent across all atmosphere settings. UI copy is limited
to names, status, actions, rules and analysis; flavor lore remains in the catalog
metadata but is not shown in the interface.
