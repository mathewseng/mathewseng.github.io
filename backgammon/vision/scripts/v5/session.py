"""Paths for one recorded Office-3 backgammon session (orange board, Nov 21 2026)."""
from pathlib import Path
import os

RECORDING = Path(os.environ.get('BG_RECORDING_DIR', Path.home() / 'Downloads/office-3-wide-20261121-190110-3o988aae'))
WORK = Path(os.environ.get('BG_WORK_DIR', Path.home() / 'Downloads/office-3-backgammon-20261121'))
COMBINED = RECORDING / 'wide-with-board-audio.mp4'
REFERENCE = WORK / 'ref/reference.json'
RECT = WORK / 'rect'
FPS = 25


def settings(work=None):
    """The work dir's optional session.json: how this session differs from Nov 21 (see analyze.mjs)."""
    import json
    p = Path(work or WORK) / 'session.json'
    return json.loads(p.read_text()) if p.exists() else {}


def red_player(work=None):
    """Who rolls the red dice: Black on Nov 21; session.json "redDice" when the players swapped."""
    return settings(work).get('redDice', 'dark')


def board_turned():
    """True when the board sits turned 180 degrees from the Nov 21 setup: the reference corners
    are then listed rotated by two so the rectified board keeps White's home top-right, and
    the checker reader reads each frame turned back (its slot model learned the Nov 21 view)."""
    return board_view() == 'turned'


def board_view():
    """How the rectified board differs from the Nov 21 view the readers learned: None (as on
    Nov 21), 'turned' (reference.json "turned180": the board turned 180 degrees) or 'mirrored'
    (reference.json "mirrored": the players set the checkers up the other way round, so the
    corners are listed mirrored to keep White's home top-right)."""
    import json
    ref = json.loads(REFERENCE.read_text()) if REFERENCE.exists() else {}
    return 'turned' if ref.get('turned180') else 'mirrored' if ref.get('mirrored') else None


def reader_view(img, view):
    """The rectified image as the readers learned it (Nov 21 orientation)."""
    if view == 'turned': return img[::-1, ::-1].copy()
    if view == 'mirrored': return img[:, ::-1].copy()
    return img


def reader_xy(x, y, w, h, view):
    """A position in reader_view back on the rectified board (the map is its own inverse)."""
    if view == 'turned': return w - 1 - x, h - 1 - y
    if view == 'mirrored': return w - 1 - x, y
    return x, y


def display_x(x, view, w=800):
    """Canonical x on the replay video's board. A mirrored board is shown as the camera saw it
    (the canonical board flipped back); a turned board is shown turned, which is still a real view."""
    return w - 1 - x if view == 'mirrored' else x


def reader_points(view):
    """Index map: the reading of point i on the rectified board is reading [order[i]] of
    reader_view. Turned: point q reads as q + 12. Mirrored: 1-12 read as 13 - q, 13-24 as 37 - q."""
    import numpy as np
    i = np.arange(24)
    if view == 'turned': return (i + 12) % 24
    if view == 'mirrored': return np.where(i < 12, 11 - i, 35 - i)
    return i


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
