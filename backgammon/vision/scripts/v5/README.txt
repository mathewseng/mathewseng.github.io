Office-3 backgammon, orange board (Nov 21, 2026 session)

This pipeline reconstructs every turn from the Office-3 wide camera for the
orange wooden board, scores it with the site's GNUbg engine at four ply, and
renders one analysis video per game. It is independent of the v2-v4 scripts,
which were tuned to the blue board of Nov 17.

    BG_RECORDING_DIR  ~/Downloads/office-3-wide-20261121-190110-3o988aae
                      (57 one-minute wide clips and wide-with-board-audio.mp4)
    BG_WORK_DIR       ~/Downloads/office-3-backgammon-20261121
                      (rectified board video, observations, models, analysis)

Board geometry

  The case is tracked with SIFT features against one reference frame
  (ref/reference.json: four outer case corners fitted to the felt edges) and
  rectified to 800x590 (board_track.py). White's home board is top-right and
  White bears off into the top-right tray. Point x positions, strips and trays
  are in geometry.py, in White's numbering.

Steps

    python3 rectify_all.py --jobs 5          rect/clip-NNN.mp4 + tracking logs
    python3 stillness.py 0 1 ... 56          per-frame board motion
    python3 train_slots.py MODEL LABELS...   slot classifier (empty/white/black/occluded)
    python3 observe.py MODEL obs-dir 0..56   checker readings every 5th frame
    bun decode2.mjs obs-dir decode.json      legal-turn reconstruction (all games)
    python3 objects_scan.py objects/models/obj.pt   dice and cube detector, every 5th frame
    python3 dice_faces.py decode.json MODEL  face reader (labels from legal moves)
    python3 dice_evidence.py decode.json MODEL evidence.json
    bun analyze.mjs decode.json evidence.json cube-scan.json analysis-dir GAME
    bun patch_rolls.mjs analysis-dir reviewed-rolls.json
    bun present_moves.mjs analysis-dir      only for analyses scored before moves were written as the app writes them
    python3 render.py analysis-dir render-dir GAME...
    bun export.mjs analysis-dir render-dir ../../2026-11-21 GAME...
    python3 export_audit.py obs-dir analysis-dir render-dir ../../2026-11-21 faces.pt GAME...
    python3 finalize_page.py analysis-dir render-dir ../../2026-11-21 TAG GAME...

Checker readings

  A slot classifier reads six checker-sized slots along every point. Labels
  come from the opening position, from decoded positions between turns
  (self-training), from twelve hand-labelled late-session frames, and from
  hand masks found by differencing against a median clean frame. A point
  with an occluded slot is unknown for that frame. A reading of five or more
  is a lower bound because further checkers are stacked over the column.

Turn reconstruction (decode2.mjs)

  Stable readings become observations. A dynamic programme over each game
  links observations by legal turns, or by two turns when an intermediate
  position was never visible (or a player danced). Skipping a reading costs
  its duration unless it is a partial move or another legal result of the
  same turn (players often rearrange before finishing). Bar and borne-off
  counts follow from the legal moves. A game starts at a stable opening
  position.

Dice and cube

  One detector (objects.py, ObjNet) finds both: a small fully convolutional
  network predicts centre heatmaps at a quarter of the 800x590 board for
  yellow dice, red dice and the cube (about 18 and 46 pixels across). It was
  trained on 1,983 frames sampled every 5 s from all three recordings
  (objects_sample.py). Cube labels came from per-zone template matching of
  the cube's grey number oval (holder, either side tray, board); dice labels
  from the earlier colour-blob detector, then three rounds of reviewing every
  disagreement with the detector as crop sheets (objects_review.py,
  objects_grid.py). Training pastes dice cut out by their colour hull onto
  random places, so dice on cream or orange points and against checkers are
  seen; unreviewed die-sized colour blobs are ignored rather than counted as
  background. Held-out frames: 97% of labelled dice found; the cube scores at
  least 0.5 in 1,945 of 1,948 labelled frames. objects_train.py retrains it;
  rebuild_evening.sh reruns the scan, face reader and analysis for the evening.

  The colour-blob candidates (dice.py, dice_scan.py, die_filter.py) and the
  cube template tracker (cube_scan.py) were the first version; they missed
  most small, pale red dice and yellow dice on the points, and the cube in the
  trays.

  White rolls the yellow pair and Black the red pair. The face reader is
  trained only from rolls that a legal move determines uniquely; non-doubles
  use an order-free pair loss. When several rolls reproduce the observed move,
  the reader picks among them. reviewed-rolls.json records rolls confirmed by
  looking at the dice crops (dice_review.py), and these replace the reader.
  A roll that the footage cannot resolve stays marked uncertain and is left
  out of the EV-loss totals.

  The cube is template-matched every second. Holder to board is an offer by
  the player on roll; board to a side tray is a take (top-left White,
  bottom-left Black); board back to the holder is a pass. A cube that goes
  straight from the holder to a tray is a double that was taken at once.

Analysis rules and opening book

  The analysis uses the site's money rules against the bot (scoring.mjs):
  Jacoby on, beavers and raccoons allowed. Opening moves and replies come from
  the bot's opening book (the XG published rollouts, else the GNUbg book), as
  in play against the bot; a played move the book does not list, and every
  later move, is scored with GNUbg at four ply.

Review

  review_sheet.py draws the decoded counts over the board after every turn.
  dice_review.py shows both dice for every turn whose roll the move does not
  fix. Both were used for the published v1 replay.

Several recordings in one evening

  Each recording gets its own work directory (BG_RECORDING_DIR and
  BG_WORK_DIR); copy ref/ and the models from the first one when the board
  has not moved. A clip cut off by a hard stop is skipped, matching the
  combined MP4. A recording that begins mid-game starts a fragment game at
  its first long, complete view; bar and borne-off counts follow from the
  15-checker inventory. The face reader can learn from every recording:

    python3 dice_faces.py decode.json faces.pt --extra other-decode.json@other-work-dir ...
    python3 die_filter.py --score models/die-v0.pt

  Games are numbered across the evening in one combined analysis folder
  (game-NN.json carries the source recording in "session"); render each game
  with its own recording's environment. Dances get a roll from the rolls that
  block every entry (resolve_dances.mjs). The page serves 720p copies
  (libx264 CRF 28) because the published site includes every video and
  GitHub Pages caps the site at about 1 GB.

  Reviewed rolls for the later recordings are in reviewed-rolls-2133.json and
  reviewed-rolls-2219.json (game numbers there are per recording).

Later sessions (Nov 23 and Nov 24, 2026)

  Work dirs ~/Downloads/office-3-backgammon-20261123 (BG_RECORDING_DIR is its
  recording/ folder: links to the first eight one-minute clips and the first
  eight minutes of the combined file) and ~/Downloads/office-3-backgammon-20261124
  (BG_RECORDING_DIR ~/Downloads/office-3-wide-20261124-011852-kqjs8qh9).

  Board placement. ref/reference.json may say how the board differs from the
  Nov 21 view the readers learned: "turned180" (Nov 23: the board turned
  round, corners listed rotated by two) or "mirrored" (Nov 24: the case sat
  where it did on Nov 21, found by SIFT against the Nov 21 reference, but the
  checkers were set up the other way round, so the corners are listed
  top-right, top-left, bottom-left, bottom-right). Either way the rectified
  board keeps White's home top-right and the checker reader and the dice and
  cube detector read each frame turned back (session.board_view, reader_view,
  reader_points). A mirrored board is shown in the replay as the camera saw it
  (render.py, export_audit.py); a turned board is shown turned.

  session.json in the work dir holds the rest: "date" (render header),
  "redDice" (who rolled red: White on Nov 23), "cubeRail": "right" (the cube's
  holder and trays on the rectified board's right rail), "initialCube" for a
  recording that starts mid-game, "startFrame"/"endFrame" (readings left out),
  "minKnown", "branchTies" and "entered" (decode2.mjs), "resume" (frames after
  play the readings could not follow: more than two unseen turns; the decode
  continues from the next complete view as a fragment joined to the game, its
  first turn marked gapBefore) and "result" for a fragment game whose end was
  not played out. Without session.json and the reference flags every script
  behaves as on Nov 21.

  Nov 23: the recording starts mid-game (White owns a 2-cube). White redoubles
  to 4 at 3:40; at 5:04 Black puts the cube back in the centre holder showing
  64, a pass. The players then played the position out; those moves are not
  part of the game.

  Nov 24: four games; in the last one about three turns at 40:36-41:33 were
  not seen and the decode resumes at 41:33 (session.json "resume").

  New pages: new_session_page.py starts a dated page from the Nov 21 page and
  updates the session links of every vision page; export.mjs takes the session
  (dates, ids) from the page folder.

Training data from later sessions

  Dice and cube detector: objects_add.py NAME MODEL stores every 125th frame of
  a session in the Nov 21 view (OBJ_DIR/extra/frames-NAME.npz,
  labels-NAME.json); labels start from the detector and are reviewed with
  objects_candidates.py (low-score peaks), objects_grid.py and
  objects_accept.py. objects.load_frames/load_labels include the extra sets,
  objects.held_out keeps every tenth frame for scoring, and objects_eval.py
  scores models per session (s1-s3 Nov 21, s4 Nov 23, s5 Nov 24).

  Checker reader: build_labels.py (decode2 turns; --hard N adds quiet frames
  the reader was unsure of, labelled with the decoded position) then
  slots_add.py packs the frames in the Nov 21 view (labels/extra-slots-NAME.npz).
  train_slots.py takes the packed sets with the JSON lists; one 3-minute block
  in five is held out (train_slots.held_block, --hold-json for the JSON lists)
  and slots_eval.py scores it.

  Face reader: dice_faces.py --extra takes each session's own dice colours from
  its session.json; --eval-only scores an existing model on --holdout-games.

Held-out object test (Nov 24 evening)

  heldout.py names four held-out blocks: Nov 21 game 4 (s1), Nov 21 game 8
  (s3), Nov 23 from 2:00 (s4) and Nov 24 game 3 (s5). Training scripts leave
  them out (with 10 s either side) when given --exclude-heldout:
  objects_train.py, train_slots.py, dice_faces.py. testset_build.py stores 253
  frames from them (every few seconds, plus each turn's settled dice) in the
  readers' view under ~/Downloads/office-3-backgammon-heldout; every frame was
  reviewed by eye (notes.txt there, proof/ crops) and testset_labels.py turns
  the notes into labels/heldout-labels.json: the dice on the board (a die in a
  hand is not on the board; a die proven hidden is neither a miss nor an
  extra), the cube's zone and face, and for quiet frames the checker position.

  testset_eval.py scores the detector (dice found / missed / extra by colour,
  cube zone), the face reader on each turn's dice, the slot reader per point
  and the decoded position per frame. The decode check counts a frame where the
  player on roll has made part of the move (or tried another arrangement of the
  same dice) before picking up the dice as mid-move, since the replay shows
  whole turns; a finished move shown more than 2 s after the dice were picked up
  but before the decode's result is late; any other difference is wrong. Frames
  after a pass whose board was changed by play after the game (Nov 23) are
  counted apart. --decode s1=file scores a new decode; --decoded-only skips the
  models. testset_rolls.py reads each held-out turn's roll from the dice alone.

  Frames of the held-out games were in the training sets of obj-v8 (554
  frames), faces-v6 and slots-v3, so their held-out scores flatter them; models
  trained with --exclude-heldout are the fair comparison.

  Duplicate peaks. One die can give several detector peaks, 10-20 px apart and
  sometimes of the other colour (its pip face and its coloured side).
  objects.merge_dice keeps one: the scan (objects_scan.py) and the Vision
  overlay (export_audit.py) use it.

  Hard dice. objects_hard.py finds weak die peaks that stay put outside the
  held-out games; objects_hard_add.py turns a review of them (verdicts.json:
  N not a die, Y/R a die of that colour, ? colour not decidable) into the
  extra set "hard" (BG_OBJ_SKIP=hard leaves it out).

  Taken-back moves (decode2.mjs). When a player makes a move, takes it back
  and the board is read in the old position again, the readings in between
  are cheap to skip, so the turn is no longer joined with the next one and
  dated when it ends. The reading that shows the old position must disagree
  with the skipped ones on a point both read.

  Slot reader v5. slots-v5 (train_slots.py --exclude-heldout on the Nov 21
  lists, then the Nov 23/24 packed sets with --packed-role all) reads every
  point of the 145 quiet held-out frames right; a point's count is now the run
  of filled slots from the rail (read_slots.counts, used by observe.py), so a
  bar checker or the cube over a strip's tip is not counted. Its readings
  (obs-v5 in each work dir) feed the Vision overlay. The decodes stay on the
  slots-v3 readings (obs-v3): decoded from obs-v5, Nov 21 game 2's late
  bear-in reads Black's tall home stacks differently and its rolls then
  disagree with the dice (one of them eye-checked), so obs-v5 is not used
  for the decode yet.

  Rebuilt Nov 24 evening with the taken-back rule (decode2-v5.json in each
  work dir; moves, rolls and EV losses unchanged unless noted): Nov 21 games
  1, 2, 6, 7, 8, 9 and Nov 24 games 1-3 have turns dated when they ended
  instead of joined to the next turn (inferred turns in the rebuilt games:
  19 before, 8 now, Nov 21 game 5 included); Nov 21 game 5
  now has White 5-4 (13/9 6/1*) and Black 5-5 from the bar where the old
  decode had four turns (3-1, an unseen 6-5, 4-1, 5-3) that the board does not
  show. Nov 24 was analysed as published: the obj.pt scan
  (BG_DICE_SCAN=objects-scan-obj, cube-scan-obj.json) and faces-v6.

Second held-out test: Nov 24 15:31 recording (Nov 25)

  A new camera position: the case sits on the right of the table, turned about
  23 degrees, so the rectified view is softer and greyer than any training
  session. No model has seen this recording (heldout.py: all of s6 is held
  out). BG_TEST_SET=new selects it in heldout.py, testset_build.py,
  testset_labels.py, testset_eval.py and testset_rolls.py; the test dir is
  ~/Downloads/office-3-backgammon-heldout-20261124pm.

  156 frames (every 15 s, 15:32:35-16:11:20 EST) were labelled blind: no model
  output was shown, every unclear die was zoomed (notes-blind.txt; the colour
  of a pale die showing its pip face is taken from its pair and noted). Quiet
  frames' checkers (checkers-eye.json, 72 frames) started from the slot readers
  and every point was checked on overlay sheets (35 frames corrected).
  Blind labels are placed by eye, about 10 px, so this set is scored with
  testset_eval.py --tol 16 (a die is about 20 px across).

  Findings and what changed:
  - The shipped detector (obj-v8) finds 209 of 227 dice but gives 199 false
    peaks: red chips on the table below the case and dark checkers' emblems.
    objects.on_board drops peaks off the playing surface (scan and test).
  - obj-v10: obj-v8 fine-tuned with objects_train.py --strong-aug (white
    balance, saturation, gamma, blur, lost resolution; 3000 steps, same
    training frames, none from s6). The mean of obj-v8 and obj-v10
    (objects.load('obj-v8.pt,obj-v10.pt')) on the new set: 211/227 found,
    16 missed, 17 extra (obj-v8 with the board mask: 209/18/112). On the
    older set it trades evenly (one miss and one false peak fixed, one false
    peak and one face misread added), so the pair is used for the 15:31
    session only and obj-v8 stays the default.
  - The cube peak is faint in this view: zone right per frame 137/155 at a
    0.15 cut against 86/155 at 0.5 (the older set is 252/252 either way).
    The scan now keeps cube peaks from 0.15; analyze.mjs takes the cut from
    session.json "cubeThresh" (0.5 unless set; 0.15 for this session).
  - Checkers: slots-v6 (stronger blur and colour-cast augmentation, older
    sessions only) reads the new set with 19 wrong of 1669 points read
    (slots-v3: 25 wrong of 1087, 641 unknown). Its misses: checkers pushed
    off the column centre (a white 3-stack next to the bar read as one) and a
    single checker in the bottom corners.
  - Decode: game 1 (0:36-11:28) decodes; on its eye-checked frames 18 are
    right and 5 mid-move or late. After it the players showed several opening
    arrangements of one 4-1 (13/8 against 13/9 24/23) from 14:11 to 15:41 and
    the reader then misreads the 3-stack on point 8 for minutes at a time, so
    games 2 and 3 do not decode yet; the session is not published.
    decode2.mjs: session.json "conf" (the reader confidence a point needs),
    an opening view may leave up to three points unread, soft readings break
    ties, and BG_DUMP_OBS=file writes the stable observations.
  The decode2.mjs changes leave every published decode as it was except Nov 21
  game 2, which they rebuild as decode2-v6.json (turn 19 Black 4-3 15/19 15/18,
  read on the board: point 18 holds four at 29:40, and turn 21 6-3 18/24 17/20,
  point 18 back to three at 32:16; the face reader read the 6 as a 5), and the
  Nov 23 play-out after the pass (two dances dated earlier, not in the game).

Nov 24 15:31 decoded and published (Nov 25)

  Checker reader. slots-v7 is slots-v6 fine-tuned (--strong-aug, 1500 steps) with the session's game 1
  only: build_labels.py --games 1 --hard 8 --clean-conf .6 --clean-motion 1.2 on the slots-v6 decode
  (this view's readings rarely reach 0.9), packed with slots_add.py. Game 2 (14:06-37:40) is never
  trained on. read_slots.Reader also reads a rail slot that came out empty again 12 and 18 px further
  out (RAIL_OFFSETS) and takes a checker read there at 0.8 or more: a single checker left short of the
  rail (White entering from the bar into the bottom-left corner at 23:41) was read as an empty point,
  which stopped the decode for the rest of the game. Scored on the new test set's game 2 frames (49):
  slots-v6 18 points wrong and 49 unknown (9 frames all right), slots-v7 8 wrong, slots-v7 with the
  rail re-read 0 wrong of 1176 (49/49). The older set is unchanged (slots-v5 0 wrong with the re-read).
  obs-v7r (slots-v7) gives decode2-v7r.json: game 1 0:58-11:29 (48 turns), game 2 14:06-37:30 (55 turns,
  White bears off all 15). The opening arrangements at 13:34-14:07 are not games. On the eye-checked
  frames 46 decoded positions are right, 17 mid-move (game 2's players often tried moves for a minute or
  more before picking up the dice) and 1 wrong (5500, a frame in game 1 before White's dance).

  Eye labels: s6:29125 and s6:29500 had points 14 and 19 as -1/-5; the board shows -2/-4 (corrected in
  checkers-eye.json, old file kept as checkers-eye.backup-20261125.json).

  Die verifier (die_verify.py). A crop classifier (not a die / yellow / red, 48x48 at full resolution)
  trained on the detector's training frames (held-out games left out): labelled dice, detector peaks
  from 0.03 (labelled by the reviewed object labels), random places and crops 12-18 px off a die.
  refine() is conservative: a die peak from 0.35 is dropped when the crop is not a die at 0.9 or more, a
  peak of 0.15-0.35 is kept when the crop is a die at 0.9 or more. Both test sets (testset_eval.py
  --verify objects/models/die-ver-v1.pt): older set Nov 21 209/212 0 extra, Nov 23 65/67 0 extra (was
  1), Nov 24 88/93 0 extra, faces unchanged; new set 213/227 found, 14 extra (was 211 and 17).
  Used for the 15:31 scan only (objects_scan.py obj-v8.pt,obj-v10.pt --verify die-ver-v1.pt); the
  published older scans are left as they were. Tried and not adopted: the crop's die probability as the
  score (finds the Nov 21 pale dice but adds false ones on the new view), a verifier trained with
  off-centre negatives as the score (die-ver-v2-offcentre.pt), and colour from the player on roll (the
  previous roller's dice usually lie on the board until the next roll, so in 70 of 227 new-set dice
  the labelled colour is not the colour of the turn being played; it needs the roll frame, which comes
  from the dice).

  Cube. session.json "cubeRailX": the cube in White's tray peaks at x 698-724 in this rectified view, so
  the rail starts at 690 (710 elsewhere); new set cube zone per frame 137 -> 146/155 (the rest have no
  cube peak at all: the cube in the holder at 0:40-3:00 and after 37:55). analyze.mjs drops cube moves
  after a game's last bear-off (the cube put back in the holder for the next game is not a pass; no
  published game had one) and session.json "finalBearOff" lists games whose winner bore off the last
  two to four checkers in one unseen roll (game 1: Black's last three, 11:29-11:34, before the board was
  cleared). "danceWindow" is set as for earlier sessions (game 1's double came after White's dance).

  Rolls. dice_evidence.py on the verified scan with faces-v6; reviewed-rolls-20261124-1531.json holds
  three close rolls checked by eye (G1 T13 6-3, G2 T28 3-1, G2 T49 6-1). G1 T8 (3-2) and G2 T33 (1-1)
  could not be read from the crops and stay as the face reader read them; G2 T51 (1-1 or 3-1) is not
  seen and stays uncertain.

  Results: game 1, Black doubles at 3:01, White takes, Black wins 2 by bearing off; game 2, White doubles
  at 31:08, Black takes, White wins a gammon, 4 points. The page is vision/2026-11-24-pm ("Nov 24 PM";
  new_session_page.py and export.mjs take a suffix after the date for a second recording that day).

Die identity tracking (Nov 25)

  die_track.py follows each physical die, and the cube, through time instead of reading every frame on
  its own. Every 5th frame keeps the detector's die peaks from 0.1 (both colours, the detector's yellow
  and red scores at the peak and die_verify's not-die / yellow / red) and the three best cube peaks.
  Peaks within 17 px are one die (side and pip face); dice are linked frame to frame (16 px a step, 10 px
  across up to 2 s when a hand hides them), and a die that reappears where one vanished (12 px, 6 s)
  continues it. A die's roll partners are the strong dice that started within 1.2 s of it. Per frame,
  starting from die_verify.refine: a weak die with an unsure colour takes its one sure partner's colour
  (the 15:57 die at the rail landed with a clear yellow die; colour from the player on roll fails, the
  previous roller's dice stay on the board); a faded peak on a die once seen clearly is kept; a weak
  still die that landed with exactly one strong die is that roll's other die; a red peak next to a yellow
  one is a pale yellow die's pip face (no red die in either test set has a yellow peak of 0.35 within
  20 px; yellow dice often have a red one); the dice are merged again, except two peaks that both stay
  strong for 2 s (touching dice). The cube: a peak under 0.5 is replaced by the strongest place over
  10 s either side (the 15:31 holder peaks at 0.12-0.18 or not at all).

  testset_eval.py --track CACHE scores it (die_track.py testcache OBJ VER CACHE, same models):
    older set (obj-v8 + die-ver-v1):  Nov 21 dice 209/212 -> 212/212, Nov 23 65/67 -> 65/67, Nov 24
      88/93 -> 90/93, no false peaks before or after; faces 39/41, 7/7, 17/17 and cube 252/252 unchanged.
    new set (obj-v8,obj-v10 + die-ver-v1, --tol 16): dice 213/226 found, 13 missed, 14 false -> 222/226,
      4 missed, 3 false; cube zone 146/155 -> 155/155.
  Left: Nov 23 s4:9062's two dice in the air (motion blur, no die shape), the Nov 24 pale red die at the
  rail (29672-30059, peaks 0.13-0.26; its track looks like the 15:31 checker emblem at 697,177, which
  the same rule would also keep), the 15:31 die on the bar edge (5125, 5500: three pips on the wood), a
  die by the checkers at 11125 (one frame), the second of two touching red dice at 43000 (one peak for
  both), a fingertip (11500), a die held in a hand (21250), a pale die's face peak (23875) and a dark
  checker's emblem (25000).
  Tried and not kept: colour from hue (yellow dice never show red pixels, but a tenth of red dice show
  none either, so per frame it loses 4 dice; over a track, the pale dice still missed lie by the bar or
  the rail, whose wood counts as red); one die per 17 px blob (merges touching dice, 18-19 px apart in this view); a companion yellow
  track as pale-face evidence (Nov 23 red dice at the top rail have weak yellow neighbours); the
  verifier alone for touching dice (adds false dice); face reads pooled over a die's still frames (Nov 21
  39/41 -> 38/41: touching dice at s1:78292).

  The 15:31 scan is now die_track.py scan (objects-scan; the obj-v8,obj-v10 + verifier scan kept as
  objects-scan-v8v). cube-scan.json is unchanged: the tracked cube moved the published offer and take
  times by 1-2 s and nothing else.

  Faces. The new set's faces were read by eye, blind, on 6x crops of each labelled die (124 of 226
  readable): labels/faces-blind-new.json. Checked against the roll that the checker play fixes for the
  die's turn, the eye was right 67 of 90 times (a 4, 5 or 6 seen from the side shows two bars), so the
  score uses the checked label: the roll for a double, the eye's read when it is one of a non-double
  roll's values (88 dice). testset_eval prints "die faces": shipped 75/78 found dice right, tracked
  82/85. s6:13750's second die (323,328) was dropped from the labels: the zoom shows bare felt there.
  faces-v8 (s6 work dir models/faces-v8.pt) is faces-v6 fine-tuned 800 steps on the 15:31 session's
  game 1 rolls only (dice_faces.py decode2-v7r.json --holdout-games 2 --init faces-v6): game 2's
  unique-roll turns 21/31 -> 28/31 (1500 steps 27, 3000 steps 26). testset_rolls.py (now also per game)
  on the new set, against the published rolls: game 2 36/54 (faces-v6, published scan) -> 46/54
  (faces-v8) -> 47/54 (faces-v8 on the tracked scan); game 1 (trained on) 37/44 -> 43/46, two more turns
  with both dice seen. The older games keep faces-v6. The two opening-roll misses in the older set
  (s1:58728 6-4 read 6-6, s3:30666 2-1 read 1-1) are single frames where one die is edge-on or blurred on
  a cream point; read over their tracks (testset_rolls) both games' rolls are right (Nov 21 40/40).

  Republished Nov 24 PM: the tracked scan with faces-v8 disagreed with four of the session's
  dice-read rolls; on crop strips of the roll (eye, reviewed-rolls-20261124-1531.json): game 1 turn 4
  White 6-2, not 2-2 (one die shows its side, so not a two), game 2 turn 33 White 3-1, not 1-1 (the die
  on the point's tip shows several pips), game 2 turn 52 Black 5-3, not 2-2 (three pips in a line on the
  bar edge, five on the other); game 1 turn 8 stays 3-2 (the die landed showing three before a hand
  pushed it over). patch_rolls.mjs re-scored those turns; results and cube actions are unchanged.

Tracker on every session and the roll audit (Nov 25)

  Every orange-board work dir now has a tracked scan from the raw peaks of obj-v8 + die-ver-v1
  (die_track.py scan, objects-scan-track and cube-scan-track.json; Nov 24 15:31 keeps obj-v8,obj-v10 and
  its published objects-scan). Two rules were added to the tracker:
  - 3b, opening-roll partner: a weak still track that the verifier never called a die (not-die under 0.5
    at least once) is a die when it landed with exactly one strong die of the other colour 30+ px away (the
    opening roll: one die of each colour). It finds Nov 24 game 3's pale red die at the rail
    (s5:29672-30059). Without "other colour" and "30 px" it also keeps a yellow die's own red side peak.
  - 6, two of each colour: a third die of one colour is dropped, the weakest track first (the 15:31
    fingertip at s6:11500 and the dark checker's emblem at s6:25000, both next to a fresh roll).
  Test sets (testset_eval.py --track, same caches): Nov 24 dice 90/93 -> 93/93; new set false peaks 3 -> 1;
  everything else unchanged.

  Dice evidence from the tracked scans (faces-v6; faces-v8 for 15:31) changes one published dice pick:
  Nov 21 game 9 turn 46, Black's dance.

  roll_audit.py compares every published roll (move, opening book, dice reader or eye) with the roll its
  dice show, read over the dice's tracks; roll_strip.py draws crop strips of a turn's dice for the eye
  check. A turn is "stale" when both dice found were lying there 2-4 s before its window opened (an
  earlier roll's dice). Every disagreement and stale turn was eye-checked:
  - fixed: Nov 21 game 9 turn 46 Black's dance 4-3 (was 3-3), turn 47 White 5-4 (was 6-3: one die shows
    four as two rows of two, the pale die at the rail five); Nov 24 PM game 1 turn 14 White's dance 6-1
    (was 1-1, unread); Nov 24 PM game 1 turns 9-11 are one Black 5-4 (23/18 18/14*): the red dice lie
    unmoved from 5865 to 6405 and no yellow die appears, so the decode's 3-1, White dance and 4-1 were one
    roll played in two stages. merge_turns.mjs joins such turns (merged-turns-20261124-1531.json);
    patch_rolls.mjs now also takes a dance's roll.
  - the published roll stands: the reader misread a face (a pale die on a point, a side view of 4-6, a 5
    read as 1), took two peaks of one die as two dice, or read two touching dice as one.
  - not resolved: three stretches where the dice disagree with the decoded moves and no single roll plays
    the change: Nov 21 game 2 turns 34-37 (48322-48777), Nov 21 game 7 turns 6-12 (7955-12405) and Nov 24
    PM game 2 turns 49-52 (54547-55092; White bore off from 6 and 4 on what the dice show as 6-4, then Black
    moved 18 pips on one non-double roll).

The unresolved decodes, rebuilt by eye (Nov 25)

  rechain_turns.mjs replaces decoded turns with turns read from the footage and carries the change through
  the rest of the game: a fixed turn gives its roll and move in the player's own numbering and must be a
  legal play from the new position; every later turn replays its decoded steps on the new position (a hit
  still hits) and must stay legal; everything from the first fix on is re-scored as analyze.mjs scores it
  (pre-roll cube or position, checker play, the answer to an offer). A fix can also be a dance (every
  candidate must block; one die seen narrows the candidates), irregular play (the tool checks that no roll
  plays the change) or a turn the decode invented (dropped). Fix files: rechained-turns-2026-11-21.json
  (Nov 21 games 2 and 7, applied to the -all analysis) and rechained-turns-20261124-1531.json.

  - Nov 21 game 2: the trouble starts at turn 24, not 34. Black's 6-point stack is a lower bound for the
    reader (five or more), and from turn 24 the decode kept one checker too many there and one too few
    borne off. The tray shows it: Black's borne-off checkers lie flat in the right rail's tray (x 700-790,
    y 290-420), one at 31:44, three at 31:56, four at 32:07, six at 32:18, seven at 32:29. Read on the board
    (every point but the 6-point counted, the 6-point from the 15 checkers): turn 24 4-2 8/4 8/6 (the 8
    point empties, the 7 point keeps three, one lands on the 4 point; was 1-1), turn 26 5-1 7/2 7/6 (the
    hand takes one 7-point checker to the 6 point, one to the 2 point; was 4-1), turn 28 6-1 7/6 6/off at
    31:40-31:44 (was 1-1 7/6(4), dated before the roll), turns 30 and 32 as decoded, turn 34 6-5 6/off
    5/off (was 1-1 6/5(4), joined to White's 5-5), turn 36 6-1 6/off 6/5 (was 5-5 5/off(4)). The second
    die of turn 36 is hard: the face readers say 4 (faces-v6) or 3 (faces-v8); at 8x it shows two blobs
    4 px apart at its left edge, like the single large pip of turn 30's one, where a two or a three in this
    view shows two or three pips 6-12 px apart; 6-1 is also the only roll that plays the board. The face
    readers agreed with the wrong decode at turns 24 and 26 (both read a four on a die showing 2x2 pips as
    a one or a six), so roll_audit.py now lists 24, 26 and 36 as disagreements; they were checked by eye.
  - Nov 21 game 7: Black hit at 5:08 and White’s checker lay on the bar until 8:50 (it is visible on the
    bar). The decode had White enter (6-1), move on (an inferred 3-1) and be hit again. Read: White dances
    at turns 5, 7, 9, 11 (yellow faces six; four; four; four-four, all on Black's 6, 4, 3 and later 5
    points), Black 5-4 13/9 13/8, 4-3 9/5 8/5, 6-3 13/10 13/7, 1-1 8/7 24/23 10/8 (a single pip on both
    dice; was 4-4, 4-2, 3-1, 2-1). The decode agrees again from turn 12.
  - Nov 24 PM game 2: White's 6-4 bore off from the 6 and 4 points in one turn (the decode split it into
    6-1 and an invented 1-1). Then one red roll lands, 5-3 (16:08:30-16:08:40 EST; the three cocked
    against the rail), and Black moves two checkers, 18/8 and 12/4: 18 pips, which no roll plays (eye:
    the 18 point empties, the 12 point goes from two to one, one checker each on the 8 and 4 points). The
    players' play was irregular. export.mjs now takes a turn marked "irregular": the history keeps the
    roll, shows "Irregular play: 18/8 12/4" with a note in the turn list and the report (issue
    'irregular-play'), and the Library history goes on in a second item ("part 2") from the board as the
    players left it; render.py shows it in the decision panel and the recent actions, unscored.

  Rolls without two dice (roll_audit.py "unseen" and "stale", 34 after the fixes). Each window was
  extended to the pickup and the landing, the score cut lowered to 0.15, and every die read on its own:
  - one more pair found (Nov 24 game 3 turn 4, 5-3, second die from 0.15);
  - Nov 23 turns 14 and 16 and Nov 24 game 4 turn 18 are dances whose dice landed just outside the
    audit's window (the decode dates dances late); read by eye they are 6-3, 5-3 and 6-4, all blocking
    (were shown 2-2); reviewed-rolls-unseen-20261125.json;
  - one die seen and one of the published roll's values, where the move fixes the roll: 18 turns (Nov 24
    PM game 1 turn 7: the reader said one, the eye reads five as the 5-5 needs);
  - one die narrows several candidates to one: Nov 21 game 2 turn 31 (five: 5-1, was unresolved 5-1 or
    4-2), game 2 turn 11 and game 7 turn 17 (their reviewed rolls);
  - still open: Nov 21 game 7's three single-die dances (several blocking rolls), game 1 turn 15 (two:
    2-2 or 6-2), game 2 turn 13 (a yellow die on a yellow point, unreadable), game 9 turn 9, Nov 24 game
    1 turn 38 (closed board) and two turns with no die at all whose move fixes the roll.

  Touching dice (s6:43000). Neither the detector's heat blob nor the die's pixel blob tells one die from
  two touching ones in this view: the touching red pair's heat blob (11 cells at half its peak,
  elongation 1.9) is inside the single dice' range (up to 20 cells, 3.8), and its red-body blob (570 px,
  2.3 times the session's median die, 34 px long) is matched by single dice with a red halo (5% of
  isolated single dice reach 2.2 times, the largest 2.7; up to 44 px long). Only one labelled red pair
  exists, so a size rule would add several false dice to gain one; not adopted.

Face reader from the published rolls (Nov 25)

  The decoded moves and the eye checks give every published roll's true values, so every tracked crop
  of its two dice can be labelled. face_labels.py builds the set (one npz per session; the Nov 25 set is
  ~/Downloads/office-3-backgammon-20261121/faces-labels-20261125): rolls the audit confirms, plus the
  disagreements eye-checked as reader misreads (face-labels-eye.json, 19 rolls: pale dice on points,
  side views of 4-6, a 5 read as 1, a 4 as two rows of two on an orange point). A double labels both
  dice; an opening roll gives the starting player's colour the higher die; otherwise the two values go
  to the two dice in the order the previous readers prefer (faces-v6, faces-v8 for 15:31), and a pair
  within 3 log-prob of both orders is kept order-free. Left out: unseen, stale and structurally wrong
  rolls (duplicate peaks of one die, a dance and a move sharing a window, a die pushed over after it
  landed, the merged and irregular 15:31 turns, Nov 21 G9 T13 whose second track is not the roll's die).
  431 rolls, 34,936 crops (at most 60 per die): Nov 21 213 rolls, Nov 23 20, Nov 24 105, 15:31 92.
  Checked by eye on contact sheets (40 random dice per face and every eye-checked roll's two tracks):
  labels right; a few crops are a die under a hand.

  face_train.py trains the reader on them (dice drawn uniformly, one random crop each; --strong-aug
  colour cast, blur and lost resolution; --touch-aug pastes another die's centre 13-20 px away, as
  touching dice lie; --crop full reads the whole 40x40 patch). Old test-set frames are left out with
  --skip-held. dice_faces.load_net('a.pt,b.pt,...') is an Ensemble (each model on its own crop,
  log-probs averaged).

  Honest hold-out (s6 = 15:31; crops scored on the verified set, dice pooled over 20 crops):
    trained Nov 21 + Nov 23 + Nov 24 AM, old test games out, never s6 (lean + full, --strong-aug):
      s6 crops 95.9%, dice 181/184 (faces-v6 81.3%, 159/184; faces-v8, fine-tuned on s6 game 1, 96.6%,
      180/184); the new set's eye-labelled die faces 84/85 (faces-v6 and faces-v8 82/85); old test-set
      faces 40/41, 7/7, 17/17 (faces-v6 39/41, 7/7, 17/17 having trained on those frames).
      s6 confusion: 5 read as 1 2 crops (faces-v6 25, faces-v8 61); pale 1 read 2/3/4 45/23/4 (faces-v6
      202/64/91); side-on 4 read 3 61 (faces-v6 55, faces-v8 66: not better); eye-checked (hard) rolls'
      crops 269/367 (faces-v6 238, faces-v8 203).
    reverse, trained on s6 alone (186 dice): old sessions 94-98% of crops (Nov 21 94.2/96.5/94.2%).
    each Nov 21 recording read by a model that never saw Nov 21 (full crop): eye-checked rolls' crops
      322/423, 221/221, 365/371 (faces-v6 195/423, 99/221, 200/371 although it trained on them).

  Shipped: faces-v9 = faces-v6 + faces-v9-lean + faces-v9-full (Nov 21 models dir), the two new readers
  trained on every session with the old test games left out (--strong-aug --touch-aug .3, 8000 and
  6000 steps). roll_audit.FACES uses it for every session (faces-v8 is no longer the 15:31 default).
  Old test-set faces 39/41, 7/7, 17/17 -> 41/41, 7/7, 17/17 (s1:78292's touching dice now read); new
  set die faces 82/85 -> 84/85 (s6:20125's 5 still read 1; faces-v9 saw s6, the honest figure above is
  also 84/85).

  Roll audit (roll_audit.py, now splitting touching dice and masking a neighbour, below): 477 published
  rolls, 415 -> 437 read the same from the dice, 28 -> 6 disagree, 33 without two dice, 1 stale; no roll
  the dice confirmed before is contradicted and no dice-picked roll changes. The 6 left are the known
  track faults (Nov 21 G9 T13 second track, G9 T29 and Nov 24 G1 T34 duplicate peaks, G9 T46 the dance
  sharing T47's window, 15:31 G1 T8 die pushed over, G2 T50 irregular turn). Read by models that never
  saw the session (an honest audit), the gain is smaller and some low-margin misreads appear: Nov 21-24
  325 -> 335 confirmed with 4 new contradictions (fold models, full crop only), 15:31 89 (faces-v8 90)
  with 4.
  - dice_faces.split_touching (roll_audit and face_labels): a tracked group with two detections in a
    quarter or more of its frames is two touching dice, split by 2-means (Nov 21 G6 T19, Nov 24 G4 T31).
    No published verdict changes with the old reader.
  - dice_faces.mask_neighbours: a die's crop with every pixel nearer a neighbouring detection (6-26 px,
    any colour) painted the felt colour. With faces-v9 it removes the last new contradiction (Nov 21 G6
    T19, a three on its edge 16 px from a four); with faces-v6 alone it adds one, so it is on only with
    faces-v9 (roll_audit default; --no-mask).
  Tried, not kept: lean or full crop alone (full reads a touching neighbour: Nov 21 G4 T24, G6 T19),
  pooling a track's 10 surest crops (roll_audit --pool confident: no change with faces-v9, one roll
  swapped with faces-v6), labels from the unsplit groups (touching dice labelled as one die), init from
  faces-v6 (no better).

  Rolls without two dice, re-read with faces-v9 (extended window, as before): no published roll changes.
  Nov 21 G2 T13 (5-2 or 4-3) reads its one die as two (p 0.59): 5-2, as published, still uncertain. Nov 24
  G4 T18 and 15:31 G1 T7's single dice now agree with their eye-read rolls. Nov 23 T16's extended window
  catches T18's 2-2 dice (4742-4785, the next dark roll); T16's eye-read 5-3 stands. Still open: Nov 21
  G7 T5/T7/T9 dances (one die each, several blocking rolls), G1 T15 (2-2 or 6-2, one die shows two),
  G9 T9, Nov 24 G1 T38 (no die seen). Nov 21 G2 T36 (19:34:03 EST, 6-1 by the board) now reads 6-1 from
  the dice.

Tracking faults fixed; side-on four; the open rolls (Nov 25, 08:00-09:30 EST)

  The six disagreements left in the roll audit were tracking faults. Each was traced:
  - one die seen twice, two ways. (a) Nov 24 G1 T34 and Nov 21 G2 T16: the scan keeps one peak per frame,
    the stronger, and the die's pip face and side (14-19 px apart) win by turns, so the 10 px cells of
    dice_faces.tracks split one die into two groups that never share a frame. (b) Nov 21 G9 T29: a pale die
    on a cream point gives two strong peaks in every frame, 14.7 px apart, which the tracker kept as two
    touching dice (rule 5); its two "dice" filled the colour's two places (rule 6), so the real second die
    (a two at 338,316) was dropped.
  - the wrong second die, Nov 21 G9 T13: the second group (351,479) is a die by the hand at the checkers for
    2.4 s, while the roll's dice lay 25 s. The roll's real second die, pale on the bottom rail (256,554),
    peaks at 0.10-0.23 and is not in the scan.
  - the shared dance window, Nov 21 G9 T46/T47: the dance and White's next roll were decoded from one jump
    and read the same window, so the dance read White's pale rail die (coloured red by the tracker) and
    White's turn read a five from turn 45's dice, still lying when the window opened.
  - the pushed die, 15:31 G1 T8: the three rests at 461,383 for 0.8 s, a hand pushes it 25 px and it
    shows one; the two rests are two groups.
  Fixes:
  - die_track.py rule 5b: two strong same-colour dice 13-24 px apart are checked once per track against
    the board before the die landed (the median of up to 9 frames with no die peak within 30 px, else
    after it left). The changed region under the two peaks spans 12-24 px for one die and 29-48 px for two
    touching dice. Under 28 px the weaker peak is dropped. A board that changed around the die (light, a
    hand) gives no verdict. All 38 checks on the six sessions were eye-checked on mask sheets (9 one die,
    29 two dice, all right). Tracker(image=...) takes the frames; scan and testset_eval --track pass them.
    Every session has a new scan, objects-scan-track3 (die_track.py scan --raw objects-scan-track.raw.pkl
    --out objects-scan-track3 --cube-out cube-scan-track3.json; the 15:31 raw peaks are obj-v8,obj-v10 as
    before). The published scans and cube scans are untouched.
  - dice_faces._joined (roll_audit.py sets dice_faces.JOIN_GROUPS): groups less than 24 px apart that
    overlap in time but share at most a tenth of their frames are one die, read at the place seen more
    often. A group that starts within 2 s of another's end, within 40 px, is the same die pushed, read from
    its first rest. When the longest group is seen in the last 10 s before the move, another group that
    vanished 10 s before it with under a quarter of its detections is not the roll's die.
  - roll_audit.py: a dance and the next roll that share a window split it where the next roll's dice land
    (the dance's window ends 5 frames before; the next turn's starts 30 frames before, so its dice count as
    fresh). The roller's only fresh die takes a fresh die of the other colour that landed within 30 frames
    as its pale partner (the other player's roll already lies on the board); rows show it as
    'otherColour'. --no-join, --no-split-window and --no-pale-partner turn these off.
  A relaxed pair-colour rule (a strong die of unsure track colour takes its partner's colour) was tried in
  the tracker and dropped: it recolours the Nov 23 opening roll's red die (s4:9562).

  Roll audit (477 published rolls): 437 -> 443 confirmed, 6 -> 1 disagree (15:31 G2 T50, the irregular turn),
  33 -> 32 without two dice, 1 stale. No roll the dice confirmed before is contradicted and no dice pick
  changes. Newly confirmed: Nov 21 G9 T29 4-2, G9 T46 4-3; 15:31 G1 T8 3-2; and three rolls whose pale
  partner was read in the other colour: Nov 21 G2 T13 5-2 (a pale five at the rail, eye-checked), G2 T21
  4-4, Nov 24 G3 T8 6-5. G9 T47 5-4 is now read from its own two dice. Now without two dice: Nov 21 G9 T13
  and Nov 24 G1 T34, whose second dice were found by eye (below). Every newly confirmed roll was
  eye-checked on roll_strip.py strips.
  Object test sets (testset_eval.py --track, rule 5b on): Nov 21 212/212, Nov 23 65/67, Nov 24 93/93, no
  false dice, faces 41/41, 7/7, 17/17, cube 252/252; new set 222/226 with 1 false. All unchanged.

  Side-on four read as three (15:31). The 61 crops are one die, s6:147 (all 60 of its crops), plus one
  crop of another die. s6:147 is 15:31 G2 T34's red four, cocked against the rail. The roll is fixed by the
  move (4-2), and the other die shows two, so the label is solid. The crop is centred. The cause is the
  view angle: the tilted face is foreshortened along its diagonal, so the four's two off-diagonal pips
  merge in the middle and the face shows one diagonal line of pips, a three's pattern. No training session
  has a die cocked this way. Tried with honest hold-out (face_train.py, s1-s5 with the old test games out,
  scored on every 15:31 crop, lean crop, 8000 steps, --strong-aug --touch-aug .3):
    baseline (same recipe)                  89.6% of crops, dice 168/184, 4->3 61, 5->4 17, 6->3 21
    --squash-aug .3 (crop foreshortened 0.4-0.8 along a random direction)   79.2%, 153/184, 4->3 66, 5->4 318, 6->3 370
    --squash-aug .1                          84.7%, 163/184, 4->3 68, 5->4 299, 6->3 152
  Foreshortening makes a six's two columns one line (a three) and a five a four, so it costs far more than
  it could gain; not adopted (the option stays in face_train.py, off). The shipped faces-v9, which saw
  15:31, reads the die right, and the published roll does not depend on it.
  The 5 read as 1 at s6:20125 was a label error. The yellow die there is a new roll between the games
  (one yellow and one red die land at 20125). It was labelled 5 from White's last published roll (5-5 at
  17235). At rest (20150-20200) it shows a single pip. faces-blind-new.json now has 1 (old file kept as
  ~/Downloads/office-3-backgammon-heldout-20261124pm/faces-blind-new.backup-20261125.json); heldout-labels-new.json
  is regenerated. New set die faces with faces-v9: 84/85 -> 85/85; the honest readers that never saw
  15:31 (last round's lean + full pair) also 85/85.

  The seven open rolls. In every one the second die lies on the board and the scan never found it: pale
  dice at the bar edge or the rail. They were found on whole-board frames, zoomed, and read by eye and by
  the face reader on crops at that place (faces-v9):
  - Nov 21 G7 T5, White's dance: a three by White's checker at the bar (343,369, 7715-7745; one diagonal
    bar of pips; reader 3, p 1.00) and the six already seen: 6-3, was published 6-6.
  - Nov 21 G7 T7, dance: a six seen side-on at the bar edge (363,319, 8735-8765; two unbroken bars, where a
    four's rows show separate pips; reader 6, p 0.78) and the four: 6-4, was 4-4.
  - Nov 21 G7 T9, dance: a five at the bar edge (360,307, 8960-8985; four corners and the centre; reader 5,
    p 1.00) and the four: 5-4, was 4-4.
  - Nov 21 G1 T15: a six side-on beside the bar (364,368; reader 6, p 1.00) and the two: 6-2, was 2-2.
    13/5 is now scored as 6-2 (loss 0.095), so White's graded checker loss in game 1 goes from 0.047 to
    0.142.
  - Nov 21 G2 T13: 5-2 as published. The pale five at the rail is now read by the audit (above).
  - Nov 21 G9 T9: 6-1 as published. The one was already seen; the pale six on an orange point at the bottom
    (223,545, 48020-48150) reads 6 on every frame.
  - Nov 24 G1 T38: not rolled. White was closed out: no yellow die appears from 17950 to 19950, and after
    Black's roll Black takes the cube and redoubles (18161). The 1-1 is the decode's placeholder for the
    skipped turn. It stays marked on the page as a roll not resolved (rollSource "ambiguous"), and is not
    graded.
  Also confirmed by second dice found by eye: Nov 21 G9 T13 6-1 (a one, pale on the bottom rail, 256,554,
  reader 1 on every frame) and Nov 24 G1 T34 3-2 (a two at the top rail, 147,32, reader 2). The audio was
  not needed: every open roll but the closed-out one had both dice in view.
  reviewed-rolls-open-20261125.json holds the four changed rolls (patch_rolls.mjs on the -all analysis).
  rechained-turns-2026-11-21.json carries the three dances, so a rechain does not undo them.
  Republished Nov 21 games 1 and 7: re-rendered, web copies replaced in release office3-backgammon-20261121-v3,
  page data, Vision overlay (faces-v5, obs-v5 as before) and posters re-exported. Backups are in
  ~/Downloads/office-3-backgammon-20261121-all/backup-20261125e.

Pale second dice: the rolls without two dice, and obj-v11 (Nov 25, 09:00-11:00 EST)

  The miss class, measured. Every roll the audit left without two dice (32, plus the one stale) was looked at on
  whole-board sheets with the detector's weak peaks and the blobs that changed since before the roll (scratch
  find2.py), the second die placed by eye, re-centred on its difference from the board before the roll, and its rest
  span found (patch match + difference, every 5th frame); every place was checked on 4x zoom sheets.
  labels/hard-pale-dice-20261125.json holds the 28 dice found this way (session, readers' view x/y, colour, where,
  rest span, obj-v8's best and median score at the place; obj-v8,obj-v10 for 15:31). Of the 33:
    28  a pale second die lying on the board the whole time, never in the scan: 20 at the bar edge or beside the bar
        (mostly side-on, two white bars), 8 on a rail or a point's end at the rail; 26 yellow, 2 red (Nov 24 G4 T1,
        15:31 G1 T7, the new test set's bar-edge die at 15:35:20). obj-v8's median score over the rest: 0.00-0.32
        (mean 0.13), 0/28 at 0.35 or more, 8/28 reach 0.35 in some frame.
     3  dice the detector sees (0.6-0.97) outside the audit's window: Nov 23 T14 (the second die lay 1 s by the bar
        before a hand took it), T16 (both dice lay before the window: a dance dated late) and Nov 24 G1 T8 (the yellow
        2-1 landed at 4360-4460, after the window the decode gave the turn; 4054-4249 belongs to Black's 5-3).
     1  never rolled: Nov 24 G1 T38 (White closed out; known).
     1  stale: 15:31 G1 T38, both dice seen, lying from before the window.
  The Nov 24 test set's pale die at the rail (s5:29672-30059) is the same place as Nov 24 G3 T2's second die. Its
  label is red and the die shows no yellow at all (a pink tinge against its partner's plain yellow): White's 6-4 was
  rolled with one die of each colour after the opening roll. The label is left as it is.

  Training frames from verified positions (objects_rolls.py, extra sets rolls-n21a = s1+s2, rolls-n21b = s3,
  rolls-n2324 = s4+s5 in the detector's extra/ folder): one frame per confirmed roll (40% into the time both its dice
  lie still) and up to six per eye-found die over the inner 80% of its rest; never a frame of the old test games (10 s
  margin) or of the 15:31 recording. Labels: every die of the session's tracked scan (objects-scan-track3) at that
  frame plus the eye-found dice lying then. Raw detector peaks no label explains: from 0.15 reviewed by eye (120 on
  contact sheets, labels/rolls-review-20261125.json: 99 a labelled die's other face or a touching neighbour, ignored;
  19 not a die - hands, fingertips, checker gaps, the tray, the hinge - kept as background, hard negatives; 1 a die
  whose track had a gap, labelled), under 0.15 ignored. 408 frames, 803 dice. The 125 eye-die labels and 57 random scan
  labels were checked on contact sheets: all dice.

  obj-v11 = obj-v8 fine-tuned 4000 steps on the usual sets plus these (objects_train.py --exclude-heldout
  --repeat-rolls 3, BG_OBJ_SKIP=hard as obj-v8). --repeat-rolls K draws the roll frames K times as often (K=1, 3000 steps: 10/28 at
  the same hold-out, below). Hard-pale recall, a die counting when the detector's median over its rest is 0.35 or
  more, each session's dice scored by a model trained without that session's new frames (obj-v11-without-n21a for
  s1, -n21b for s3, -n2324 for s5; nothing ever trained on 15:31):
      obj-v8 0/28;  the same fine-tune without the new frames (control) 1/28;
      honest 16/28 (s1 6/11, s3 5/10, s5 5/6, 15:31 0/1);  obj-v11 itself 21/28 (it trained on the non-test ones).
  As a scan detector it is not shipped. Tracked test sets (testset_eval --track, die-ver-v1; obj-v11 in place of obj-v8,
  and in the 15:31 pair with obj-v10), shipped -> obj-v11 (the first recipe, --repeat-rolls 1, in brackets):
      Nov 21 212/212 -> 211/212 (212/212), Nov 23 65/67 -> 65/67 (65/67), Nov 24 93/93 0 false -> 89/93 4 false
      (90/93 0), 15:31 222/226 1 false -> 221/226 4 false (220/226 6); faces and cube unchanged but 15:31 cube 154/155
      with the first recipe. obj-v11 calls pale dice yellow, so Nov 24's pale red rail die becomes a
  yellow peak of 0.2 next to its yellow partner and the opening-partner rule no longer keeps it, and in the 15:31 view
  it adds dice of the wrong colour and emblem peaks. The scans and the test sets stay on obj-v8 (+obj-v10 for 15:31).

  Second opinion (second_die.py, roll_audit.py default; --no-second for the old audit). Only for a roll whose roller has
  exactly one die that landed in the window (or was not lying there 4 s before): obj-v11 is run on every 5th frame of
  that die's rest (up to 60) and on four frames 2-6 s before it landed. Its die peaks from 0.35 (either colour) are
  grouped across frames (12 px); the second die is the only group 24 px or more from the known die, seen in a sixth of
  the frames (and 5), first seen within 50 frames of the known die's landing and absent before it. Its crops are read
  by the face reader with the known die's. roll_strip.py adds a row of its crops.
  Roll audit, 477 published rolls (confirmed / disagree / without two dice / stale):
      before                                         443 / 1 / 32 / 1
      second opinion, honest folds (per session as above)  458 / 1 / 17 / 1   (15 second dice)
      second opinion, obj-v11 (shipped)              465 / 1 / 10 / 1   (22 second dice)
  Every second die lies within 12 px of the eye-found die of that roll (none elsewhere), and every one of the 22 rolls
  reads its published roll (14 rolls the move fixes, 7 eye-reviewed, 1 dice-picked: Nov 21 G9 T13 6-1). No published
  roll changes; nothing was republished. The disagreement is 15:31 G2 T50 (the irregular turn). Still without two dice:
  the 3 timing cases, the closed-out roll, and 6 pale dice obj-v11 does not keep (Nov 21 G7 T5, lying 1.4 s; G9 T9 on a
  point at the rail; Nov 24 G1 T34 top rail; G3 T10; G4 T1 red; 15:31 G1 T7 red at the bar edge, median 0.28).
  Tried, not kept: obj-v11 as the scan detector (above); the second-opinion rules as first written (fresh = landed
  25+ frames into the window, a third of the frames, landing within 30 frames): 454 instead of 460 with the first
  model, the rest of the misses being dice that landed as the window opened.

Presence from obj-v11, colour from the tracker; the audit's window fallback (Nov 25, 10:35-11:30 EST)

  obj-v11 finds pale dice that obj-v8 misses, but it reads their colour badly. die_track.py rule 7 therefore uses it
  only for where a die is (option (a) of the plan). Tracker(presence=...) takes obj-v11's raw peaks on the same frames
  and tracks them the same way. A peak of 0.2+ with no die within 26 px is added as a die when its chain (presence
  tracks continuing one another) meets all of these:
    - a median of 0.27+ over 14+ samples;
    - stays within 12 px (90th percentile);
    - started within 50 frames of exactly one strong obj-v8 track (0.8+, 10+ steps, not a continuation) 24 px or
      more away: a still die that landed with one die, so the roll's other die;
    - the base dice (rules 1-6) cover under half of the chain's samples;
    - the peak lies within 8 px of the chain's place.
  The added die takes its partner's colour. Wherever obj-v8 has a die, its die and its colour stand.
  - The cuts were set on eye-checked sheets (~/Downloads/office-3-backgammon-heldout-20261124pm/proof-20261125pm).
    Looser cuts (0.25 median, 6 samples, partner 0.75) let in false dice: an arm, a checker's emblem and the rail
    corner (15:31, medians 0.26, or 6-13 samples), and a die's own second peak 21-22 px from a base die (Nov 24 red
    dice at the bar). Without the cover and place guards, a base die's chain ran on through a gap onto stray peaks
    after the die was picked up (Nov 24 7675, 35180-35250). The 15:31 bar-edge die has a median of 0.2785, so the
    cut is close.
  - Every chain rule 7 adds on the six recordings is a real die (eye-checked): the hard-pale places and four dice
    with no hard-pale label (Nov 21 s1 61290, s3 70470 and 80350, s3 83390). Where the base kept a pale yellow die as
    red in some frames (Nov 21 G1 T5, G2 T27, G7 T29), rule 7 fills the gaps in yellow.
  - Scans: objects-scan-track4 in every work dir (die_track.py scan OBJ VER --raw objects-scan-track.raw.pkl
    --presence-raw objects-scan-track4.presence.pkl --out objects-scan-track4 --cube-out cube-scan-track4.json; the
    presence pickle is obj-v11 on every 5th frame; presence.json logs the added dice). roll_audit.py and
    roll_strip.py now default to it. The published scans (objects-scan) and the Vision overlays are unchanged.

  Test sets (testset_eval.py --track CACHE --presence CACHE; the presence caches are obj-v11 testcaches on the same
  frames):
    Nov 21 212/212, Nov 23 65/67, Nov 24 93/93, no false dice: unchanged; faces 41/41, 7/7, 17/17; cube; checkers.
    15:31 222/226 (1 false) -> 224/226 (1 false). The bar-edge red die at 5125 and 5500 (15:31 G1 T7's pale die) is
    found. Its face reads 4 against the label's 5 (cocked against the wood, half its face hidden), so die faces go
    85/85 -> 85/87.
  Hard-pale dice (labels/hard-pale-dice-20261125.json; found = the tracked scan keeps a die within 12 px on half its
  rest frames or more):
    tracked obj-v8 scan                  2/28 (colour right 1)
    rule 7, obj-v11                      21/28 (colour right 20)  s1 11/11, s3 6/10, s5 3/6, 15:31 1/1
    rule 7, held out by session          18/28 (colour right 17)  s1 10/11, s3 4/10, s5 3/6, 15:31 1/1
      (obj-v11-without-n21a for s1, -n21b for s3, -n2324 for s5; nothing trained on 15:31)
    Still missed with obj-v11: Nov 21 G7 T5, T7, T9 (dance dice that rest 1.0-1.4 s, under 14 samples: the audit's
    second opinion reads them), G7 T29 (found on 44 of 111 frames), Nov 24 G1 T34, G3 T10 and G4 T18 (1.2 s).
  Tried, not kept: obj-v11 + obj-v10 as the 15:31 presence model (bar-edge die median 0.22); a looser chain cut
  (above).

  Roll audit window fallback (roll_audit.extend, --no-extend). This applies only to a roll with fewer than two dice:
  - The window opens at the previous turn's dice pickup instead of its result. Nov 23 T14 and T16 were dances rolled
    while the board settled.
  - When none of the roll's dice is fresh, the window runs on to just before the other player's next dice land.
    Nov 24 G1 T8 is a 2-1 decoded together with the turn before it (4249) whose dice land at 4375.
  - The forward step never applies to a split window and never runs to the next result, so a dance and the next roll
    cannot share a window again (Nov 21 G9 T46/T47).
  second_die.find needs the second die in 5 frames, or all but two when the known die rests under 7 frames (Nov 23
  T16's 1.2 s dance). Its "was it lying there before" check skips the 25 frames before the known die's first
  detection, its own landing (Nov 21 G7 T5 landed as the window opened). An opening roll whose dice are all of one
  colour takes two of that colour (Nov 24 G4 T1: two red dice).
  Roll audit, 477 published rolls (confirmed / disagree / without two dice / stale):
    before (objects-scan-track3, second opinion)       465 / 1 / 10 / 1
    window fallback, objects-scan-track3               470 / 1 /  5 / 1
    window fallback, objects-scan-track4 (default)     471 / 2 /  3 / 1
  - Newly confirmed, each reading its published roll: Nov 21 G7 T5 6-3, G9 T9 6-1; Nov 23 T14 6-3, T16 5-3; Nov 24
    G1 T8 2-1, G4 T1 3-2.
  - New disagreement: 15:31 G1 T7, where the move fixes 5-5. The rule-7 pale die at the bar edge is cocked against
    the wood and reads 4 or 5 (5-4, margin 0.39); the eye read five before. The published roll stands; this is a
    reader misread.
  - No roll the dice confirmed before is contradicted, and no dice pick changes. Nothing was republished.
  - Without two dice:
      - Nov 24 G1 T38: not rolled (White was closed out).
      - Nov 24 G1 T34: a pale die on the top-rail point tip. Plainly visible, but obj-v11 scores it 0.24 and obj-v8
        0.0-0.21.
      - Nov 24 G3 T10: a pale die touching its partner, 20 px apart. Visible, but inside the 24-26 px where a die's
        own second peak lies.
    Neither die is too faint to see (proof-20261125pm/pale-still-missed.jpg), so none is left out of the scores.

Nov 27 evening (s7, published Nov 28)

  Recording ~/Downloads/office-3-wide-20261127-191603-1jzdy_b0 (19:16:03-19:31:20 EST, 16 clips), work dir
  ~/Downloads/office-3-backgammon-20261127 (session.json, PROGRESS.txt, run-vision2.sh, run-analyze.sh, run-render.sh).
  The case sits about where it did on Nov 21 but turned 180 degrees, so White's home is the camera's bottom-right and
  ref/reference.json is "mirrored" (corners fitted by ECC of the readers' view against the Nov 21 reference); the
  rectified opening position and a mid-game frame count 15 checkers a side with White's home top-right. White rolls
  yellow, Black red, cube holder on the right rail. heldout.WORK has the session as s7; no model trained on it.
  Models as for the older sessions: obs-v3 (slots-v3) for the decode, obs-v5 for the overlay, die_track.py scan
  obj-v8 + die-ver-v1 + obj-v11 presence (objects-scan-track4), faces-v9 for the dice evidence and the audit.
  decode2-v3.json decodes both games without changes (game 1 0:16-6:38, game 2 6:49-14:37).

  Read by eye and patched (all in the work dir):
  - Cube. The tracked cube moves dated game 2's double (11:04.8, Black; White takes 11:06.8) and redouble (14:08.2,
    White) about 5 s off: the cube in a hand and faint tray peaks (0.15-0.25) were replaced by stale places.
    cube-scan-eye.json is cube-scan-track4.json with 16640-16715 and 21045-21200 set from the footage; cubeThresh 0.15.
  - Game 2's last turn: Black's dance at 14:02 (red dice; one shows four by the bar, the other slid under Black's
    checker on the bar) is added to the decode (decode2-v3e.json); then White redoubles and Black passes (the cube stays
    on the board while the players clear it from 14:21). Its roll stays unresolved (4-3, 4-4, 5-4 or 6-4).
  - Game 1's end: Black's last checker comes off at 6:23.6 (9590) with White's 15 still on the board, a gammon; the
    inferred bear-off turn is dated there instead of at the decode's end.
  - reviewed-rolls-20261127.json: G1 T14 dance 2-1 (dice rest 1 s, tilted; reader's read, eye-consistent), G1 T24 5-1
    (one die shows one), G2 T7 dance 3-3, G2 T17 dance 6-4.
  Roll audit (roll_audit.py --sessions s7): 69 rolls, 62 confirmed by the dice; the 3 disagreements are reader
  misreads, eye-checked on roll_strip.py strips: G1 T11 5-1 (the board shows 12/17 and 1/2; the "four" is a five cocked
  against the rail), G1 T25 6-6 (the pair landed touching, two side-on sixes; the other track is an earlier roll's pale
  die), G2 T6 5-4 (5 and 4 landed apart, then were pushed together). Without two dice: G2 T7 and T17 (dances, eye),
  T8 2-1 (the move fixes it; one die shows one), T32 (above).
  Results: game 1 Black doubles at 1:46, White takes, Black wins a gammon, 4 points; game 2 Black doubles at 11:04,
  White takes, White redoubles to 4 at 14:08, Black passes, White wins 2. Page vision/2026-11-27, release
  office3-backgammon-20261127-v1.
