# Office-3 recording

Run the recorder on your Mac from a terminal. It needs Python 3, FFmpeg and
ffprobe on your `PATH`, and SSH key access to `rf-admin@office-3` with
passwordless `sudo`. It records video from the Office-3 wide RTSP relay through
its own SSH tunnel and audio from the Board camera's NDI feed.

From the root of the `mathewseng.github.io` checkout, install it once.

```sh
mkdir -p "$HOME/.local/bin"
install -m 755 backgammon/vision/scripts/office3-record "$HOME/.local/bin/office3-record"
install -m 644 backgammon/vision/scripts/office3_combine.py "$HOME/.local/bin/office3_combine.py"
install -m 644 backgammon/vision/scripts/office3_board_audio.py "$HOME/.local/bin/office3_board_audio.py"
```

Start, check, and stop the recording.

```sh
~/.local/bin/office3-record start
~/.local/bin/office3-record status
~/.local/bin/office3-record stop
```

- `start` hands the recording to a launchd watchdog and prints the folder
  once video is being written. The recording continues after you close the
  terminal, and the Mac stays awake while it runs. Keep it connected to
  Office-3.
- Every 30 seconds the watchdog restarts the recording if it has stopped or
  written no video for 150 seconds, and restarts Board audio if it has
  stopped. Each restart creates a new `office-3-wide-…` folder in
  `~/Downloads`. The watchdog stays on until `stop`, and its log is
  `~/.local/state/office3-record/watch.log`.
- `start` reports `Board audio: recording` once the first Board chunk
  arrives, and `status` shows how recent the newest chunk is. If Board audio
  is missing from a running recording, run `start` again to add it.
- Clips are playable MP4s with the wide video and its own soundtrack. The recorder targets 60 seconds per clip and splits on the
  camera's keyframes, so the actual lengths can vary slightly.
- Sort the clips by filename to get recording order within the folder. The
  first number is the connection attempt and the second is the clip sequence.
  A change in attempt number means the stream reconnected. The folder name
  records local start time, and the log records connection attempt times.
- `stop` turns off the watchdog and waits for FFmpeg to finish the last clip,
  which can be shorter than a minute. It leaves completed clips and the log
  in the folder. A clip cut off by a crash has no index and won't play. The
  combined export skips it.
- To record to an external drive, use
  `~/.local/bin/office3-record start --output-dir "/Volumes/Your Drive/Recordings"`.

## Board camera audio

While the wide camera records, the recorder runs the hand recorder's native NDI
audio receiver inside `rf-os-hand-recorder-1` on Office-3. It saves 5-second
WAVs with timestamp receipts in the session's `board-audio/` folder and logs to
`.board-audio.log`. If the connection drops, it reconnects every 10 seconds
until the wide recording stops. The receiver works in the container's 64 MiB
`/dev/shm`, which the hand recorder also uses, so it stops if chunks back up
there.

`stop` writes one `wide-with-board-audio.mp4` in each folder the watched
session recorded. It keeps every wide video frame and uses the
original wide soundtrack before Board capture starts and wherever Board samples
are missing. The wide MP4s and Board WAVs stay in the recording folder.

The recorder measures the Office-3 to Mac clock offset and places Board
samples against the wide video timeline. `wide-with-board-audio.sync.json`
records the clock measurement and how much of the export used each source.
Arrival timestamps establish timeline alignment. Camera and network latency
can still introduce a physical audio-to-picture offset.

If an export fails and the clips are already stopped, rerun it with
`~/.local/bin/office3-record combine` or pass a completed recording folder
as its argument. The output requires space for an additional copy of the
wide video.

## Troubleshooting

If nothing starts or a recording ends early, run `status` for the last
folder and read its `.recording.log`, or `.board-audio.log` for Board audio.
Board audio needs `rf-os-hand-recorder-1` running and free space on Office-3.
Check both with `ssh rf-admin@office-3 'df -h /; sudo docker ps'`. Check the Office-3 connection with
`ssh -o BatchMode=yes rf-admin@office-3 true`. The recorder retries dropped
streams up to twice per session. It requires 2 GiB of free space and stops
gracefully if the volume drops below that threshold. The previous wide
capture used about 5.3 GiB per hour.
