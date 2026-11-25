# OFC card vision

Finds face-up playing cards on office-3's overhead wide camera (Marshall CV374, 1920x1080, 25 fps) and names
each one, or leaves it unnamed. The goal is to never name the wrong card. The page `index.html` shows overlays on held-out
frames.

## The deck

- Two-colour standard-index decks: black clubs and spades, red hearts and diamonds. It is not a four-colour deck.
- One deck has red backs and one has blue backs. The two decks have **different court-card art**:
  - deck A has large yellow and grey figures with small indices;
  - deck B has big corner letters and a small figure.
  - A third, dark-backed deck box also appears on the table; it reads as `none`.
- From Nov 24 about 16:14 EST a **jumbo-index PokerStars deck** (dark patterned backs, big corner indices, small court
  panels) is used in some hands (n1532: 16:13–16:17, 16:26–16:30, 16:34–16:37 and 16:45–16:48 EST; the other hands
  are classic, `labels/n1532-deck-hands.json`). `cls-v3` never saw it. A deck gate sends its crops to a jumbo reader
  (below).
- Cards are about 50x75 px. Pips are readable, and court ranks are told apart by their artwork more than by the tiny index.

## Runtime

```sh
python3 ofc/vision/ofc_card_vision.py frame.jpg --overlay out.jpg      # JSON of every body + its card or null
python3 ofc/vision/ofc_card_vision.py video.mp4 --start 60 --end 120 --jsonl reads.jsonl   # keyframes (0.64 s), hand state
```

In video mode each line has `cards` (every box: `card` = this view's read, `handCard` = the name to report,
`source` = `view` | `carried`) and `covered` (cards named earlier that are now hidden under others and no longer boxed).
Start a run at the beginning of a hand: names are carried from views seen earlier in that hand.

Needs `onnxruntime`, `opencv-python` and `numpy`, plus `av` for video. `profile.json` pins every model by SHA-256.

| Stage | Model | Input | Output |
| --- | --- | --- | --- |
| Card body | `models/card-body.onnx`, YOLO11n-OBB, one class | table crop `frameCrop` = x 130, y 190, 1781x835, area-resized by 0.575 into 1024x480 (grey 114 pad) | (6, N): cx, cy, w, h, conf, angle (rad); conf ≥ 0.25, rotated NMS 0.5 |
| Identity | `models/card-identity.onnx`, CardNetFast (0.38 M params) | each body rectified to 64x96 BGR, 10 % margin | 52 suit-first codes (`SA`…`DK`) + `none` |
| Identity fallback | `models/card-identity-fallback.onnx` (cls-v5a, same net) | crops where the main classifier's best card < 0.3 or `none` on top (and the deck gate says classic) | same |
| Deck gate | `models/card-deck.onnx` (deck-v1, same net, 3 outputs) | every crop, both turns | classic / jumbo / none |
| Jumbo reader | `models/card-identity-jumbo.onnx` (cls-f1, same net, factorized head) | crops with p(jumbo) ≥ 0.5 in both turns | 52 codes + `none` (log p) |
| Corner reader | `models/card-corner.onnx` (corner5, rank from luma × suit from colour) | in jumbo-deck hands, the 4 corners (36x36) of each unnamed slot's crop | per corner 52 codes + `none` (log p) |

**Gate.** A body is named only when all of these hold:

- the average of the crop and its 180° turn puts a card (not `none`) on top with p ≥ 0.8;
- the margin over the runner-up is ≥ 0.3;
- both orientations pick the same card, each with p ≥ 0.8;
- it is the most confident body with that name in the frame (one copy per identity).

`StaticCardFuser` averages a card's probabilities while it lies still. OFC rows don't move until the hand is cleared. A confident different card on the same spot starts a new track.

CPU cost on an M4 Pro is about 40 ms per frame for the detector, plus about 1 ms per card.

## Held-out results

Held out as whole sessions (EST):

- `s1836` = `ofc-20261123-1836.mp4`, Nov 23 18:36–19:12, two players;
- `s0023` = `ofc-20261124-0023.mp4` 0–600 s, Nov 24 00:23–00:33, three players.

No frame from these sessions was used for training. The stud file comes from the same recording as `s0023`, so it was used only from 11:00 onward.

Ground truth comes from tracks of a card lying still. Every one of the 650 held-out tracks was checked by eye on contact sheets:

- 446 are readable cards (all 52 identities appear);
- 8 are not cards (backs, objects);
- 196 were too covered or fanned to read by eye (`?`). Those are not scored.

Crops were taken every third keyframe (about 1.9 s).

| p gate (margin 0.3) | named / readable card views | wrong | non-card views named |
| --- | --- | --- | --- |
| 0.5 | 8680 / 8858 (98.0 %) | 10 | 0 / 41 |
| 0.7 | 8555 / 8858 (96.6 %) | 2 | 0 / 41 |
| **0.8 (shipped)** | **8504 / 8858 (96.0 %)** | **0** | 0 / 41 |
| 0.9 | 8287 / 8858 (93.6 %) | 0 | 0 / 41 |

- **Wrong reads below the gate:**
  - 8♠→7♠ ×2, 2♣→3♣ ×2, 8♦→7♦, 7♣→8♣, 7♣→6♣ (pip count off by one, nearly always a hand over the card);
  - 5♠→5♦, 3♣→5♥, 2♣→5♠ (partly covered).
- **Read rate by kind at 0.8:**
  - pips 96.7 %, courts 97.4 %, aces 85.7 %;
  - weakest: A♠ 53 % (the ornate deck-A ace sits at about 0.7 against 7♠), 9♥ 60 % (one card half under a 9♠).
  - The rest are in `eval/heldout-v3.json`.
- **Track level** (mean over a card's views): 429 / 446 cards named, 17 left unnamed, 0 wrong.
- **Detection:**
  - while a labelled card lies on the table, the detector finds it on 93.5 % (s1836) and 91.7 % (s0023) of keyframes (median 97.5 %);
  - checked by eye on held-out overlays: every fully visible card in laid-out rows is boxed, with one edge card of a finished 13-card hand missed;
  - no boxes on chips, phones or the laptop;
  - the deck box is boxed and classed `none`.
- **Unverifiable reads:** 468 views on the 196 "too covered to read by eye" tracks were named at 0.8. A sampled sheet looked plausible, but they cannot be confirmed from pixels.

## Hand state: covered and fanned cards

An OFC card does not move once it is placed, so a card named while it was fully visible keeps its name after later
cards are fanned over it. `OfcHandState` (in `ofc_card_vision.py`, used by `OfcCardReader.read_hand`) keeps the table
for the current hand:

- **Slots.** Each placed card is a slot anchored where it lies (median of its boxes). A box joins a slot only within
  6 px and 8°: still cards jitter 0.4 px median, under 4 px for 95 % of views, while a card fanned over another sits
  10+ px away. The first version used the 12 px track gap from training and slid onto the top card of a fan.
- **Covered cards live on.** A placed slot stays while any detected box covers its anchor, so a card buried in a
  fan, whose own box the detector suppresses, is still on the table (`covered` in the output).
- **Naming.** A slot is named after 2 single-view reads that pass the reader gate, at least 80 % of its votes, and
  only if the median of its last 10 views up to the latest vote puts that card on top at >= 0.8. (An ornate A♠ that
  v3 reads as 7♠ at 0.77–0.81 was named 7♠ without the median check.)
- **Saying nothing.** A view whose own read contradicts the slot says nothing; 2 in a row start a new slot (a card
  replaced). A view whose probabilities put another card at >= 0.3 also says nothing, unless that card is one known
  to lie on top of this one. (An 8♠ laid exactly on a 7♦ was carried as 7♦ for 8 s before this rule.)
- **One card, one place, one hand.** Names seen since the table was last empty (<= 1 card for 3 s) belong to one
  slot. The same name on an overlapping slot (a nudged card), or on a hidden slot while a visible slot holds it (a card
  moved while its old spot stays covered), folds into the current slot; any other clash keeps only the best-supported
  slot. A single-view read of a name another slot holds is dropped.

### Held-out results (same two sessions)

The runtime was run over the scanned keyframes (every keyframe, 0.64 s) with the shipped classifier (`scripts/sim.py`).

| | s0023 (3 players, fanned rows) | s1836 (2 players) |
| --- | --- | --- |
| card boxes named, single view | 4469 / 8260 (54 %) | 22654 / 26739 (85 %) |
| card boxes named, hand state | **5705 (69 %)** | **23137 (87 %)** |
| of which covered (no single read) | 1328 | 698 |
| cards on the table at hand end*, single view | 33 / 70 (47 %) | 282 / 384 (73 %) |
| cards on the table at hand end*, hand state | **51 / 70 (73 %)** | **330 / 384 (86 %)** |

\* Busiest keyframe in the 20 s before each hand is cleared: boxes on placed cards plus covered cards named earlier
and no longer boxed (unnamed hidden cards are not counted). 3 and 17 hands.

**Wrong names.**

- **Reference check:** 0 wrong against the reference over 28,192 views. The reference is the offline hand state
  (`scripts/hand_state.py`) built on v3's single-view reads.
- **Eye check:** every held-out slot where a name was carried onto views the single-view gate could not read was
  checked on filmstrips and full-resolution zooms:
  - 16 + 30 slots carried onto covered views;
  - 3 + 54 slots named only by the runtime (mostly cards a player moved, earlier blanked as duplicates).

  One error was found: the 8♠-on-7♦ case. The contradiction rule removes it.

### Eye-checked hand ends (2026-11-24)

The numbers above compare the runtime with a reference built from the same classifier. An independent truth set was
then labelled by eye: every object at each hand end of both held-out sessions (19 keyframes, 16 + 3 hands; format in
`eval/eye-truth/README.md`). Every legible card was named from 4x crops, multi-frame averages and filmstrips, with no
model names shown. Then each disagreement with the runtime was zoomed. 8 first-pass reads were pip-count slips on the
4x tiles (7♣ for 8♣, 9♠ for 10♠, …), and the zoomed and averaged views agreed with the model. No disagreement went the
other way.

| hand ends | s0023 (3 players) before → after | s1836 (2 players) before → after |
| --- | --- | --- |
| legible cards named right | 51 / 57 → **52 / 57** | 298 / 311 → **303 / 311** |
| legible cards named wrong | 0 → **0** | 0 → **0** |
| names reported for a card that had left the spot | 0 → 0 | 5 → **0** |
| objects with no card under them (ghost slots) | 0 → 0 | 12 → **2** (both unnamed) |
| illegible objects (`?`) given a name | 0 / 29 → 0 / 29 | 0 / 71 → 0 / 71 |
| legible cards with no object (detector misses) | 0 | 3 → 3 |
| never-seen fanned cards with no object (countable frames) | not countable | 24 → 24 |

`dup` objects (31 in s1836, a second box on the same card) are never named. The old metric (cards at hand end named,
`hand_end_sim.py`) moves 51/70 → 52/70 (s0023) and 330/384 → 329/378 (s1836): the 7 ghost slots it used to count as
named covered cards are gone.

**Changes shipped** (all `OfcHandState` parameters in `profile.json`; sim with `scripts/sim.py`, which now reads 4x
keyframe thumbnails from `scripts/eye/thumbs.py` for the felt check):

- **Bare felt ends a slot** (`feltReads` 2): a hidden slot whose centre shows felt blue on 2 keyframes in a row
  (`bare_felt` on the frame area-downscaled 4x) is dropped and its name freed. Fanned cards keep a buried card's
  centre covered by white. This removed 4 wrong reports of cards that had been picked up or moved (6♥, 4♣, K♠ on
  empty felt; 2♠ moved).
- **A glimpse is not a placed card** (`glimpseSeconds` 1.5): a name seen for less than 1.5 s is carried under cover
  only if a later card lies on top of it. Removed an 8♥ that was only ever in a player's hand.
- **Moved cards** (`moveReads` 2): a hidden named slot whose name is read whole ≥ 30 px away on 2 keyframes is
  dropped (a read within 30 px is the same card nudged and keeps its slot).
- **No contradiction from an unnamed card on top** (`coveredContradiction`): the view of a covered card often shows
  the card on top. When that card has no name yet, it no longer cancels the carried name (J♠ under a 5♦, 2♣).
- **Ornate A♠ gate** (`acceptance.perClass.SA` 0.5 / margin 0.2, `handState.perClassMedian.SA` 0.5): v3 tops the
  deck-A ace at 0.55–0.75 against 7♠. Over all 7 sessions, every slot where v3 puts A♠ first in both turns at ≥ 0.5
  with margin ≥ 0.2 and the old gate left it unnamed was checked on a sheet: 73 slots, all A♠ (both decks). The 268
  views this newly names on held-out are all A♠.

**Tried, not shipped:**

- **Classifier v4** (`scripts/eye/make_index4.py`, 64.5k crops from the training sessions only, labels = hand-checked
  tracks + carried names on covered views). Its first label sheets had real errors. Hand-checked track intervals span a
  card laid exactly on another (an A♣ track also holds the A♥ put on it). Covered views often show the card on top.
  Even after filters (keep a covered view only when v3 already leans to its label), v4 named a 4♦ as 4♥ for 47 views
  (a heart card's pip column over the 4♦'s left half). Rejected.
- **v4b** (whole views only + the ornate A♠): 299 vs 301 at hand end, and 2 new single-view pip-count misreads.
  Rejected.
- **One-vote naming at p ≥ 0.9** (`singleVoteProbability`): +1 card (Q♥ seen whole once), but 3 names on illegible
  objects and 5 on duplicate objects. Off (2.0).

**What is still wrong or missing at hand end (all unnamed, none wrong):**

- s1836, 8 legible cards unnamed:
  - deck-A A♠ under a fan, only its pip showing;
  - A♣ half covered (v3 0.4);
  - 10♣ seen whole for 2 keyframes at the very end;
  - 7♥ (v3 0.74 every view);
  - 6♥ boxed only at detector 0.1–0.25;
  - 4♦ ×2 (a heart card fanned over one, v3 reads 4♥ at 0.65; the other at 0.4–0.6);
  - Q♥ seen whole once.
- s0023, 5 legible cards unnamed: 5♦ never boxed on its own; 8♠ laid exactly on a 7♦ (v3 reads 6♠); 8♥ under the
  3♥ after a re-lay; Q♠ and K♠ in a fan (v3 none / 0.42).
- Detector: 3 legible cards with no box (4♥ and 5♣ in s1836 501 s; 2♠ in 959 s, where one box spans the J♦ and the 2♠).
  All three are named hidden slots since `stillKeep` (next section).
- **Exclusions (illegible, counted):** 100 objects (29 + 71) and 24 countable cards with no object. All lie in rows
  laid down already fanned (Fantasyland and three-player pineapple), shown only as 10–20 px strips with ~7 px
  indices. The labels file of each frame says where. Placement-time views (`scripts/eye/qsheet.py`) show neighbouring
  cards over them from the moment they land. Four s1836 hand ends (1104, 1469, 1697, 1791 s) are mid-Fantasyland
  sorting; cards there are moving in groups.

### Half-covered cards and new held-out footage (2026-11-24 evening)

**Why the 3 "detector misses" were missed.** All three were named while whole. Then a row was laid or slid over
their top half (4♥ and 5♣ in s1836 501 s, after the top player re-laid a row at 496 s; 2♠ in 959 s, under the J♦).
The detector stops boxing a half-covered card: no raw candidate reaches 0.02 (`scripts/eye/detdbg.py`). A hidden slot
lived only while some box covered its centre, so after `gapNamed` (12 s) the slot and its name were dropped. The same
thing happens to a card the detector simply stops boxing: a whole, legible Q♠ at the top-row end in n1501 946 s has
no box from 894 s on.

**Shipped: `handState.stillKeep` 0.6.** When a slot is boxed, its footprint on the 4x-downscaled frame (the same
`small_frame` as the bare-felt check) is kept as a 12x18 reference (`footprint()`). A named, non-glimpse slot with no
box stays alive while at least 60 % of its footprint is unchanged (every channel within 25) since that last box.
A half-covered card keeps its visible half. A card taken away shows felt, a hand, or whatever replaced it.

- Measured (`scripts/eye/trace.py`), true half-covered cards keep 0.71–1.00 of their footprint (4♥ 0.86–0.95, 5♣
  0.71–1.0, 2♠ 0.71–0.93, 8♦ 0.76–0.87).
- A ghost 10♦ (s1836 1791 s, taken by a hand at 1781 s, deck put on its spot) drops to 0.35–0.47.
- A first version, "the slot's centre still shows card white", kept that 10♦ and was dropped.
- Every new name this rule puts at a hand end was checked on filmstrips of the slot from its last whole read to the
  hand end (`scripts/eye/checkx.py`). Each one was the same card still lying there under later cards. These were the
  3 no-box cards, 8♦/4♣/6♦ (s1836 1244/1697/1906 s), 2♥/8♦ (s0023 101/293 s), Q♠ and a 5♥ (n1501 946 s), and Q♠/A♠
  under a K♠ on face-up discards (n1532 4544 s).

**New held-out footage.** Office-3 wide camera, never trained on. `n1501` is 15:01–15:31 EST, the combined file: 2
players, red/blue decks. `n1532` is the 1-minute clips 0–77 from 15:31:55 EST, stitched on a cumulative-duration clock
(`scripts/eye/src.py`). It has 2–3 players on the right side, and from about 16:14 EST a third deck: jumbo-index
PokerStars cards with dark backs that the classifier never saw. There are no cards between 15:49 and 16:14 EST.

- Scans: `scripts/eye/scan2.py` (scan_state + thumbs in one decode).
- 32 hand ends were found. 6 were eye-labelled the same way as `eval/eye-truth`: n1501 223/946/1694 s and n1532
  154/2703/4544 s, 208 objects.
- Labels were read from 5x tiles (`zsheet.py`) and 8x 2 s averages (`avgz.py`), with court art compared against the
  reference sheets. Objects in fans were mapped by id on a 2 s average (`ovz.py`).
- A fanned object is the card it held when its slot was first boxed whole. Its position alone is ambiguous by
  ±8 px between neighbouring strips. Three first-pass labels were wrong this way and were corrected from the slots'
  earliest views (n1532 2703 obj 51 is A♣ and 37 is A♠, not "5♦" and "dup").
- `score.py` now takes any sessions (from the sim file names) and prints `EXTRA` for named objects the truth file
  lacks. A card with several objects (`dup:N`) counts as named when any of them carries its name.

| hand ends, legible cards named right | before (v3, hand state) | after (`stillKeep` 0.6) |
| --- | --- | --- |
| s1836 (16 hands) | 303 / 314 | **306 / 314** |
| s0023 (3 hands) | 52 / 58 | **53 / 58** |
| n1501 (3 hands, new) | 66 / 69 | **68 / 69** |
| n1532 (3 hands, new; 2 with the jumbo deck) | 36 / 86 | **38 / 86** |
| legible cards named wrong, all four | 0 | **0** |
| illegible (`?`) objects named | 0 | 0 |

The old truth gained 3 legible objects (the no-box cards, now hidden slots) and a relabel: s0023 533 s object 4,
labelled `?`, shows K♥'s index and pip on a 6x average and is now `HK`. Five `C?` objects (named under fans, not
scorable) were added.

### Jumbo-index deck: fallback classifier (2026-11-24 evening)

`cls-v3` gates every jumbo-index card out as unknown (0 wrong), so n1532's two jumbo hands were almost all unnamed.
gigarepo's `ept-faceup-v5/full-face.onnx` read only 31 / 47 of those boxes zero-shot, with confident wrong reads
(6♠ → K♦ at 0.86, K♣ → K♦ at 0.91), so it was not used.

**Training data.** The deck changes between hands. (Correction, 2026-11-25: the jumbo hands are the ones ending at
about 2720, 3494, 3937 and 4558 s of n1532's clock. The hand ending at 3746 s is classic; see
`labels/n1532-deck-hands.json`.)

- The hand-state slots of 3230–3940 s (16:25–16:37 EST) were rendered at 3x from full-resolution frames
  (`scripts/eye/jslots.py`) and labelled by eye. That gave 106 slots (jumbo plus some clear classic cards, and phone
  and back crops as `none`), 3,959 crops (`labels/n1532-jumbo-slots.json`). Fan strips and doubtful slots were left
  out.
- Only crops taken before any later card overlapped the slot are used. Covered views had poisoned v4's labels.
- The jumbo truth hands (2703 and 4544 s) and every other session stay held out.
- 12 jumbo classes never appear in the window (3♠ 4♠ 8♠ 3♥ 6♥ 7♥ 8♥ 2♣ A♦ 2♦ 4♦ 9♦).

**cls-v5a** (`scripts/ft_cls.py`): v3's ONNX weights, BatchNorm folded, loaded into CardNetFast with frozen BN. It was
fine-tuned for 6 × 300 steps × 128 at lr 1e-3 on v4b's whole-view index (59.5k crops) and the jumbo crops, 2 : 1.

- Box level on all 472 legible boxed truth objects (`scripts/eye/boxeval.py`): gated right 392 → 412, gated wrong
  0 → 0. Jumbo truth frames 4 → 10 and 1 → 8.
- **Rejected as the main classifier.** In the hand state it named n1532 56 / 86, but it put 3 wrong names on old-deck
  objects that v3 leaves unnamed: A♠ for an A♥ under a 10♣ (s1836 1605 s), C3 and C6 on fan strips (s1836 1697 and
  1791 s). v3 itself leans to the same wrong card on those views (0.31–0.9). v5a is just sharper.

**Shipped: v5a as a fallback** (`fallbackClassifier`, `below` 0.3). A crop is read by v5a only when v3's best card is
< 0.3 or `none` is on top, which is the case for a deck v3 never saw. The same gate and hand state apply after that.

- On 6,000 s1836 crops v3 is never that unsure where v5a is confident. On held-out jumbo crops it is unsure on 634 of
  2,848.
- At `below` 0.5 the A♥ → A♠ name came back (v3 held it at 0.31–0.41), so 0.3 it is.
- Every view in all four sessions where the fallback changes the reported name was listed against the v3-only run
  (`fb30-diff`): 0 in s1836 and s0023, 1 in n1501 (an ornate A♠, right), and 136 slots in n1532.
- All 137 slots were checked by eye on 3x tiles with their names; one was checked on a filmstrip (an A♣ over an 8♠).
  All are right, including the 30 outside the training window. No view where v3 named a card changed name.

| hand ends, legible cards named right | v3 | + `stillKeep` | + fallback (shipped) |
| --- | --- | --- | --- |
| s1836 | 303 / 314 | 306 | **306 / 314** |
| s0023 | 52 / 58 | 53 | **53 / 58** |
| n1501 | 66 / 69 | 68 | **68 / 69** |
| n1532 | 36 / 86 | 38 | **44 / 86** |
| named wrong, all four | 0 | 0 | **0** |

**Still unnamed at hand end (none wrong):**

- s1836, 8: A♠ (ornate, under a fan), A♣ half covered, 10♣ seen 2 keyframes, 7♥ (v3 0.74), 6♥ (weak box only), 4♦ ×2,
  Q♥ hidden.
- s0023, 5: 5♦ (hidden, never boxed alone), 8♠ on 7♦, 8♥ under a re-laid 3♥, Q♠, K♠.
- n1501, 1: 4♣ half under a 5♥ in a fan (15:29:30).
- n1532 154 s (15:34:29), 3: 9♥ turned 30° over a Q♣, 5♣ hidden, 4♠.
- n1532 2703 s (16:16:58), 15 jumbo cards: 5♥ 3♠ 4♥ 4♠ 2♦ K♦ K♠ J♠ Q♦ 6♠ 10♠ 4♦ 7♦ 7♥ 7♠.
- n1532 4544 s (16:47:39), 24 jumbo cards: 7♦ 7♥ 2♣ 8♠ 10♣ J♦ Q♦ 4♦ 3♥ A♣ J♠ Q♣ K♦ A♦ 5♣ K♣ K♠ 5♠ 5♦ 4♠ 8♥ 8♣ 6♠ 3♠.
- Most of these are classes missing from the jumbo training window, or cards where v3 holds a weak opinion (≥ 0.3),
  so the fallback is not asked.
- Cards with no object: s1836 22 never-seen fanned strips; n1532 12 fanned jumbo cards whose index shows but that
  have no box of their own (bottom fans and the right player's stacked columns).
- 2 false objects (unnamed hidden slots on felt, s1836 1356 and 1791 s) remain.

**Next for the jumbo deck** (done 2026-11-25, next section): look for more footage of the 12 missing types.

### Deck gate and jumbo reader (2026-11-25)

**No more jumbo footage.** Every other office-3 recording in `~/Downloads` was checked:

- the 15:01 file (n1501) is classic;
- the Nov 17, 21 and 23 folders hold backgammon and the classic-deck OFC used for training;
- the 16:47–17:22 EST clips after n1532 are pack-up and a classic-deck hold'em game.

Within n1532, the four hands not yet labelled (2720–3225 and 3937–4375 s) are classic. So is the hand at 3494–3746 s
inside the old training window. The jumbo deck appears in only four hands: two were trained on (3225–3494 and
3746–3937 s) and two are the eye-truth hands (2703 and 4544 s). The 12 missing types cannot be filled with real
labelled views, and there is no unused jumbo hand end left for fresh truth.

**Why the fallback missed so much.** `scripts/eye/objdiag.py` lists, for each unnamed truth card, how its slot's views
read.

- About 8 jumbo cards were read right and confidently by cls-v5a, but v3 held a weak opinion (≥ 0.3, sometimes the
  wrong card: 5♥ → 5♠ at 0.65, 7♠ → 9♠ at 0.61, 2♣ → 2♠ at 0.46), so the fallback was never asked.
- v3 can also be confidently wrong on this deck. The shipped runtime named a jumbo 3♣ as 3♠ for 15 keyframes at
  16:13:05 EST (2470–2480 s). That is not at a truth hand end, so the score never showed it.

**Shipped: deck gate** (`deckGate`, deck-v1, `scripts/train_deck.py`). This is CardNetFast with v3's convolutions and
a classic / jumbo / none head. It was trained on whole-hand deck labels, so no identity labels were needed:

- jumbo: every crop of the two jumbo training hands;
- classic: every crop of the classic n1532 hands at 2720–3225 and 3494–3746 s, plus the old sessions' v4b crops;
- none: crops both classifiers call `none`.

| p(jumbo) in both turns (`scripts/eye/deckeval.py`) | ≥ 0.5 | ≥ 0.9 | ≥ 0.99 |
| --- | --- | --- | --- |
| classic held-out crops: s1836, s0023, n1501, n1532 0–1023 s and 3937–4375 s (84,849) | **2** | 0 | 0 |
| jumbo truth hand 2703 s (3,484 crops, backs and phones included) | 95 % | 88 % | 34 % |
| jumbo truth hand 4544 s (3,450 crops) | 80 % | 68 % | 22 % |

A crop with p(jumbo) ≥ 0.5 in both turns is read by the jumbo reader instead of v3. Every other crop keeps v3 and the
fallback rule (v5a where v3's best card is < 0.3 or `none` is on top). The gate and hand state apply as before. The
gate costs about 1 ms per card.

**Shipped: jumbo reader** (`deckGate.classifier`, cls-f1, `scripts/ft_fact.py`). This is v3 fine-tuned like v5a, with
the same data (v4b whole views and the jumbo crops, 2 : 1, 6 × 300 steps). Its head is factorized: rank (13 +
`none`) × suit (4), and p(card) = p(rank) · p(suit). The 12 missing types are pairs of a rank and a suit that each
appear in other jumbo cards. The ONNX outputs log p, so it drops in for any classifier.

- On the truth cards it puts the right card on top for H3, H4, H7, D7 and DQ, where v5a had `none` or another card.
  Few of these reach the 0.8 gate yet.
- As the fallback for all unsure crops (`f1`), it named a sideways classic 3♦ as **4♦** (3 keyframes, 16:18 EST,
  2798–2884 s, a classic hand) and a classic multi-card fan as 5♠ (15:42 EST). Both crops came in through the
  "v3 unsure" route with p(jumbo) ≈ 0.01. So the jumbo reader reads only deck-gated crops, and v5a stays the
  fallback for the rest.
- f2 (1 : 1 weighting, 10 epochs) was no better on the truth cards and was not used.

**Checks.** Every name the new runtime reports differently from the shipped one was listed (`scripts/eye/namediff.py`)
and checked by eye on 4x crop sheets (`diffsheet.py`). Doubtful ones were also checked on full-resolution 5x views and
1.2 s averages (`slotzoom.py`).

- s1836, s0023, n1501: **0 views differ** (deck gate alone and gate + jumbo reader).
- n1532, deck gate alone: 129 slots differ. All are names added on blank views, plus the 3♠ → 3♣ fix; all right.
- n1532, the jumbo reader on top: 34 slots, all right, except one keyframe at 16:29:09 EST (3434.7 s). A 5♠, still
  in the player's fingers, lands exactly on a Q♦, and its box carries the Q♦'s name. This is the known
  card-on-card carry (the 8♠-on-7♦ case above); the next keyframe names the 5♠.
- The only change in a classic n1532 hand is a hidden K♥ (4121–4149 s) that is now carried, and it is right.
- Every slot named anywhere in the four jumbo hands with the deck gate was also checked (`allslots.py`, 246 slots).
  All are right.

| hand ends, legible cards named right | shipped (v3 + v5a fallback) | + deck gate | + jumbo reader (shipped) |
| --- | --- | --- | --- |
| s1836 | 306 / 314 | 306 | **306 / 314** |
| s0023 | 53 / 58 | 53 | **53 / 58** |
| n1501 | 68 / 69 | 68 | **68 / 69** |
| n1532 | 44 / 86 | 55 | **57 / 86** |
| named wrong, all four | 0 | 0 | **0** |

New at n1532 hand ends: 5♥, K♦, J♠, 10♠ and 7♠ (2703 s); 7♦, 2♣, 8♠, 10♣, Q♦, A♣, K♠, 5♦ and 6♠ (4544 s). 2♣ and
8♠ are among the 12 types the jumbo training never saw. 3♠, 8♥ and A♦ are now also named correctly mid-hand.

One truth card went the other way: the hidden 6♣ under the 4544 s fan is no longer carried. It is now unnamed, not
wrong.

**Still unnamed at hand end (none wrong):**

- s1836 8, s0023 5 and n1501 1, as listed above.
- n1532 154 s: 9♥, which gets its second gate pass one keyframe after the truth frame; 5♣ (hidden); 4♠, which v3 holds
  at 0.4–0.85 against 2♠ and which passes the gate only once.
- n1532 2703 s, 10: 3♠, 4♥, 4♠, 2♦, K♠, Q♦, 6♠, 4♦, 7♦, 7♥.
- n1532 4544 s, 16: 7♥, J♦, 4♦, 3♥, J♠, Q♣, K♦, A♦, 5♣, K♣, 5♠, 4♠, 8♥, 8♣, 6♣, 3♠.
- Most of these are fan strips, the right player's stacked columns, or covered views. In this deck the big indices
  stay legible in a fan, but no reader for never-whole strips ships (see the strip reader below). The others are
  whole cards the jumbo reader puts first below the 0.8 gate (median p: S3 0.68, H4 0.77, H7 0.80; D4 is a missing type it reads at 0.30).
- Cards with no object: unchanged (s1836 22 fanned strips, n1532 12 fanned jumbo cards). The detector was not
  fine-tuned. The 12 n1532 cards are bottom-fan and stacked-column strips: even when boxed, they would need a strip
  reader.

### Corner-index reader for the jumbo deck (2026-11-25)

The jumbo deck's index (rank glyph over a suit pip) is about 15 px tall at full resolution. It stays readable at the
edge of a fan strip and on the right player's stacked columns, where the whole-card readers see mostly other cards.
**The source video is 1920x1080 H.264 at about 12.6 Mbit/s in every session**: the CV374 is a 1080p camera, so there is
no 4K. Multi-frame averages were already used for the eye labels (`avgz.py`, 8x 2 s means).

**Reader.** `corner_patches()` cuts the 4 corners of the 64x96 classifier crop and turns each so that its corner sits
top-left. Upright cards carry the index top-left and bottom-right. Cards lying sideways in the right player's columns
get near-square boxes, so their index lands top-right and bottom-left. `models/card-corner.onnx` reads each patch:

- rank (13 + `none`) from contrast-normalized luma, because H.264 halves colour resolution and a red glyph blurs in
  colour channels;
- suit from colour;
- p(card) = p(rank) · p(suit).

**Training data** (`scripts/corner/`, jumbo training hands only: n1532 3225–3494 and 3746–3937 s; the truth hands
2703 and 4544 s were never used):

- Corners of the eye-labelled whole crops (`labels/n1532-jumbo-slots.json`). A crop gives a positive pair only when one
  diagonal pair of corners has index ink and the other has none (`build_corner_idx.py`).
- Some of those corners show a neighbour's index (a "J 9" or "7 2" pair at a fan edge). Positives were cleaned by
  4-fold cross-validation by slot (`cvclean.py`). Rejects of the rare ranks that showed a single clean glyph (A♥, 2♠,
  9♣) were put back by eye. The result is in `labels/n1532-jumbo-corner-keep.json`.
- Augmentation: rank and suit recombined from different cards at the gap between glyph and pip; a neighbour card
  pasted over the far side, with its own index (fan or column); and **synthetic rank glyphs** (`synth.py`). A patch's
  rank glyph is erased and another rank is drawn in a condensed system font at the same box, ink colour and blur. Each
  rank appears on only 1–4 physical cards in the two hands, and without the synthetic glyphs the reader confused 3/7,
  4/A, 5/6 and 6/8/Q.

| corner reader, trained on hand A, read on hand B's labelled crops (`eval_corner.py`) | p ≥ 0.5 | p ≥ 0.8 | two corners agree |
| --- | --- | --- | --- |
| corner2 (min-channel rank) | 1092 right / 34 wrong | 980 / 13 | 987 / 0 |
| corner3 (luma rank) | 1178 / 39 | 1000 / 2 | 1099 / 0 |
| corner5 (cleaned + recombined + synthetic, shipped recipe) | **1243 / 7** | **1162 / 0** | 980 / 0 |

Trained on hand B and read on A, every version was poor (hand B has no 6 at all). The shipped model trains on both hands.

**Naming** (`OfcHandState`, all in `profile.json`). It runs only in a hand where ≥ 50 % of the crops so far pass the
deck gate (`jumboShare`), and only on slots the card reader leaves unnamed. A slot is named from corners when:

- `cornerPairVotes` (2) views have two corners that both put the same card on top at ≥ 0.5, and no view has two
  corners agreeing on another card; or the mean corner read over ≥ 3 views is ≥ 0.8 with margin 0.3, and 80 % of the
  views agree (`strip*`);
- **and** the card reader's median over the slot's last 20 views has the same card on top at ≥ `cornerMedian` (0.5);
- **and** no slot has held that name in this hand. The name is shown on the slot's box and on its hidden slot.

Each guard came from a wrong name found by eye:

- **Corner reader alone** (corner4): it named a whole, clear 4♥ as A♥ at the 2703 s hand end (wrong at the truth
  frame), and mid-hand a 10♠ as Q♠, a 3♦ as 7♦ and a 4♠ as A♠. Hence the agreement with the card reader.
- **Agreement at any p**: a sideways 2♦ was named 2♠ for 6 s (16:16:37–16:16:43 EST, n1532 2682–2688 s). Both readers
  leaned to the spade, the card reader with a median of 0.31. Hence `cornerMedian` 0.5. This was found on a truth hand,
  so that one threshold is not held out.
- **Stale hidden names**: a duplicate slot of a 10♠ was named after the 10♠ was picked up (2718–2727 s, cards being
  collected). Two fixes: no slot may take a name another slot held earlier in the hand, and corner evidence is cleared
  when a hand ends.

**Checks.** Every view whose reported name changed against the shipped runtime was listed (`namediff.py`): 0 in s1836,
s0023 and n1501, and 17 slots in n1532 (`corner/szany.py` full-resolution views):

- 12 in the two truth hands: 8♣, 4♥, J♠, 7♥ (2703 s hand); 6♣, 4♥, 4♠, 5♥, J♠, A♣, 8♠, Q♦, J♦ (4544 s hand);
- 5 in the training hands: 8♥, 7♠, K♠, 2♦ and 8♣.

All 17 are right.

| hand ends, legible cards named right | shipped (deck gate + jumbo reader) | + corner reader (shipped) |
| --- | --- | --- |
| s1836 | 306 / 314 | **306 / 314** |
| s0023 | 53 / 58 | **53 / 58** |
| n1501 | 68 / 69 | **68 / 69** |
| n1532 | 57 / 86 | **60 / 86** (4♥ and 7♥ at 2703 s, J♦ at 4544 s) |
| named wrong, all four | 0 | **0** |

Most corner names come before the truth frame and are later covered or dropped. The gain at hand end is small.

**Why the rest stay unnamed** (`corner/cdiag.py`, n1532):

- Whole cards the card reader tops under its gate (3♠ ×2, 3♥, the 2703 s 4♠): corner5 still reads a jumbo 3 as 5 and that
  4 as A, so the two never agree.
- 4♠ (4544 s): named by corners from 4422 s, but the name flickers off at the truth frame. One view's corners once agreed
  on A♠, which ends the pair path, and the mean read dips under 0.8.
- K♠ (2703 s): corners (mean 0.92) and the card reader (0.69) agree on its views, but it is never named. This was not
  traced further.
- Fan strips and stacked columns (D2, DQ, S6, D4 ×2, D7, H7, SJ, CQ, DK, DA, C5, CK, S5, H8, C8, C6): the card
  reader reads the card on top or `none`. With the agreement rule, a strip read by corners alone is never named. A
  box in a fan often sits one strip off its card, so a corner read cannot be bound to a slot safely without the card
  reader.
- 12 fanned jumbo cards still have no object (the detector was not fine-tuned).

**Classic deck, not done:**

- **Corner reader.** Classic indices are about 6 px and often faint on whole training cards
  (`corner/build_classic_idx.py`). They add little over the card reader, which already sees pips and art.
- **Multi-keyframe agreement** for classic cards under the 0.8 gate is unsafe. The s1836 4♦ under a fanned heart card
  reads H4 in 140 views (median 0.67), and v3 and v5a agree on it. The true 7♥ (0.74) cannot be told apart from it.

### Traced misses, ghost objects and fresh truth (2026-11-25, later)

Each remaining miss with a traceable cause was followed keyframe by keyframe (`scripts/eye/slottrace.py`: a slot's
votes, views, corner evidence, held names and report at every keyframe).

- **K♠ at 2703 s (16:16:58 EST).** Both readers agree on it (corner mean 0.92, card reader median 0.69), but the strip
  read had no margin. The box's bottom-right corner shows the ace index of the card the K♠ lies on, and the corner
  reader reads it as A♣ at 0.3–0.85. A♠ and A♣ are both named on other slots in this hand.
  **Shipped: `cornerHeldMargin`.** When a strip read is scored, the indices of cards another slot holds this hand
  are set aside: one card, one place, so a held card's index in a corner is a neighbour's.
- **4♠ at 4544 s (16:47:39 EST).** It has 39 gate passes, all 4♠, but the median of its last 10 views sits at
  0.78–0.80, so the card-reader name flickers. The corner path reads S4 on every view, but it was blocked because S4 was
  "held". The slot that held it was the 4♠'s own slot. **Shipped: `stripOwnHeld`:** a slot may take back a name it held
  itself. (The rule was always meant to block names held by *another* slot.)
  - That exposed an old hazard: a corner name on a hidden slot was still reported after the card was picked up. With
    `stripOwnHeld` alone, a 10♠ was reported hidden for 4 s after it was collected (n1532 2718–2722 s, 16:17:13 EST).
    The shipped runtime already did this for a 2♦ for 4 s (3894–3898 s, 16:36:49 EST, picked up mid-hand).
  - **Shipped: `stripHiddenStill`.** A corner name on a slot that is not boxed now is reported only while its footprint
    is unchanged since its last box (the `stillKeep` test).
  - Cost: a correct corner name is also dropped while a hand hovers over the card. That is 8 keyframes in n1532 (8♣,
    7♠, 4♥ and 7♥, 1–2 keyframes each).
- **Slot persistence for the 4♠ (`holdMedian`, rejected).** A named slot kept its name while the median stayed on top
  at ≥ 0.7. It added no hand-end name. It carried a 10♠ for 9 s after it was collected (2718–2727 s) and named an
  illegible s0023 object 8♥.
- **9♥ at 154 s (15:34:29 EST).** It passed the gate once at 150.4 s. The slot median is 0.80–0.85 from then on, and the
  second gate pass came at 154.9 s. **Shipped: `oneVoteViews` 6.** One gate pass names a slot when the median of its
  last 6 views also puts that card on top at ≥ the median gate (0.8). This is not the rejected "single read at
  p ≥ 0.9": the median gate is the one two votes already need. It names the 9♥ from 151 s.
  - Elsewhere it names 4♠, A♠, A♥ and Q♠ a few keyframes earlier in n1501, 10♣ and A♠ (1 keyframe each) in s1836, and
    10♠, 2♥, 10♠ and 5♦ in n1532. All were checked on filmstrips and full-resolution zooms.
- **s1836's two false objects.**
  - At 1356 s, a slot whose every view reads `none` at 0.95 (off the table, a lap) was kept alive by its own weak box.
    **Shipped: `noneHide` 0.5.** A slot that is not boxed now, has no gate pass and no corner pair, and whose views'
    median puts `none` at ≥ 0.5 is not reported.
  - A first version cut such slots' lives short (`noneDrop`). That changed which slot later boxes joined, and the 6♠ at
    4544 s lost its name. Reporting only cannot change association.
  - At 1791 s, an unnamed slot of a 10♦ that had been taken was kept for the 12 s grace after the deck was put on its
    spot. Its weak median read (10♦ 0.33) is the card that an overlapping named slot holds. **Shipped: `ghostGrace`:**
    such a slot gets no long grace once nothing covers it.
  - Rejected: no long grace for any unnamed slot without cover (`unnamedHold`). It named s0023's 8♥, lying under a
    re-laid 3♥, as 3♥ at the 533 s hand end. A footprint test (`unnamedFootprint`) did not remove the 1791 s object.

**Checks.** Every view whose reported name changed against 0cc8bcba was listed (`namediff.py`). Every changed slot was
checked by eye on filmstrips of its spot over the changed interval (`hidstrip.py`). Lost names were also checked for
another object still naming the same card (`namecover.py`).

- s0023: no change.
- s1836: 2 slots, both right.
- n1501: 4 slots, all right.
- n1532: 21 slots. All new names are right. The dropped names are the stale ones above (2♦; 4♥, 7♥ and J♦ during
  collection) or the 8 keyframes under a hand.
- One stale report is not fixed: a hidden K♥ is reported for one keyframe after it was taken (n1532 4149.2 s). It is
  the same in 0cc8bcba.

| hand ends, legible cards named right | 0cc8bcba | this change |
| --- | --- | --- |
| s1836 (16 hands) | 306 / 314 | **306 / 314** |
| s0023 (3 hands) | 53 / 58 | **53 / 58** |
| n1501 (3 hands) | 68 / 69 | **68 / 69** |
| n1532 (3 hands) | 60 / 86 | **63 / 86** (9♥ 154 s, K♠ 2703 s, 4♠ 4544 s) |
| **fresh** n1501 1309 s | 26 / 26 | **26 / 26** |
| **fresh** n1532 4197 s | 19 / 25 | **19 / 25** |
| named wrong, all | 0 | **0** |
| false objects still present (s1836) | 2 | **0** |

**Fresh truth** (`eval/fresh-truth/`) has 2 hand ends that were never trained on and never used to choose a threshold:
n1501 1309 s (15:23:05 EST) and the classic n1532 hand at 4197 s (16:41:52 EST), with 74 objects and 51 legible cards.
They were labelled the same way as `eval/eye-truth`: zoomed crops, averages and first-view sheets with no model names,
then a zoom of every disagreement. Two first-pass labels were pip slips; the runtime was right both times (8♥, 6♥). No
jumbo-deck hand is left unused, so the corner rules (`cornerAgree`, `cornerMedian` 0.5) still have no fresh jumbo check.

On fresh truth the runtime names everything legible in n1501. In n1532 4197 s it leaves 6 legible cards unnamed:

- the K♣ and K♠ in the top player's fanned court row;
- a 7♠ under a 6♣;
- a 9♣ in the right player's column and a 4♥ in the bottom fan, both on hidden slots;
- the bottom player's Q♣.

One illegible object is named (n1501 1309 s, object 34, 7♥). It is a heart strip between the 10♥ and J♥ whose index
cannot be read. 7♥ fits the row, but it cannot be checked from pixels.

**Fan-strip slot binding (measured, not shipped).** `scripts/corner/bindcheck.py` read each corner of the 27 legible,
unnamed, boxed strip objects at the jumbo truth frames. A corner counted as the strip's own when no slot placed later
covers it. The own corners gave a read for 8 strips: 6 right and 2 wrong (a 4♦ read A♠; and a 2♠ and 5♠ that share one
box). Placement order is often not the on-top order, because rows are laid already fanned and duplicate slots exist. A
row-layout model would need a held-out jumbo hand to validate, and none is left.

**Corner reader corner6 (trained, not shipped).** It is corner5's recipe with synthetic rank glyphs weighted 3× for 3
and 4, real 3s and 4s weighted 3×, and 8 rounder system fonts (`train_corner.py --rankw 3:3,4:3 --posw 3:3,4:3
--morefonts`).

- Trained on hand A and read on hand B, the 3♣ is right on 14 / 15 crops (corner5: 1 / 15) and the 4♥ on 34 / 39 (31).
  At p ≥ 0.8, though, it made 1 wrong read (2♠ → 6♠) where corner5 made none.
- On the truth hands it reads the 2703 s 4♠ as S4 (corner5: A♠) and the 4544 s 3♠ as S3 (corner5: 5♠). Both reads are
  at 0.43–0.45, too weak to name.
- In the runtime it changed no hand-end name. Mid-hand it added some right names and dropped others (a 2♦ for 15
  keyframes, a J♠ for 8). Not shipped.

### Fresh truth, stale names and a wrong name found (2026-11-25, round 6)

**Headline: fresh truth (never trained or tuned on), legible hand-end cards named right.**

| fresh hand end | b4d85aea | this change |
| --- | --- | --- |
| n1501 1309 s (15:23:05 EST) | 27 / 27 | **27 / 27** |
| n1532 4197 s (16:41:52 EST) | 19 / 25 | **19 / 25** |
| n1501 707 s (15:12:43 EST, new) | 26 / 28 | **26 / 28** |
| n1501 1470 s (15:25:46 EST, new) | 24 / 25 | **24 / 25** |
| n1532 4361 s (16:44:36 EST, new) | 23 / 27 | **23 / 27** |
| **fresh total** | **119 / 132** | **119 / 132** |
| named wrong / illegible objects named | 0 / 0 | **0 / 0** |

Eye truth is unchanged: s1836 306 / 314, s0023 53 / 58, n1501 68 / 69, n1532 63 / 86, 0 wrong.

The shipped change removes stale names (below). It adds no hand-end name. The only rule that added fresh names
(`holdAgree`) was dropped because it lengthened a wrong name.

**Fresh truth grew from 2 to 5 hand ends** (`eval/fresh-truth/README.md`). The three new ones (n1501 707 and 1470 s,
n1532 4361 s) were labelled blind, then every disagreement was zoomed. Four first-pass labels moved to the runtime's
answer (a pip slip, a jack's art and two box centres). None moved the other way.

**The 7♥ on n1501 1309 s object 34 is right.** The label had been `?~` (a heart strip with no readable index), so the
runtime looked like it named an illegible object. The trace (`scripts/eye/multitrace.py`, `regtimes.py`) shows:

- the 7♥ lay whole as the row's last card at 1245–1259 s and passed the gate as 7♥ 18 times;
- the J♥ laid at 1262 s turned it about 10° without lifting it, so a new slot started 7 px away;
- that slot reads 7♥ at 0.90–0.93 on every view to the frame, with the 7-pip layout (one upper centre pip) still visible.

The fresh label was bound to the new slot's first box, when the J♥ already lay on it. It is now `H7`. No runtime
change.

**Shipped: `feltHide` 'sticky'.** It fixes the stale K♥ at n1532 4149.2 s (16:41:04 EST). The K♥ was never boxed (the
detector missed it) and was kept by `stillKeep`. After it was picked up, the first bare-felt keyframe still reported it:
`feltReads` 2 drops a slot only on the second.

- Now a slot whose centre shows bare felt reports nothing.
- 'Sticky' means it stays silent until its own name is read whole again. A hand passing over the spot breaks the run of
  felt reads, and the taken card's name came back.
- A box that merely joins the slot is not enough. After a Q♠ was taken (n1532 3877.6 s, 16:36:33 EST), a spread deck's
  box joined its slot, and the old runtime showed Q♠ until 3899.4 s.
- Report-only, so slot association is unchanged.
- Every hand-end name is unchanged.
- Against b4d85aea it drops 2,496 reported names over 1,156 slots in the four sessions, mostly while rows were
  collected, and adds none. In every case but one the slot died within a second (the card had gone). The 61 spots where
  the old runtime's name came back later were all checked: each showed bare felt (`spotsheet.py`, `survive.py`). The
  exception is the Q♠ above.

**A wrong name in the shipped runtime (not fixed).** It was found while checking `holdAgree` below:

- At n1532 3621.6–3754.7 s (16:32:16–16:34:29 EST, a classic hand that is in no truth set), the right player's sideways
  **8♦** (pips in rows of 3, 2, 3) is reported as **7♦** for 71 keyframes.
- cls-v3 passes the full gate as 7♦ on 21 views, so no hand-state rule caught it.
- It is the pip-count slip listed under "Wrong reads below the gate", here above the gate on a sideways card whose box is
  upright, so the crop is squashed.
- No change shipped for it. Sideways cards in the right player's columns need their own check: crops rectified on the
  card's real orientation, or a pip-count test.

**Tried, not shipped:**

- `holdAgree` (with or without `holdAgreeBoxed`): a named slot whose ≥ 5 gate passes are all one card keeps its name
  while ≥ 90 % of its last 10 views top that card.
  - It named the 3♦ at 1470 s and the 5♦ at 4361 s (fresh 121 / 132), with every new name checked right.
  - But it lengthened the wrong 7♦ above from 71 to about 120 keyframes, so it was dropped.
  - Without `holdAgreeBoxed` it also carried names through collection while hands gathered the cards: a 2♦ for 7 s after
    it was taken (2897–2904 s), and a 4♠ in a moving fan (4554–4560 s).
- `wholeVote`: one whole gate pass, then ≥ 10 views topping the card at a median ≥ 0.6. It names the 7♠ under the 6♣ at
  4197 s, but it named illegible objects (s1836 1104 s object 14 as 3♥ and lost object 13). It is the same trap as
  single-read naming.
- `hiddenStill`: a hidden named slot is reported only while its footprint is still or a settled card's box covers it.
  It removes the collection-time names, but it cost hand-end names: s1836 306 → 304, and fresh n1501 707 s lost Q♠, J♠
  and 4♥ lying under the player's hand.

**s0023 533 s relabelled.** While checking `holdAgree`, object 3 (labelled `?`) was named 8♥. It is the same object
that sank `holdMedian`. An 8x 2 s average shows the 8♥ there:

- object 3's centre lies on the 8♥ strip (its pip column, index 8), between the 7♥ and Q♥ strips;
- the 8♥ lay at object 1 at 478–490 s, and the re-lay at about 504 s moved it about 40 px right;
- object 1 now shows the whole 3♥ that was put there. One deck has one 8♥.

Object 1 is now `X` and object 3 is `H8`. The shipped runtime names neither, so the score stays 53 / 58. Object 1 now counts as
one false object (an unnamed hidden slot).

**Why the fresh n1532 4197 s misses stay** (`multitrace.py`, first-view sheets):

- K♣, K♠: the top row was laid already fanned under a wrist at 4157 s. They are never whole, the reader gives
  0.35–0.65, and there is no gate pass. Strip-only, and naming by agreement at this level is the rejected classic rule.
- 7♠: one whole gate pass at 0.91 (4159.6 s); a 6♣ strip with no box of its own lies over its left side. Views top 7♠
  at 0.67–0.75, and the second gate pass (4195.5 s) comes with a recent median of 0.68. The rule that would name it
  (`wholeVote`) is rejected above.
- 9♣: the detector's upright box spans the sideways 9♣ and the diamond card below it in the right player's column. Every
  view reads `none` at 0.5–0.86.
- Q♣: the box covers only the visible two-thirds of the card (40×46), so the crop is stretched. It reads `none` at
  about 0.2.
- 4♥: an index strip in the bottom fan, boxed only twice (`none` 0.8).

**New fresh misses** (all unnamed, none wrong):

- n1501 707 s: the A♥ (a tall box spanning it and the card below, 1 gate pass) and the just-dealt 6♣ (0.78).
- n1501 1470 s: the 3♦ (44 gate passes, all 3♦, but the median of its recent views stays at 0.77–0.79 once a 4♥ covers
  its right half; the case `holdAgree` was for).
- n1532 4361 s:
  - the 5♦: named with 7 votes, then dropped by a median dip and buried;
  - the K♠ under the A♠ (1 gate pass);
  - the 5♠: only a tall box spanning three cards;
  - the A♥: its box spans the K♥ strip and reads a black ace at 0.25.
- Cards with no object:
  - 4197 s: 8 strips;
  - 707 s: the A♣, and the black 2 under the just-dealt 3♥;
  - 1470 s: the 4♥ (only `?` boxes);
  - 4361 s: 9, namely two diamond courts, the card under the hand and the 7♦ in the right column; the K♣, J♣ and 8♣
    strips; the 10♥ and 9♥ strips.

**Two-card boxes (2♣/2♥ and 8♠/8♦ at 4197 s).** They lie in the right player's sideways columns. Each box sits across
the boundary between two cards' visible bands (20–30 px of a sideways card). Splitting at the known card size would
give two index-and-pip strips, not whole cards, so naming them needs a strip reader. The masked strip reader below was
not shipped because such strips cannot be checked by eye, so splitting was not shipped either.

**Tools** (`scripts/eye/`): `multitrace.py` (slottrace for several spots in one pass), `regtimes.py` (a region at
several times), `spotsheet.py` (spots at given keyframes) and `survive.py` (whether a lost name came back). Scratch
is in `/private/tmp/claude-501/ofc-vision6` (NOTES.md).

### Strip reader (masked crops, not shipped)

For fans laid down already fanned (three-player pineapple rows, Fantasyland), the cards underneath are never seen
whole. Only a strip about 10–20 px wide shows, with a corner index about 7 px tall.

- **Training data:** carried names label real covered views (2,812 in the training sessions).
- **Synthetic fans:** cards pasted over clean crops, or grey card-shaped masks, cover all 52 cards.
- **Models:**
  - **v5 (pasted fans):** read a covered A♥ as 2♥ in 218 views. A♦ lay over it and J♠ over that, so its box showed
    one thin index strip next to the A♦'s blank half.
  - **v6 (masked):** greys out of each crop the cards that the hand state knows lie on top (`cover_mask`). On cards
    of known identity it named 25 covered views with 0 wrong. On never-seen fans it named 5 + 7 slots: most look right
    at 5× zoom (K♥, J♠, 6♣, A♠, Q♠), and 3 cannot be confirmed by eye.
- **Not shipped:** a never-seen fanned card cannot be verified from these pixels, so no strip model ships and
  `handState.stripProbability` is 2 (off).
- **Recipe:** `masks.py` → `make_strip_index.py` (MASKED=1) → `train_strip.py --mode mask`; add `stripReader` to the
  profile to try it.

## What still fails

- **Fans laid down already fanned** (three-player pineapple, Fantasyland 14+ cards): cards never seen whole stay
  unnamed. Cards seen whole before being covered are now carried (hand state above).
- **Hands over cards** cause most pip-count errors below the gate.
- Cards held in a player's hand, and cards moving while being dealt, are not read.
- The gigarepo skin-cover rule was not ported, because the eval works from saved crops.
- **A♠ (deck A)** has too few confident training views.
- **Fresh truth:** 119 / 132 legible hand-end cards named, 0 wrong (round 6 above).
- **Sideways cards in the right player's columns:** a sideways 8♦ passes the gate as 7♦ (n1532 16:32–16:34 EST); see round 6.
- **Jumbo-index deck:** 23 / 86 legible n1532 hand-end cards stay unnamed, mostly fan strips and stacked columns.
  The corner reader names some of these, but only where the card reader agrees. Only two hands of the deck were
  available for training, with 1–4 physical cards per rank.
- **Cards the detector stops boxing** keep their name only if they were named while whole (`stillKeep`).
- **The detector is the EPT model, not fine-tuned.** Fine-tuning on this footage would mostly help the corners of fanned rows.

## Recipe (scripts/)

Scratch lived in `/private/tmp/claude-501/ofc-vision/` (scan/, labels/, data/, models/). Run the scripts from a `work/` folder beside `scan/`. They use `../scan`, `../labels` and `../data`.

1. **`scan.py SESSION…`**
   - Decodes keyframes only (PyAV `skip_frame=NONKEY`, every 0.64 s).
   - Runs the detector at conf 0.1 and stores every body in `dets.jsonl`.
   - Writes 64x96 crops of bodies with conf ≥ 0.25 every third keyframe, plus a full frame every 60 s (held-out) or 120 s (train).
   - The 7 sessions took about 15 min with 3 jobs.
2. **`tracks.py`** links bodies into still-card tracks: same spot within 12 px and 12°, gaps up to 4 s, lasting at least 2.5 s.
3. **Seed.** `classify.py` runs gigarepo's `ept-faceup-v5/full-face.onnx` zero-shot.
   - It reads number cards of this deck well. It misnames courts by suit and art, for example K♣ as K♦, and never says A♣, K♣, J♥ or K♠.
   - `make_index.py ept 0.85` builds track-level pseudo-labels; `train_cls.py` trains v1.
4. **Hand review.** `review2.py` makes class-sorted contact sheets and `apply_review.py` writes the corrections.
   - All 742 training tracks predicted as a court card or ace were checked. That review found A♣, K♣, J♥ and K♠ by elimination of artwork.
5. **`make_index2.py`** builds the index: manual labels, plus number-card and `none` tracks the current model reads at ≥ 0.85–0.9.
   - Crops that confidently disagree with a pseudo-labelled track are dropped. Manual tracks keep every crop.
   - **`gen_none.py`** adds 3,150 `none` crops from training frames: felt, backs, chips, hands, and boxes half off a card.
   - `train_cls.py` then trains v2 and v3. Each run is 16–20 epochs × 300 steps × 128 on MPS, about 3 min.
6. **`split_tracks.py`** splits a track where a confident different card persists. When a hand was cleared, a new card was sometimes placed on the same spot within the 4 s link gap. Before this split, most "wrong" held-out reads were actually two cards sharing one track. The 26 new held-out segments were checked by eye.
7. **`eval_cls.py`** sweeps the gate on held-out crops. `show_wrong.py` and `show_unk.py` make sheets of wrong reads and of reads on unreadable tracks.
8. **Hand state.**
   - `scan_state.py` stores every box on every keyframe, with v3 probabilities and a crop each.
   - `hand_state.py` is the offline reference, and `film.py` / `final_film.py` / `review_new.py` / `ctx.py` make the
     review sheets.
   - `sim.py` runs the shipped runtime over a scan and scores it; `hand_end_sim.py` gives the hand-end table.
   - `masks.py`, `make_strip_index.py`, `train_strip.py`, `classify_all.py` and `eval_fused.py` are the strip-reader
     experiment.
   - `render_hand_samples.py` makes the page's hand-state overlays.
9. **`fp16_storage.py`** stores the detector weights as fp16 with a Cast back to fp32: 10.9 → 5.5 MB, max confidence change 0.003. **`render_samples.py`** makes the page overlays.
10. **New footage, eye truth and fallback (2026-11-24 evening),** scratch in `/private/tmp/claude-501/ofc-vision2/`:
    - `eye/src.py` maps sessions to files, including the stitched 1-minute clips.
    - `eye/scan2.py SESS T0 T1 NAME` scans state and thumbs in one decode; 2.8k + 7.3k keyframes take about 6 min each
      with 3 jobs.
    - `eye/sim2.py TAG SESS '{params}' [MODEL] [fb=FALLBACK:below]` runs the sim.
    - `eye/score.py` scores against eye truth.
    - `eye/zsheet.py`, `avgz.py` and `ovz.py` make labelling sheets.
    - `eye/checkx.py` filmstrips a named slot; `eye/trace.py` prints a slot's life at one spot; `eye/detdbg.py` shows
      raw detector candidates.
    - `eye/jslots.py` renders training-slot tiles; `eye/boxeval.py` gives box-level gated reads.
    - `ft_cls.py` fine-tunes from the shipped ONNX.
11. **Deck gate and jumbo reader (2026-11-25),** scratch in `/private/tmp/claude-501/ofc-vision3/` (scan/ links to
    ofc-vision2's scans):
    - `eye/deckends.py SIM` lists n1532's hands with the share of crops v3 is unsure about; `eye/jslots.py T0 T1 TAG SIM`
      renders a window's slots for labelling.
    - `eye/build_deck_idx.py` builds the deck-gate index (needs `../data/idx4b.json`, the v4b index); `train_deck.py IDX
      OUT` trains it (about 3.5 min on MPS); `eye/deckeval.py MODEL` scores it on every held-out crop.
    - `ft_fact.py` trains the factorized jumbo reader (same flags as `ft_cls.py`).
    - `eye/sim2.py TAG SESS deck=GATE.onnx:0.5[:JUMBO.onnx]` simulates with a candidate gate and reader.
    - `eye/objdiag.py SIM SESS NAME… [MODEL]` shows how each legible truth card's slot reads.
    - `eye/namediff.py OLD NEW [OUT]` lists every view whose reported name changed. `eye/diffsheet.py` and
      `eye/allslots.py` render check sheets, and `eye/slotzoom.py` renders full-resolution views of one slot.

**Dataset sizes:**

- 74,212 body crops over 7 sessions; 3,775 tracks after splitting.
- The v3 training index has 51,173 real crops from 2,349 tracks (742 hand-checked, 1,607 pseudo-labelled), plus 3,150 `none` crops.
- `labels/*.json` holds every hand-checked track with its file seconds and frame position.

12. **Corner reader (2026-11-25),** scratch in `/private/tmp/claude-501/ofc-vision4/` (scan/ links to ofc-vision2's
    scans). Run from `work/`:
    - `corner/build_corner_idx.py` writes `../corner-whole.json`;
    - `corner/cvclean.py` cleans it into `../corner-cv.json` (keep list: `labels/n1532-jumbo-corner-keep.json`);
    - `corner/train_corner.py --hands A,B --keep KEEP --synth 0.35 --out OUT` trains in about 5 min on MPS;
    - `corner/eval_corner.py MODEL HAND SIM` gives the cross-hand table;
    - `eye/sim2.py TAG SESS corner=MODEL.onnx` simulates;
    - `corner/stripnames.py`, `corner/slotcorner.py`, `corner/cdiag.py` and `corner/szany.py` are the check sheets.
13. **Traced misses and fresh truth (2026-11-25, later),** scratch in `/private/tmp/claude-501/ofc-vision5/`:
    - `eye/slottrace.py SESS T0 T1 X Y ['{params}'] [START]` prints a slot's life at a spot, keyframe by keyframe;
    - `eye/hidstrip.py DIFF SESS OUT` filmstrips every changed slot of a `namediff.py` output, and
      `eye/namecover.py OLD NEW DIFF` says whether a lost name is still on another object of the same card;
    - fresh truth: `eye/render_truth.py`, then `eye/zsheet.py` / `avgz.py` / `regz.py` (region zoom with ids, `cw` / `ccw` for
      sideways columns) / `firstz.py` (first-view sheets for fans); `eye/score.py SIM... --truth eval/fresh-truth`;
    - `corner/bindcheck.py SIM CORNER NAME...` measures fan-strip binding; `corner/train_corner.py --rankw --posw --morefonts`
      trains corner6.

## Taken from gigarepo (servers/poker-os)

- `scripts/learned_card_vision.py`:
  - `card_quad`, `rectify` and `rotated_nms` are copied unchanged.
  - The LearnedCardReader flow (detect → rectify → classify both orientations → accept → one copy per identity) became `OfcCardReader`. It reads raw frames through a fixed table crop instead of the normalized felt, and adds the both-orientations-agree check.
  - The hand-cover rule was left out.
- `scripts/learned_cards/fast_card_model.py` (CardNetFast) is copied unchanged.
- `scripts/learned_cards/train_classifier.py` became a much smaller `train_cls.py`:
  - real crops only, no synthetic deck renders;
  - sqrt class balancing;
  - affine, photometric and blur jitter, plus random 180° turns.
- `config/card-designs/ept-faceup-v5/body.onnx` provides the detector, with weights unchanged and stored as fp16. `ept-faceup-v5/full-face.onnx` was used only as the zero-shot seed and is not shipped.
- The detector, letterbox and output layout follow the profile JSON format, trimmed down.
