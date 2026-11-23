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
