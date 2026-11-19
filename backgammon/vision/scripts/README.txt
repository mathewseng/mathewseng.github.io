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
  When space is limited, --software --crf 26 keeps the same frame size and
  soundtrack with a smaller video stream. Verify the exported video and read
  the overlay at a few decision changes before publishing.


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

  To reproduce the stationary-dice review, provide the clip-specific dice
  locations and source windows from reviewed-settled-dice.json. The reader
  filters hand occlusions before pooling face probabilities. Reconstruction
  can use the result only when both verified checker boards admit multiple
  rolls and one pair clears the evidence threshold.

    python3 v4/settled-face-evidence.py v4/reviewed-settled-dice.json "$prepared-odds.json"
    OFFICE3_REPLAY_DIR="$prepared" bun v4/reconcile-reviewed-turns.mjs \
      "$previous" v4/reviewed-settled-dice.json "$prepared-odds.json"
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs
    python3 v4/settled-face-evidence.py v4/settled-face-controls.json "$prepared-controls.json"
    bun v4/verify-settled-faces.mjs "$previous" "$prepared-controls.json" "$output/settled-face-validation.json"

  Use the v16 replay as previous for this review. The control summary is
  included in the exported reports when its validation file is available.

  Reproduce the two candidate-reader trials with the manually verified dice
  and checker witnesses. Added checker strips use only clear board points;
  the source clips are disjoint between training and validation.

    python3 calibration/train_board_witnesses.py "$output/board-witness-training" \
      --holdout 16 --holdout 17 --holdout 50 \
      v4/reviewed-settled-dice.json calibration/reviewed-board-witnesses.json
    python3 calibration/train_face_tracks.py --reviewed calibration/reviewed-dice-tracks.json \
      --output "$output/dice-witness-training"

  These outputs add candidate benchmark results to Reports. Model weights
  are saved beside their validation results for further comparison.

  To apply the roll timing follow-up, start from the v17 replay. The timing
  check matches the dice from later views against the board before the roll.
  A confirmed pickup matches the empty board at both dice locations.

    python3 v4/dice-footprint-timing.py v4/dice-footprint-controls.json "$prepared-timing.json"
    OFFICE3_REPLAY_DIR="$prepared" bun v4/reconcile-reviewed-turns.mjs \
      "$previous" calibration/reviewed-board-witnesses.json '' "$prepared-timing.json"
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs
    OFFICE3_REPLAY_DIR="$prepared-handoff" bun v4/reconcile-reviewed-turns.mjs \
      "$output" v4/reviewed-fan-handoff.json
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared-handoff" bun v4/rescore.mjs 1

  Copy the timing output to dice-footprint-validation.json in the scored replay
  directory. Keep the earlier settled-face and candidate-reader benchmark results
  with the new replay so Reports can include the earlier model checks.

  Apply the next opening and bear-off review to v18 with the same timing file
  and v4/reviewed-opening-continuity.json. Rescore the complete session so
  every referenced board with a known roller has a position equity estimate.

  For the late bear-off review, apply v4/reviewed-late-bearoff.json to the v19
  replay with its output from v4/settled-face-evidence.py. This uses a clear
  result frame before the reset. The dice interval and checker result retain
  their respective times.

    python3 calibration/validate_face_blend.py calibration/reviewed-blend-controls.json \
      "$dice_witness_training/dice-track-candidate.pt" "$output/dice-blend-validation.json"

  Supply the previously trained candidate checkpoint. This check holds out
  every source clip used in the earlier dice benchmarks. Run the same command
  with calibration/reviewed-blend-followup.json and dice-blend-followup.json
  to include the second held-out sample in Reports.

  Apply v4/reviewed-physical-handoffs.json to the v20 replay with the updated
  dice footprint controls. The timing-only entries preserve the scored
  position and move. A reviewed result can move earlier when the exact
  source board matches the existing legal result. Optional reviewed checker
  steps must reach that same board under the verified roll.

  Apply v4/reviewed-roll-continuity.json to v21 with the updated footprint
  controls. Save a reviewed after-board even when the observed dice and result
  conflict. This confirms the next starting position and excludes the
  conflicting action from checker EV loss.

  The next reader trials add board and dice evidence from those source clips.
  Keep the previous trial files when exporting comparisons.

    python3 calibration/train_board_witnesses.py "$output/board-continuity-training" \
      --holdout 16 --holdout 17 --holdout 50 --holdout 9 --holdout 54 \
      v4/reviewed-settled-dice.json calibration/reviewed-board-witnesses.json \
      v4/reviewed-physical-handoffs.json v4/reviewed-roll-continuity.json
    python3 calibration/train_face_tracks.py --output "$output/dice-continuity-training" \
      --reviewed calibration/reviewed-dice-tracks.json \
      --reviewed calibration/reviewed-continuity-faces.json \
      --reviewed calibration/reviewed-blend-controls.json \
      --reviewed calibration/reviewed-blend-followup.json

  Apply v4/reviewed-board-recovery.json to v22 with the updated timing
  controls. Reviews may supersede earlier descriptions while keeping the
  historical evidence available in replay data. Recalculate checker and
  cube decisions from the corrected starting boards.

  For the later reader trials, add v4/reviewed-board-recovery.json and hold
  out clips 3 and 52 in the checker command above. Add
  --reviewed calibration/reviewed-recovery-faces.json to the dice command.

  Apply v4/reviewed-source-comparisons.json to v23 with the updated footprint
  controls. The exported review notes record the exact camera references
  for both boards. Recheck the legality and timing of each newly scored
  result against the next frozen starting board. The 5–3 in Game 3 keeps
  both witnessed boards and the legal action choices without a played grade.

  Add v4/reviewed-source-comparisons.json and hold out clips 18, 26, 27
  and 67 in the checker command above. Add
  --reviewed calibration/reviewed-source-comparison-faces.json and
  --holdout-clip 18 to the dice command. Clip 18 holds another view of the
  same test roll as clip 17. Use separate output directories for both trials.
  Evaluate the exported ONNX reader with the production detector thresholds.

    python3 calibration/validate_runtime_faces.py \
      calibration/reviewed-source-comparison-faces.json \
      "$output/dice-continuity-training/dice-track-candidate.onnx" \
      "$output/dice-continuity-training/runtime-dice-validation.json"

  To test a candidate over the full recording, keep the frame observations,
  physical tracks, and reconstruction plans in separate folders.

    python3 v2/vision.py --dice-reader "$candidate/dice-track-candidate.onnx" \
      --state-dir "$candidate/state"
    python3 v3/read_values.py --state-dir "$candidate/state" \
      --output "$candidate/value-tracks.json"
    python3 v4/observations.py --tracks "$candidate/value-tracks.json" --output "$candidate"
    python3 v4/observations.py --output "$current"
    OFFICE3_VISION_OBSERVATIONS_DIR="$candidate" OFFICE3_REPLAY_DIR="$candidate" bun v4/reconstruct.mjs --plan
    OFFICE3_VISION_OBSERVATIONS_DIR="$current" OFFICE3_REPLAY_DIR="$current" bun v4/reconstruct.mjs --plan
    bun v4/compare-turn-plans.mjs "$output" "$current" "$candidate" \
      "$output/dice-automatic-replay-validation.json"

  Report the automatic comparison before applying manual reconciliation.
  The reviewed roll count is the comparison denominator, with unknown
  reference faces excluded from the dice-pair accuracy counts.

  Apply v4/reviewed-checker-motion.json to the v24 replay. Rescore its
  confirmed turns, then refresh the temporary checker counts before rendering.

    OFFICE3_REPLAY_DIR="$prepared" bun v4/reconcile-reviewed-turns.mjs \
      "$previous" v4/reviewed-checker-motion.json
    OFFICE3_REPLAY_DIR="$scored" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs
    OFFICE3_REPLAY_DIR="$output" bun v4/refresh-checker-display.mjs "$scored"

  The checker display refresh keeps the same decisions and EV loss ledger.
  It checks observed legal stages in both directions within a roll and
  produces checker-motion-validation.json for the report. The frame export
  includes a complete temporary inventory when the point counts identify
  the bar and borne-off totals uniquely.

  Add v4/reviewed-checker-motion.json and hold out clips 30, 39 and 68 in
  the checker command above. Add
  --reviewed calibration/reviewed-checker-motion-faces.json to the face
  command. Run the production detector threshold comparison on that same
  review file. Regenerate both sides of the automatic comparison from the
  same input observations. Use v2/vision.py with its default reader and a
  separate --state-dir to generate the control.

  Apply v4/reviewed-missing-rolls.json to v25 and regenerate the footprint
  validation. The two restored turns use independently witnessed pickups and
  their full starting and ending boards. Their pips and roller are verified
  separately from where the dice landed.

    python3 calibration/train_locator_recovery.py calibration/reviewed-die-locations.json "$trial"
    python3 v2/vision.py --retain-dice-locations --state-dir "$current/labeled-locations"
    python3 v2/vision.py --retain-dice-locations --dice-locator "$trial/dice-locator-candidate.onnx" \
      --state-dir "$trial/labeled-locations"

  For each of the two runs above, feed the state directory into
  v3/read_values.py with --retain-dice-locations and an alternate --output
  track file. Then regenerate the observations and reconstruction plans
  as above. Compare the retained-location run with the original face-gated
  plan. Compare the locator trial with the retained-location plan to isolate
  the change of weights. Save the two comparisons as presence-turn-validation.json
  and locator-turn-validation.json in the scored replay directory. Repeat
  observations.py with --verify-roller-color on the locator tracks to measure
  the effect of trusting agreeing die bodies on either half of the board.
  Save the comparison with the ordinary locator plan to actor-turn-validation.json.
  Copy the crop metrics to locator-validation.json for Reports.

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


Calibrate die color and review turn order

    python3 calibration/train_dice_body.py
    python3 calibration/track_dice_body.py
    python3 v4/observations.py --output "$calibration/observations-baseline"
    python3 v4/observations.py --tracks "$calibration/value-tracks-body.json" \
      --output "$calibration/observations-body"
    OFFICE3_VISION_OBSERVATIONS_DIR="$calibration/observations-body" \
      OFFICE3_REPLAY_DIR="$candidate" bun v4/reconstruct.mjs --plan 4
    OFFICE3_REPLAY_DIR="$prepared" bun v4/reconcile-reviewed-turns.mjs "$previous"
    OFFICE3_REPLAY_DIR="$output" OFFICE3_SCORE_SOURCE="$prepared" bun v4/rescore.mjs

  Use a separate directory for the diagnostic reconstruction. The published
  reconciliation starts with the earlier scored replay and only applies the
  camera-confirmed cases in reviewed-turn-order.json. A previously scored
  move can survive a joined episode. A newly observed move is graded only
  if repeated source boards and legal play support the result.

  To continue from the scored v14 release, pass reviewed-turn-order-followup.json
  as the second argument to reconcile-reviewed-turns.mjs. Reviewed checker
  boards bind to an exact source clip and frame and must close the inventory.
  A joined roll can retain a score when those boards match the scored play.

    python3 calibration/train_face_tracks.py

  This second dice benchmark samples nearby, unoccluded frames of the same
  stationary die. It compares an individual baseline reading, pooled baseline,
  and pooled fine-tuned reader, with held-out clips and reviewed game rolls.
  Track training and results are kept alongside the other calibration artifacts.


  A follow-up using reviewed-checker-followup.json starts from scored v15.
  It can preserve the confirmed result board when multiple legal dice
  pairs fit it. These results are available in the frame data and Library
  history without a checker score.
