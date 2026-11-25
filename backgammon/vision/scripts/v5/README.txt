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
