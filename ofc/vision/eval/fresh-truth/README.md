# Fresh eye truth (2026-11-25)

Five hand ends that were never used for training or for choosing a threshold (two from round 5, three added in round 6). Every earlier threshold was checked on
`eval/eye-truth`; these frames show whether the rules hold on hands nobody looked at while building them. (Each
candidate rule of 2026-11-25 was scored here too, and all of them scored the same, so no choice depended on them.) Format and labelling
rules are the same as `eval/eye-truth/README.md`. Objects come from the shipped runtime of 0cc8bcba at each keyframe.

| Frame | Clock (EST) | Deck | Players | Objects | Legible |
| --- | --- | --- | --- | --- | --- |
| `n1501-1309` (1309.2 s) | 15:23:05 | classic (red/blue) | 2 | 36 | 26 |
| `n1532-4197` (4197.4 s) | 16:41:52 | classic | 3 (right player in sideways columns) | 38 | 25 |
| `n1501-0707` (707.0 s, round 6) | 15:12:43 | classic (red/blue) | 2 | 32 | 28 |
| `n1501-1470` (1469.7 s, round 6) | 15:25:46 | classic (red/blue) | 2 | 33 | 25 |
| `n1532-4361` (4361.2 s, round 6) | 16:44:36 | classic | 3 (right player in sideways columns) | 40 | 27 |

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

Round 6 (2026-11-25):

- `n1501-1309` object 34 is now `H7`, not `?~`. Its first-view sheet showed the slot created at 1263 s, when the J♥ already
  lay on it. The same card was whole at 1245–1259 s (7 pips, one upper centre pip, index 7) under an earlier slot 7 px
  away. The J♥ laid at 1262 s turned it about 10° without lifting it, and the 7-pip layout stays visible to the frame.
- The three new frames were chosen from hand ends never labelled before. Their objects come from the shipped runtime
  of b4d85aea. They were labelled the same way: 5x tiles, first-view tiles (`firstz.py` at 1.5x the box), 8x 2 s
  averages, region zooms (the right column turned upright), and the court reference sheets, with no model names.
- Then every disagreement was zoomed. Four first-pass labels changed, each in the runtime's favour:
  - `n1501-1470` 6 is H8, not H7 (pip slip; two centre pips).
  - `n1501-1470` 26 is DJ, not `?` (ref-J art).
  - `n1501-0707` 27 is H3, not `?` (centre 8 px inside the 3♥).
  - `n1532-4361` 33 is C6, not `?` (centre 14 px inside the 6♣ strip).
- `n1532-0689` (15:43:24 EST) was started but not used: the bottom player's Fantasyland fan is mostly never-whole strips.
