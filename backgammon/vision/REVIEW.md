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

## Stationary dice and legal results

| Game and time | Source evidence | Replay change |
| --- | --- | --- |
| Game 1, 2:27 and 6:54 | One face is visible for each roll. Verified checker endpoints uniquely determine the other face. | White’s 6–1 and Black’s 5–1 keep their original roll intervals and receive checker analysis. |
| Game 1, 7:02, 7:26 and 9:31 | Repeated original-camera crops show both faces. The 7:02 sequence also shows Black hitting a blot. | Show Black’s 3–1, 3–1 and 4–3. Charge checker EVL only where the final board is verified. |
| Game 3, 7:51 | The bar entry and transfer from 13 to 7 fit 6–2 or double twos. 13 clear views support 6–2. | Keep the original starting board and render 6–2 and the graded legal play. |
| Game 4, 10:39 and 13:25 | Original-camera crops show both dice and the checker remains on the bar after pickup. | Black fans on 6–3 and White fans on 3–2. Both have zero checker EVL. |

On six previously scored rolls with multiple legal dice pairs, face pooling
alone matched four rolls. The confidence-gated legal comparison matched three
and abstained on three, with zero wrong assignments. These controls assess the
fallback on stationary dice with a verified result. At Game 3 20:13 the board
and bear-off are confirmed, and the second die remains unresolved.

The checker trial added 314 clear training crops and 95 held-out crops from
manually verified positions. Both readers got 92 of the 95 new crops correct.
The dice trial trained on 638 frames across 91 tracks, including eight new
hand-labeled tracks. The candidate improved from 16 to 21 correct on 31 test
tracks and dropped from 8 to 5 correct on 10 separately reviewed faces.
Both read the four newly held-out faces correctly. Replay inference keeps the
current reader weights. Reports record both trials.

## Roll timing and frozen starting positions

| Game and time | Footage and replay correction |
| --- | --- |
| Game 3, 0:42.92–1:29.36 | The previous 1:14 marker was a late read of the same dice. White's 4–3 now starts before either checker moves. The frozen board and resulting two hits verify `8/5 5/1`. A hand leaves one die covered near 1:29. The roll persists until both locations visibly clear. |
| Game 1, 7:26.64 | Black's 3–1 bears off one checker and advances another to the one-point. Black's off count increases from three to four. The verified checker counts carry through White's fan and establish Black's starting board for the following 4–1. |
| Game 5, 0:25.44–2:08.52 | White's completed opening move establishes Black's starting position for 6–4. A clear board before pickup verifies `24/20 20/14` and the replay tracks the 0.045 checker EVL. White's later demonstrations during the pause remain outside the roll. |

Matching pixels at both stationary dice locations and comparing them with the
empty board recovered onset and pickup within the reviewed windows on four
checks. An occlusion-only window in Game 3 produced no pickup. The time change
in Game 3 is linked from Reports. The other checks leave the replay intervals
as reviewed.

## Checker equity and the next three turns

| Game and time | Footage and replay correction |
| --- | --- |
| Game 1, 7:14 and 7:19 | Black bears two checkers off on 3–1, then plays 6/3 and bears another off on 6–3. The confirmed boards put White on the bar through both turns. |
| Game 1, 7:33 | White's fan retains Black's newly verified four checkers off. The displayed equity now comes from that board and matches the prior completed move. A checker fan has its own wording in the decision panel. |
| Game 3, 1:35.40 | The old overlay first showed 6–? at 1:45 and dropped the roll while both dice were still on the table. The confirmed transfers `6/1 24/18` and the visible six establish 6–5. The roll stays visible to pickup at 2:12.08. |
| Game 3, 2:13.48 | Both dark dice clearly read 4–2. The observed checker arrangement conflicts with the legal results for the verified starting board. The replay shows the roll and leaves its checker loss ungraded. |
| Game 3, 2:35.28 | White rolls 2–1 and hits the blot on 15. The dice locations clear at 2:41.12, before the later camera frame confirms the hit. The roll and the played-move cue use their own times. |

Every referenced position with a known roller now receives its own equity
evaluation. Reports count the frames with reconstructed boards that have an
equity result. The stationary-dice check now covers seven reviewed intervals
and still abstains during the hand occlusion.

## Late bear-offs and checker action timing

- Game 3 at 20:13 shows White's 6–2. Re-centering the partly missed die and
  pooling ten views distinguished six from five. Both completed checker
  boards are recorded in the game history.
- At 21:00, the board confirms both checkers off the 3-point. At 21:13,
  White has one off from each of the first two points, reaching nine off.
  Some dice pairs produce the same positions, so both rolls retain an
  unresolved face. The completed move appears before the reset.
- At 2:41, White has picked up the dice and is still moving a checker.
  The panel shows who is finishing the move. Black's pre-roll cube cue
  begins after the camera confirms the hit at 2:43.72.

The fixed-weight blend matched the current reader on 22 newly labeled clear
faces from clips outside the earlier training and validation samples. The
fine-tuned reader matched 18. These clear samples test how reliably each
reader preserves dice values once the die location is available.

## Dice pickups and confirmed checker handoffs

| Where | Camera review and replay correction |
| --- | --- |
| Game 1, 4:19–4:21 | White picks up 6–1 at 4:19.44. Black's double sixes settle at 4:20.72, more than two seconds before the earlier replay marker. The confirmed result of White's move supplies Black's starting board. |
| Game 1, 7:53–8:07 | The visible three and `bar/20 17/14` confirm White's 5–3 at 7:53.32. Black rolls 5–3 and fans with both entry points closed. White next rolls double twos and advances the same checker from 20 to 12. The four legal steps are preserved in history. |
| Game 2, 2:09–2:30 | Black's dice clear at 2:09.32 and the board confirms the move before White's dice settle at 2:09.88. The visible four and the completed `13/9 13/8` verify White's 5–4 for analysis. |
| Game 5, 11:31 and 11:38 | Both dice locations clear after each pickup, including the dark die beside a stack. The checked openings and endings of the rolls use separate evidence. |

The timing checks match the visible dice and the empty board at both die
locations. Timing corrections preserve existing graded decisions. A revised
result timestamp requires a matching checker board in a specific camera frame.

A second held-out sample includes blurred dice and faces missed by the
detector. The current reader matched 13 of 15 manually labeled faces.
The fine-tuned reader and the equal blend each matched 12. The replay
continues to use the current reader.

## Continuous rolls and late checker transitions

| Where | What the replay now shows |
| --- | --- |
| Game 1, 8:08–9:38 | Black fans, White plays 5–1, and Black enters on 6–1. The later close-up review below corrects the position at 8:46 and the subsequent starting boards. |
| Game 3, 5:05–5:08 | Black picks up 5–3 at 5:05.96. White’s 5–2 settles at 5:07.16, 7.20 seconds ahead of the old marker, using the confirmed board after Black’s hit. |
| Game 3, 6:41 and 15:56 | Both dice remain in their original locations after the old overlay ended. Each roll stays visible until both locations clear. |
| Game 3, 16:29 | White picks up the two dice separately. The footage then shows an extended discussion with the same checker arrangement through the next throw. |
| Game 4, 4:18–4:20 and 13:08 | Both white dice clear before the next roll. The first Black roll is visible earlier and starts from the completed White position. |
| Game 4, 17:10–17:15 | White’s 6–1 survives an arm occlusion and bears off one checker from point 4 and one from point 1, leaving seven off. |

The new checker trial used 619 point crops from reviewed boards for training
and scored 192 of 200 on separate reviewed clips. The current reader scored
191. The new dice trial used 704 source images from 106 stationary tracks. It
scored 23 of 31 on the general test set, compared with 16 for the current
reader. It scored 5 of 10 and 36 of 41 on the reviewed sets, compared with 8
and 39. The replay continues to use the current readers.

## Checker handoffs and final bear-offs

| Where | Camera evidence and replay correction |
| --- | --- |
| Game 1, 3:04.72 | The original camera shows three and five. The dice shift during an extended discussion and the same faces stay visible. The verified final position confirms Black’s play. |
| Game 1, 6:46–7:26 | White’s 2–1 plays two checkers from the 6-point. The next three fans preserve their respective starting boards through pickup. The final fan in this sequence reads 5–1. |
| Game 1, 8:46 | A close view shows both the move from point 8 to point 2 and the transfer from point 5 to point 2. These account for nine pips with 6–3. The replay grades the move and rebuilds the following starting boards. |
| Game 1, 9:38–9:49 | Black’s 5–3 advances the rear checker and bears one off. White bears two off on 2–1. Black’s double sixes brings Black to eleven off. The replay marks the reset at 9:49.56 after both dice are collected. |
| Game 3, 15:30–15:35 | White’s 6–2 advances two checkers from point 7. Black’s dice settle at 15:35.08, 6.04 seconds before the earlier marker. The verified White result supplies Black’s starting board. |
| Game 4, 14:40–14:50 | The same dice remain visible throughout twenty pips of White checker movement. Both original faces and the verified result identify double fives and the four steps `7/2 20/15 15/10 10/5`. |

Reports lists unknown faces on confirmed fans, faces with independently
verified checker results, and faces where the result remains unconfirmed.
The latest checker candidate used 863 reviewed training crops and scored
473 of 486 on the separate reviewed clips, compared with 475 for the current
reader. The dice candidate used 747 source images from 116 tracks and scored
23 of 31 on the general test. It scored 6 of 10 and 37 of 41 on the reviewed
sets. The current dice reader scored 16, 8, and 39 on the same sets.

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

In Game 5, Black picks up around 2:08. White moves checkers back and forth
during the pause around 3:12–3:21 with no settled dice in view. The next
verified roll is White’s 6–6 at 5:01. The starting checker position for
Black’s earlier 6–4 is established from White’s opening move.


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

## Second turn-order review

The next pass reviewed all 16 remaining turn-order flags. It recovered
11 visible throws across Games 1, 3, 4, and 5 and merged duplicate
detections. At 6:37 in Game 1, two clear checker positions establish
Black’s 6–5 despite a detector read of four. Game 4’s Black 3–2 stays on the table from 18:06 through
21:29. The review compared the board before the throw with the board
after pickup. It kept Black’s final 13/11 11/8 and removed the earlier
0.015 checker EV loss charged for an intermediate arrangement. A brief
Black roll at 13:01 is now shown before White’s throw. Source footage
also confirms that White physically throws twice in succession around
16:35. The Reports tab records this separately. One turn-order flag at
16:28 remains open.

Game 5’s opening consists of individual tosses. White wins the decisive
6–5 and plays 24/13, leaving six checkers on point 13. At 5:01, moving two
checkers from 13 to 1 and hitting Black establishes double six. Entering
from the bar to 20 and moving 6/2 establishes 5–4 at 7:51. Later, 14/9
and 6/5 establish 5–1 at 11:12. The original vision reads alone did not
support those results. Each manually checked board links to its camera
clip and frame in the pipeline notes. A roll stays incomplete when the
visible faces and legal outcomes cannot identify both dice.

A second face model used 608 nearby frames from 83 labeled dice tracks. It matched 20/31 held-out tracks, compared with 16/31
for the original classifier. On five separately reviewed game rolls,
pooling nearby frames improved the original model from 6/10 to 8/10
correct faces. The candidate matched 5/10 there. The replay retains the
original face classifier and uses the source-reviewed board evidence to
resolve those game states. The sampled checks give evidence about these
specific frames and turns.


## Verified checker results with incomplete dice

The next pass compared the checker inventory before and after six
additional throws in Games 3 and 4. Game 3 has double fives at
15:14 and 16:21. The second turn leaves six White checkers on point 1
and two off. White's two transfers at 0:51 in Game 4 require 5–4.
At 5:37 the same 6–4 remains on the board while White tries checker
arrangements, until pickup near 5:49.

Game 3 has two confirmed results whose dice are still ambiguous.
At 7:51 the same board can follow either 6–2 or 2–2. At 20:13 it can
follow either 5–2 or 6–2 because the higher die can bear the checker off.
Game history now opens both verified boards. A two-second cue marks each
confirmed result in the video. The replay keeps the
unknown face visible. Checker EV loss is reserved for graded decisions.
At 20:16 the verified six-checker stack becomes the starting position
for Black’s next roll. Checker movements in that turn include
demonstration placements, and the final board fails the legal-result check.

The final turn-order flag came from another sequence of consecutive
White throws in Game 4 at 16:28. The wide recording shows the discussion
between them. Black's cup stayed on the felt for all 1,542 original
frames in the interval, and the next visible throw belonged to White.
The report records both confirmed same-player transitions separately.
All 97 graded plays are legal for their reconstructed boards and dice.
Both dice are known for 133 of 159 indexed rolls, with 29 unresolved
faces across the session.

## Original-camera comparison

| Game and time | Verified roll | Replay result |
| --- | --- | --- |
| Game 1, 4:34 and 7:35 | Black 6–5 and 5–1 | The first turn moves two checkers from the same point. The second bears off two. Both agree with the next starting board. |
| Game 3, 2:13 | Black 5–2 | The checkers confirm bar/23 13/8. The recorded move loses 0.048 equity. |
| Game 3, 10:40 and 11:15 | Black 4–2 and 1–1 | The first turn enters from the bar. The second leaves a White checker on the bar. Both results now have checker analysis. |
| Game 3, 20:17 | Black 5–3 | The original shows the dice throughout the demonstrated moves. The overlay carries them to 20:31.80. The ending board remains available, and the disagreement carries no checker loss. |
| Game 4, 17:05 and Game 5, 8:07 | Black 6–5 and 3–1 | Game 4 enters both Black checkers from the bar. Game 5 hits White and leaves two Black checkers on fixed point 20. |

The Reports tab records the source-verified starting and ending board times
for each comparison. The replay has 138 graded plays and 152 complete
rolls of 159. Six faces remain unknown on confirmed fans. Two remain
unknown on turns with verified checker results. Twelve other checker
plays remain unconfirmed, along with the 5–3 disagreement in Game 3.

The dice trial trained on 789 frames from 122 labeled tracks. It read all
10 new test faces correctly, compared with 8 for the current reader. It
matched 23 of 31 general test tracks, compared with 16, and read 5 of 10
original reviewed faces, compared with 8. The checker trial added 1,058
training crops and matched 643 of the 654 held-out crops from reviewed
boards, the same total as the current reader. The shipped replay uses
the existing weights. The new labels and both trials are available for
the next validation pass.

The gated detector read 97 of 247 sampled face views correctly with the
candidate and 72 with the current reader. Wrong reads fell from 20 to 6.
These views come from the same held-out dice as the new track test, so
a full-session precision and turn-order comparison remains open.
