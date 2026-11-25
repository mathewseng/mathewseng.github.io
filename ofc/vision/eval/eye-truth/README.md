# Eye-checked hand-end truth (held-out s1836, s0023, n1501, n1532)

One keyframe per hand: the busiest keyframe in the 20 s before the table is cleared (`scripts/eye/ends.py`).
s1836 1251 s was dropped as a repeat of 1244 s, leaving 16 + 3 frames.

`objects/NAME.json` lists every object the runtime had at that keyframe with the v3 classifier and the old hand state:
hand-state slots (boxed, or hidden under other cards) and weak boxes (detector 0.1–0.25). Ids are sorted by row.

`labels/NAME.txt` was written by eye, without model names, from 4x upright crops at the frame and at the slot's
clearest earlier view, plus multi-frame averages and filmstrips for doubtful spots (`scripts/eye/`):

- `XX` card code (suit first: `SA`, `HT`, …) seen on the pixels;
- `dup:N` a second object on the same physical card as object N;
- `X` not a card on the table (empty felt, the deck, a card in a hand, the player's lap);
- `?` a card is there but its own face is not legible in any view (fanned strips, ~7 px indices);
  `?~` the same, with what little shows noted;
- `C?` covered at this frame; named from an earlier view; its presence under the pile cannot be checked (not scored);
- `missed:` cards with no object at all (`none`, a count with `?`, or names); `?` = not countable (cards being sorted).

`scripts/eye/score.py SIM_s1836 SIM_s0023 --detail` scores `scripts/sim.py` output against it.

## Additions (2026-11-24 evening)

- **New sessions** (never trained on; `scripts/eye/src.py` names the files):
  - `n1501`: 15:01–15:31 EST, 3 frames;
  - `n1532`: clips 0–77 from 15:31:55 EST, 3 frames, two of them with the jumbo-index deck.
- Objects come from the baseline runtime at each frame, as before. They were labelled from `zsheet.py` 5x tiles and
  `avgz.py` 8x averages, with `ovz.py` id maps for fans.
- An object in a fan is the card it held when its slot was first boxed whole (its earliest view).
- **Added objects**, marked `# added`: cards the `stillKeep` runtime names that had no object here. These are the 3
  former `missed:` cards in s1836 501/959 s, `C?` cards under fans, the n1501 946 s Q♠ and 5♥, and the n1532 4544 s
  Q♠/A♠ on the discards. Each was checked on a filmstrip (`checkx.py`).
- **Relabel:** s0023 533 s object 4 `?` → `HK`, read from the index and pip on a 6x average.
- `missed:` lines were updated to match. A leading number is what `score.py` counts.
