# Office-3 replay review

The review examined the rendered footage around detector dropouts, checker
moves, dice pickups, and cube exchanges in all five games. A frame-by-frame
check of the display intervals covers the full 113,235-frame session.

| Game | What was visible in the previous edit | Correction |
| --- | --- | --- |
| 1 | White’s 3–1 disappeared around 0:50. The dice stayed on the table until about 1:01. White’s take at 3:01 was visible for 1.8 seconds. | Carry the roll to pickup. Hold the take for at least two seconds. |
| 2 | Black’s 3–2 repeatedly switched to “Between rolls” around 0:49 and 1:00. A die shifted on the board, while the other die stayed in place. | Join all four detections into one physical roll from about 0:42.6 to 1:37.7. The checker loss still posts at 1:32.6, and the pass still ends the game at 4:23. |
| 3 | Black’s 4–3 vanished around 0:29 even while both dice were visible. Black’s take at 14:14 disappeared before two seconds had elapsed. | Keep 4–3 visible between detections. Display the take through 14:16.6. |
| 4 | Around 7:39, White rolled after a pause with the cube available. At 7:20, Black’s next roll overlapped White’s take. Near 7:49, Black rolled within a second of White’s completed move. | Show the no-double after the eligible wait. Keep the incoming roll at the top and the completed move independently timed below it. |
| 5 | Around 1:13, Black’s 6–4 briefly disappeared under a hand. The old title also hid known dice when a reliable board for evaluating moves was unavailable. | Keep 6–4 visible through the occlusion and show known dice independently of the move table. The cube response stays unconfirmed where the footage does not establish it. |

The opening cue stays visible until the first supported roll. The equity panel
drops the status label. Cube decisions show EV and EV loss in separate columns.
The offer and reply tables each use the perspective of the person choosing.
The no-double cue requires a legal cube decision after a confirmed pickup and
a wait exceeding two seconds. Brief waits skip the full cube table. A recent
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
unit. An unknown owner uses cubeless evaluation. The Game 5 cube response is
still unresolved.

The public state index, Library replay, and video use the same roll intervals
and cumulative loss ledger. Verification checks every frame’s state and checks
the Library analysis totals against the scored replay.
