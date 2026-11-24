# Eye-checked hand-end truth (held-out s1836 and s0023)

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
