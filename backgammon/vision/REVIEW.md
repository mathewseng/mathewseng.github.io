# Office-3 replay review

The review examined the rendered footage around detector dropouts, checker
moves, dice pickups, and cube exchanges in all five games. A frame-by-frame
check of the display intervals covers the full 113,235-frame session.

| Game | What was visible in the previous edit | Correction |
| --- | --- | --- |
| 1 | White’s 3–1 disappeared around 0:50. The dice stayed on the table until about 1:01. White’s take at 3:01 was visible for 1.8 seconds. | Carry the roll to pickup. Hold the take for at least two seconds. |
| 2 | Black’s 3–2 repeatedly switched to “Between rolls” around 0:49 and 1:00. A die shifted on the board, while the other die stayed in place. | Join all four detections into one physical roll from about 0:42.6 to 1:37.7. The checker loss still posts at 1:32.6, and the pass still ends the game at 4:23. |
| 3 | Black’s 4–3 vanished around 0:29 even while both dice were visible. Black’s take at 14:14 disappeared before two seconds had elapsed. | Keep 4–3 visible between detections. Display the take through 14:16.6. |
| 4 | Around 7:39, White rolled after a pause with the cube available. At 7:20, Black’s next roll overlapped White’s take. Near 7:49, Black rolled within a second of White’s completed move. | Show the no-double decision. Keep the incoming roll at the top and the completed move independently timed below it. |
| 5 | Around 1:13, Black’s 6–4 briefly disappeared under a hand. The old title also hid known dice when a reliable board for evaluating moves was unavailable. | Keep 6–4 visible through the occlusion and show known dice independently of the move table. The first review left the cube response open. |

The opening cue stays visible until the first supported roll. The equity panel
drops the status label. Cube decisions show EV and EV loss in separate columns.
The offer and reply tables each use the perspective of the person choosing.
The earlier edit used a two-second wait before showing the no-double cue.
The current edit scores every supported cube opportunity, including immediate rolls. A recent
action stays readable for two seconds even when another action begins.
The browser controls can be hidden without moving playback, so a paused frame
shows the bottom of the equity and action panels.

The rail-side die around 0:55 in Game 1 is too blurry for an independent
visual reading. The replay labels the 3–1 as inferred from the checker move.
Some dice faces and moves remain unresolved in the footage. The Analysis view
keeps known faces visible and marks an unresolved face with `?`. The Vision
view still shows the original frame-level detections for auditing.


## Reconstruction and scoring review

Seven checker plays now have repeated source-frame support for the board before
and after the move, a legal resulting position, and an independently observed
next roller. The recovery uses the first repeated sight of the resulting board
as its timestamp. Game 2’s 6–1 at 0:29 fills the missing turn. With the duplicate
3–2 detections grouped into one roll, its Library export replays from the opening
through Black’s cube pass as a single game.

Checker and position analysis uses the recipient’s cube ownership following the
confirmed takes in Games 1, 3, and 4. Every candidate was scored at four ply in
the same cube context as the played move. Scores use the current cube as their
unit. An unknown owner uses cubeless evaluation. The Game 5 response is documented in the ending review below.

The public state index, Library replay, and video use the same roll intervals
and cumulative loss ledger. Verification checks every frame’s state and checks
the Library analysis totals against the scored replay.

## Opening and overlay review

- Game 3’s opening toss is visible from about 0:03.4. The settled board at
  0:07.0 uniquely identifies White’s 6–1 and `8/7 13/7` from the standard
  opening arrangement. The video uses that later evidence to annotate the
  toss at its original time.
- Black’s 4–3 in Game 3 is one physical roll from about 0:08.3 to 0:40.6.
  The checker and cube options use the board before the first checker moved.
  The board at about 0:40.7 confirms `13/10 24/20`. The earlier 0:25
  detector update is part of that same turn.
- Game 2’s final cube decision marks Pass as played and Take as best.
  Every scored cube opportunity shows both actions and their EV loss.
- The video and review show separate Checker EVL and Cube EVL
  columns and share a green-to-red scale. The review uses the table’s
  cream, slate blue, ivory and charcoal palette with contrasting blue dice.


## Full replay review

| Where | What the video showed | Correction |
| --- | --- | --- |
| Game 1, 9:54.60 | Live checker badges and a 95.6% Black win estimate stayed on screen during the reset. | End play when White starts regrouping the checkers. The outcome remains unresolved. |
| Game 2, 2:50.56 and 3:34 | A rank-12 move was absent from the ranking, and a completed move appeared only at the foot of a panel titled “Between rolls.” | Keep the top five. Show the actual move and its rank separately, and feature its comparison with the best move when a new decision has yet to start. |
| Game 3, 0:03.44 and 0:25 | Equity was blank during the opening roll and shifted mid-play while the move table stayed put. | Use the estimated equity after best play from the frozen decision. Switch to the scored actual move when its result is confirmed. |
| Game 3, 21:22.52, and Game 4, 21:32.00 | The dice or checker counts stayed active while checkers moved backward into the next setup. | End both games at the visible resets. The footage supports the stop, while the outcomes remain unresolved. |
| Game 5, 12:57 | The replay kept asking Black to respond while Black removed White's checkers. The 4 cube stayed on the playing surface. | Infer a pass at the first clear pack-up, award the pre-offer stake of 2 to White, and apply the 0.361 response loss to Black. Report the inference in video, frame data and history. |
| Game 5, 15:29–end | The board image went black while the overlays continued. | Label the unavailable camera feed and keep final scores visible on the original timeline. |

All five replays use pips for the current roll and label equity carried from
the last scored position. The end card shows only the two cumulative EV-loss
columns. The playable history row for a move outside the top five previews
the actual move and its resulting probabilities.

Game 5 still has an unscored stretch from about 2:09 to 5:30. The recorded
board changes across that interval, but the footage and detector records did
not establish consecutive rolls and complete legal turns there.


## Reports and model review

| Where | Reviewed evidence | Replay change |
| --- | --- | --- |
| Game 3, 11:15–11:30 | Black's 1–1 stayed on the board. One die shifted while Black handled checkers. | Join the split into one roll and keep the original options visible. |
| Game 3, 18:04 | A sixth checker was counted on White's first point and also detected in the middle of the board. The tray corroborates two White checkers off. | Recover the checker inventory and show Black's 4–3 options from the fixed board. |
| Game 3, 19:31–20:16 | The reports found a stationary pair during the apparent gap. Black’s 4–3 remained on the table until pickup at 20:12. White rolled on the other half immediately afterward. | Keep Black’s roll through pickup. Index White’s next roll with one readable 2 and one unresolved face. |
| Game 3, 20:52 | Black's checker on point 7 is supported before the occlusion. The next board confirms two White bear-offs. | Keep the checker count, show reconstructed markers in Vision, and preserve the legal 6–1 result. |
| Game 4, 1:38 | Black's settled dice show 6–4. The old 3–1 grade was tied to a different move. | Show 6–4 and remove the unsupported checker loss. |
| Game 4, 16:39 and 16:47 | Black rolled twice from the bar between distinct White rolls. Neither Black roll changed the board. | Show both fans. The second die of the later roll is unreadable. |
| Game 5, 8:14 | The reports found White’s 4–1 before the checker left the bar. Repeated frames before and after play support a single legal result, `bar/21 8/7`. | Start the roll when the dice settle and analyze from the pre-roll board. |

316 distinct source frames were inspected. The 175 dice crops produced 90
training labels and 31 held-out labels. The 141 checker crops produced 104
training labels and 36 held-out labels. There were 55 ambiguous samples.

| Reviewed target | Existing reader | Fine-tuned reader |
| --- | ---: | ---: |
| Dice face | 16/31 | 19/31 |
| Checker color and point count | 35/36 | 35/36 |

These are patch-level results on a hard-case sample. Multiple frames can show
the same physical dice or stacked checkers, and the old model's original
training split differed. The fine-tuned dice reader improved this test overall
and regressed on some clips, so the published state uses the calibrated
baseline with revised temporal inference. Game reports list remaining pickup
and turn-order flags with links to seek the footage.

Compared with the earlier replay, 117 complete rolls became 121, unknown
faces fell from 31 to 26, and consecutive same-player flags fell from 46 to
40. The reports' stationary-pair check found no remaining unindexed pair with
enough raw detector support to meet its threshold. These checks cannot rule
out additional missed rolls. All 86 graded checker plays reproduce a legal
result for the reconstructed board and dice.

Both candidate networks were also exercised through the existing camera
reader. Across 50 frames of each reviewed roll, the fine-tuned reader matched
95 of 100 dice-face observations for Game 5’s 4–1 versus 91 for the current
reader. On Game 4’s 6–4, it made 18 accepted misreads where the current reader
made zero. These spots helped decide which weights to use for the release.


## Turn-order audit and die body color

The prior report flagged 40 adjacent same-player rolls. Contact sheets
and closer source-frame review identified three patterns. Brief rolls
were absent between indexed turns, stationary dice were counted again
after a detector gap, and dark dice on the left were attributed to White.
The maintained replay adds 14 visible rolls, joins six duplicate reports,
and reassigns three physical rolls in Game 4. The turn-order flags fell
from 40 to 16. Both faces are known for 124 of 153 indexed rolls. There
are 32 unknown faces, up from 26 as short rolls with unreadable faces
became visible in the timeline.

Game 1's missed exchanges include White's short rolls from the bar
around 7:11, 7:17 and 7:24. Game 3 now keeps the same original decision
across the stationary dice at 4:22 and 15:51. In Game 4, Black throws
dark dice onto the left around 8:52 and 17:41, and the two detections at
19:23 and 19:30 correspond to one of Black's rolls. The earlier Game 4
5–1 is corrected to 6–1. All 86 previously scored results, EV losses and
result timestamps are preserved. The two newly scored fans are legal
no-move results and contribute zero checker EV loss.

A source clip holdout tested physical die color. Of 175 crops with new
body-color annotations, 170 were readable and 42 belonged to test clips.
The previous brightness cutoff classified 25/42. The trained body reader
classified 42/42. It produced a corroborated color on 585/599 archived
stationary tracks. Rebuilding the observation layer kept all 108 paired
candidate intervals and changed actor attribution on four candidate
reports. All four correspond to three reviewed Black rolls in Game 4.
The observation model requires agreement from both dice. The published
timeline uses the reviewed throws, pickups and rules checks to verify
those corrections.
