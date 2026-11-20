# Office-3 wide camera recording

Run the recorder on your Mac from a terminal. It needs Python 3, FFmpeg on
your `PATH`, and SSH key access to `rf-admin@office-3`. It uses the
Office-3 wide RTSP relay through its own SSH tunnel.

From the root of the `mathewseng.github.io` checkout, install it once.

```sh
mkdir -p "$HOME/.local/bin"
install -m 755 backgammon/vision/scripts/office3-record "$HOME/.local/bin/office3-record"
```

Start, check, and stop the recording.

```sh
~/.local/bin/office3-record start
~/.local/bin/office3-record status
~/.local/bin/office3-record stop
```

- Each start creates a new `office-3-wide-…` folder in `~/Downloads` and
  prints its path once video is being written. The recorder continues after
  you close the terminal. Keep your Mac awake and connected to Office-3.
- Clips are playable MP4s with the camera video and audio when the feed
  provides it. The recorder targets 60 seconds per clip and splits on the
  camera's keyframes, so the actual lengths can vary slightly.
- Sort the clips by filename to get recording order within the folder. The
  first number is the connection attempt and the second is the clip sequence.
  A change in attempt number means the stream reconnected. The folder name
  records local start time, and the log records connection attempt times.
- `stop` waits for FFmpeg to finish the last clip, which can be shorter than
  a minute. It leaves completed clips and the log in the folder.
- To record to an external drive, use
  `~/.local/bin/office3-record start --output-dir "/Volumes/Your Drive/Recordings"`.

If nothing starts or a recording ends early, run `status` for the last
folder and read its `.recording.log`. Check the Office-3 connection with
`ssh -o BatchMode=yes rf-admin@office-3 true`. The recorder retries dropped
streams up to twice per session. It requires 2 GiB of free space and stops
gracefully if the volume drops below that threshold. The previous wide
capture used about 5.3 GiB per hour.
