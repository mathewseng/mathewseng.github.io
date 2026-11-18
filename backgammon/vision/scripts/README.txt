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
    bun v4/verify.mjs
    python3 v4/render.py --jobs 2
    python3 v4/verify_media.py
    python3 v4/query.py 1 --frame 25
    python3 v4/query.py 5 --seconds 748.88

The observations, reconstruction and rendering commands accept one or more game
numbers. The final MP4s live in v4/games in the artifact folder. The query resolves
the original source clip, source frame and PTS, the most recent settled checker
board, current phase, roller, dice, cube, decision and cumulative EV loss at a
25 fps game frame. The accompanying game JSON has the full EV table and
distinguishes inferred roll faces from repeated direct observations. The silent
review cards after the footage show additional action rows for that same roller.

Roll and board state

  The replay groups intermittent reads of the same stationary dice. The tracked
  rolling half, the surrounding checker positions, and complete legal turns guide
  attribution. Opening tosses and doubling-cube responses follow separate rules.
  A confirmed roll and its actor survive isolated detection failures. During
  checker movement, the counts show the last settled board until an established
  result replaces it. A recorder discontinuity starts a new evidence interval.

  Every active roll has a single actor. When the dice disappear, the status strip
  identifies the previous roll as historical until another supported roll or a
  cube response. Intervals with insufficient evidence leave the next actor
  unset. The frame audits and held dice are coverage measurements. They do not
  establish ground-truth accuracy for every turn.

  Every scored legal result is evaluated at 3 ply. The top four and supported
  played result are evaluated at 4 ply. Inferred rolls can have an estimated
  loss displayed after play. That loss is excluded from the cumulative total.
  Equities use centered-at-one cubeful money evaluation where supported and
  otherwise use cubeless equity. The reviewed redouble uses the labelled
  cube context explicitly. Match score was unavailable in the footage.

  Game 1 begins with the first captured frame and an open game. Games 2 through
  5 begin at verified opening boards. The original v2 and v3 videos and source
  footage remain in their respective Downloads folders.
