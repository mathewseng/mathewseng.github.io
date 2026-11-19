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
- The video and review show separate Checker EV Loss and Cube EV Loss
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
