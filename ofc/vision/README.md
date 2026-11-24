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
- Cards are about 50x75 px. Pips are readable, and court ranks are told apart by their artwork more than by the tiny index.

## Runtime

```sh
python3 ofc/vision/ofc_card_vision.py frame.jpg --overlay out.jpg      # JSON of every body + its card or null
python3 ofc/vision/ofc_card_vision.py video.mp4 --start 60 --end 120 --jsonl reads.jsonl   # keyframes (0.64 s), hand state
```

In video mode each line has `cards` (every box: `card` = this view's read, `handCard` = the name to report,
`source` = `view` | `carried`) and `covered` (cards named earlier that are now hidden under others and no longer boxed).
Start a run at the beginning of a hand: names are carried from views seen earlier in that hand.

Needs `onnxruntime`, `opencv-python` and `numpy`, plus `av` for video. `profile.json` pins both models by SHA-256.

| Stage | Model | Input | Output |
| --- | --- | --- | --- |
| Card body | `models/card-body.onnx`, YOLO11n-OBB, one class | table crop `frameCrop` = x 130, y 190, 1781x835, area-resized by 0.575 into 1024x480 (grey 114 pad) | (6, N): cx, cy, w, h, conf, angle (rad); conf ≥ 0.25, rotated NMS 0.5 |
| Identity | `models/card-identity.onnx`, CardNetFast (0.38 M params) | each body rectified to 64x96 BGR, 10 % margin | 52 suit-first codes (`SA`…`DK`) + `none` |

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

### Strip reader (not shipped)

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

**Dataset sizes:**

- 74,212 body crops over 7 sessions; 3,775 tracks after splitting.
- The v3 training index has 51,173 real crops from 2,349 tracks (742 hand-checked, 1,607 pseudo-labelled), plus 3,150 `none` crops.
- `labels/*.json` holds every hand-checked track with its file seconds and frame position.

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
