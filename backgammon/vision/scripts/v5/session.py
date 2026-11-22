"""Paths for one recorded Office-3 backgammon session (orange board, Nov 21 2026)."""
from pathlib import Path
import os

RECORDING = Path(os.environ.get('BG_RECORDING_DIR', Path.home() / 'Downloads/office-3-wide-20261121-190110-3o988aae'))
WORK = Path(os.environ.get('BG_WORK_DIR', Path.home() / 'Downloads/office-3-backgammon-20261121'))
COMBINED = RECORDING / 'wide-with-board-audio.mp4'
REFERENCE = WORK / 'ref/reference.json'
RECT = WORK / 'rect'
FPS = 25


def clips():
    """Readable one-minute clips in recording order (a clip cut off by a hard stop is skipped,
    matching the combined MP4, which leaves it out)."""
    import av
    out = []
    for p in sorted(RECORDING.glob('office-3-wide_0*_*.mp4')):
        try:
            with av.open(str(p)) as c: c.streams.video[0]
            out.append(p)
        except av.error.FFmpegError:
            continue
    return out
