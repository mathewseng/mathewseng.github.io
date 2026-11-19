Office-3 backgammon analysis

The source is a standalone project. The rectified board clips, original camera
recordings, trained weights, and generated state/video files remain in Downloads.

    OFFICE3_ARTIFACT_DIR    ~/Downloads/office-3-backgammon-20261117
    OFFICE3_RECORDING_DIR   ~/Downloads/office-3-wide-20261117-185027
    OFFICE3_CALIBRATION_REPO  ~/Documents/GitHub/gigarepo

The calibration repo supplies the existing perspective-unwarp and board-tracking
helpers used upstream. The artifact folder contains the already archived
mathewseng.github.io GNUbg solver at revision
57fc7047d6e09e6962f407373c59605a8e7e669f. It also contains the original input
evidence under v2 and v3. Python dependencies are in requirements.txt.
The replay uses Bun, FFmpeg/FFprobe, PyAV and Pillow. VideoToolbox is the default
encoder on the recording Mac. Use --software for libx264.

Rebuild or inspect the current replay from this directory.

    python3 v4/observations.py
    bun v4/reconstruct.mjs
    bun v4/refine-replay.mjs
    bun v4/rescore.mjs
    bun v4/verify.mjs
    bun v4/presentation.mjs
    python3 v4/verify_presentation.py
    python3 v4/render.py --jobs 2
    python3 v4/verify_media.py
    python3 v4/export_audit.py ../audit
    bun v4/export-history.mjs ../history
    bun v4/export-frame-data.mjs ../state
    bun v4/verify-exports.mjs ..
    bun v4/export-reports.mjs ..
    python3 v4/query.py 1 --frame 25
    python3 v4/query.py 5 --seconds 748.88

The observations, reconstruction and rendering commands accept one or more game
numbers. The final MP4s live in v4-4ply/games in the artifact folder. The query resolves
the original source clip, source frame and PTS, the most recent settled checker
board, current phase, roller, dice, cube, decision and cumulative EV loss at a
25 fps game frame. The accompanying game JSON has the full EV table and
distinguishes inferred roll faces from repeated direct observations. The video shows the five highest ranked checker moves.

Roll and board state

  The replay groups intermittent reads of the same stationary dice. The tracked
  rolling half, the surrounding checker positions, and complete legal turns guide
  attribution. Opening tosses and doubling-cube responses follow separate rules.
  A confirmed roll and its actor survive isolated detection failures. During
  checker movement, the counts show the last settled board until an established
  result replaces it. A recorder discontinuity starts a new evidence interval.

  Every active roll has a single actor. Roll history stays in the frame state
  when the dice leave the board. Intervals with insufficient evidence leave the
  next actor unset. The frame audit shows detection coverage. The reviewed
  Game 2 pass closes the game before the reset and preserves the final totals.

  The final scorer evaluates every legal result and position at four ply. It
  reuses exact four-ply outputs for unchanged XGIDs. The EV display omits search
  depth. A legal played move contributes once, when it reproduces the observed
  resulting board. Its caption stays visible for two seconds. Confirmed cube
  actions contribute when they occur. Checker and position analysis uses the
  centered cube or the confirmed recipient’s owned cube when available.
  Positions with unresolved ownership use cubeless equity. The reviewed cube offers use
  their visible stake and ownership context directly.

  Point badges follow individually supported legal checker steps. A saturated
  five-checker reading is a lower bound for a taller stack. The forecast stays
  attached to the settled position. An identified pickup gates the next
  player in the timeline. Presentation intervals follow the same physical dice
  through temporary occlusions and clear them at the supported pickup or next
  boundary. The opening cue stays until play begins. Cube offers and replies
  use a two-second action display. Each legal cube opportunity with a
  supported pre-roll board and cube owner is scored, including no double.
  Its EV and loss stay alongside the checker options. The totals keep
  checker and cube losses separate.
  The fixed pre-roll board and the stable result board constrain dice through
  complete legal turns. Backfill resolved dice to the start of the physical
  roll. The public frame data includes both checker snapshots when supported.
  The audit sidecars retain the original frame-level vision detections.
  Source-anchored observations in v4/reviewed_endings.json mark resets and
  the Game 5 pack-up. The latter establishes an inferred pass. Keep the
  recording running through cleanup without carrying live game graphics over it.

  Game 1 begins with the first captured frame and an open game. Games 2 through
  5 begin at verified opening boards. The original v2 and v3 videos and source
  footage remain in their respective Downloads folders.


Refresh an existing reconstructed replay

  An existing four-ply replay with presentation intervals can be rescored
  without running the camera model again. Use a separate output directory to
  keep the original playback files.

    OFFICE3_REPLAY_DIR="$prepared" bun v4/recover-settled.mjs "$previous"
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs
    export OFFICE3_REPLAY_DIR="$output"
    bun v4/verify.mjs
    python3 v4/verify_presentation.py
    bun v4/export-history.mjs ../history
    bun v4/export-frame-data.mjs ../state
    bun v4/verify-exports.mjs ..
    bun v4/export-reports.mjs ..
    python3 v4/render.py --jobs 3
    python3 v4/verify_media.py

  Here previous is the input replay folder, prepared is an intermediate
  folder, and output is the new replay folder. Recovery verifies stable
  camera boards and keeps the existing roll intervals. Four-ply scores are
  reused only when both XGIDs match the complete evaluation context.

  To refresh cube decisions in an existing replay, set OFFICE3_REPLAY_DIR
  to a new output and run bun v4/cube-rolls.mjs "$previous". To reproduce
  the Game 3 correction, run v4/recover-opening.mjs against this cube-scored
  replay with OFFICE3_REPLAY_DIR set to a separate staging folder. Run
  v4/rescore.mjs 3 against that staging folder via OFFICE3_SCORE_SOURCE.
  Publication verifies the roll snapshots, action totals and Library backup.

  Apply the reviewed endings to an existing replay with
  OFFICE3_REPLAY_DIR="$output" bun v4/accounting.mjs "$previous".
  Render that output with --software for the compact H.264 export.


Refresh the context and reviewed episodes

  A stable checker inventory uses tray evidence, the last settled board, and
  physically adjacent tall-stack detections. Repeated, co-visible dice faces
  can replace a roll previously derived from checker movement. Verified
  short fans may have an unresolved face and cannot incur checker EV loss.

    OFFICE3_REPLAY_DIR="$prepared" bun v4/recover-context.mjs "$previous"
    OFFICE3_REPLAY_DIR="$scored" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs
    OFFICE3_REPLAY_DIR="$reviewed" bun v4/review-episodes.mjs "$scored"
    OFFICE3_REPLAY_DIR="$prepared" bun v4/repair-reviewed-handoffs.mjs "$reviewed"
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs

  The source-frame review notes for a continuous roll and short fans live in
  v4/reviewed_episodes.json. Apply them only to the corresponding Office-3
  session. Export state, history and reports from the same output directory.

Manual reader calibration

    python3 calibration/sample.py
    python3 calibration/train.py

  The sampler writes board-only contact sheets, crops and provenance to
  calibration/ in the artifact folder. labels.json records the reviewed die
  face or signed checker count for each local sample and leaves unreadable
  targets as ?. The test clips are held out of fine-tuning. The two candidate
  weight files and a per-sample validation JSON are saved alongside the crops.
  The released replay continues to use the existing readers. The small
  benchmark is biased toward difficult detections and includes nearby frames
  from the same physical episode, so its counts describe reviewed patches.


  To benchmark the full reader pipeline while retaining the analyzed evidence,
  use a separate observations directory:

    python3 v2/vision.py --start 39 --stop 40 --jobs 1 \
      --dice-reader "$calibration/dice-candidate.onnx" \
      --checker-reader "$calibration/checkers-candidate.onnx" \
      --state-dir "$calibration/candidate-state"

  Here calibration is the generated calibration directory in Downloads.
  Omit start and stop to analyze all source clips.
  The reviewed comparison uses raw states from source clips 39 and 67.
  Run both through the candidate before exporting the model spot checks:

    python3 calibration/verify_spots.py
