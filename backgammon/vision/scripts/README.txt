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
    python3 v4/render.py --jobs 2
    python3 v4/verify_media.py
    python3 v4/export_audit.py ../audit
    bun v4/export-history.mjs ../history
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
  actions contribute when they occur. Centered, one-unit checker contexts use
  cubeful money equity. Checker contexts
  where ownership is unknown use cubeless equity. The reviewed cube offers use
  their visible stake and ownership context directly.

  Point badges follow individually supported legal checker steps. A saturated
  five-checker reading is a lower bound for a taller stack. The forecast stays
  attached to the settled position. An identified pickup gates the next
  player in the timeline. Uniquely constrained dice are recovered from the
  completed checker move. The audit sidecars report the original frame-level
  vision detections and expose the difference from the inferred replay state.

  Game 1 begins with the first captured frame and an open game. Games 2 through
  5 begin at verified opening boards. The original v2 and v3 videos and source
  footage remain in their respective Downloads folders.
