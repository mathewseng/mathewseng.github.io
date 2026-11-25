# Fresh eye truth (2026-11-25)

Two hand ends that were never used for training or for choosing a threshold. Every earlier threshold was checked on
`eval/eye-truth`; these frames show whether the rules hold on hands nobody looked at while building them. (Each
candidate rule of 2026-11-25 was scored here too, and all of them scored the same, so no choice depended on them.) Format and labelling
rules are the same as `eval/eye-truth/README.md`. Objects come from the shipped runtime of 0cc8bcba at each keyframe.

| Frame | Clock (EST) | Deck | Players | Objects | Legible |
| --- | --- | --- | --- | --- | --- |
| `n1501-1309` (1309.2 s) | 15:23:05 | classic (red/blue) | 2 | 36 | 26 |
| `n1532-4197` (4197.4 s) | 16:41:52 | classic | 3 (right player in sideways columns) | 38 | 25 |

Labelling:

- labels were read from 5x tiles (`zsheet.py`), 8x 2 s averages (`avgz.py`) and region zooms with object ids
  (`regz.py`, right-player columns turned upright), with no model names shown; courts were matched against the
  reference sheets (`ref-Q`, `ref-K`, `ref-J`);
- fans were bound to objects on first-view sheets (`firstz.py`: the spot when the slot was first boxed, +2 s, +5 s and
  at the frame): an object is the card it held when first boxed whole;
- a box that was never whole and whose centre lies within about 6 px of a strip boundary, spanning two cards, is `?`;
- then every disagreement with the runtime was zoomed. Two first-pass labels were pip slips and were corrected:
  `n1501-1309` 13 is H8 (8 pips, first read H7) and 30 is H6 (laid already fanned at 1231 s; the visible pip column
  sits 10 px from the card's left edge, so it is a side column, not a 3's centre column).

`scripts/eye/score.py SIM... --truth eval/fresh-truth` scores a sim against it.
