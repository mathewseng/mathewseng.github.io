"""Held-out games for the object accuracy test (dice, cube, checkers) across the orange-board sessions.

Whole games (or, on Nov 23, the second half of the one game) are held out so that a model
scored on them has seen no frame of that play. Training scripts call `held(session, frame)` to
leave these frames out (objects_train.py, train_slots.py, dice_faces.py).

Sessions use the detector's names: s1-s3 are the three Nov 21 recordings, s4 Nov 23, s5 Nov 24,
s6 Nov 24 15:31, s7 Nov 27 19:16 (no model trained on s7).
The test set itself (testset_build.py) lives in TEST_DIR, outside the repository.
"""
import json, os
from pathlib import Path

D = Path.home() / 'Downloads'
# BG_TEST_SET=new selects the second test set: the Nov 24 15:31 recording (s6), which no model was
# trained on (all of it is held out), in its own TEST_DIR.
TEST_SET = os.environ.get('BG_TEST_SET', 'old')
TEST_DIR = Path(os.environ.get('BG_TEST_DIR', D / ('office-3-backgammon-heldout-20261124pm' if TEST_SET == 'new' else 'office-3-backgammon-heldout')))

WORK = {
    's1': D / 'office-3-backgammon-20261121',
    's2': D / 'office-3-backgammon-20261121-2133',
    's3': D / 'office-3-backgammon-20261121-2219',
    's4': D / 'office-3-backgammon-20261123',
    's5': D / 'office-3-backgammon-20261124',
    's6': D / 'office-3-backgammon-20261124-1531',
    's7': D / 'office-3-backgammon-20261127',
}
DAY = {'s1': 'nov21', 's2': 'nov21', 's3': 'nov21', 's4': 'nov23', 's5': 'nov24', 's6': 'nov24pm', 's7': 'nov27'}
DAYS = ('nov24pm',) if TEST_SET == 'new' else ('nov21', 'nov23', 'nov24')

# (session, first frame, last frame, published analysis file, label)
BLOCKS = [
    ('s1', 58513, 85417, D / 'office-3-backgammon-20261121-all/analysis/game-04.json', 'Nov 21 game 4'),
    ('s3', 30351, 43662, D / 'office-3-backgammon-20261121-all/analysis/game-08.json', 'Nov 21 game 8'),
    ('s4', 3000, 9925, D / 'office-3-backgammon-20261123/analysis-v8/game-01.json', 'Nov 23 from 2:00'),
    ('s5', 29217, 44345, D / 'office-3-backgammon-20261124/analysis/game-03.json', 'Nov 24 game 3'),
]
# The second test set: every orange-board game of the Nov 24 15:31 recording (filled in by
# testset_build.py from the session's analysis folder when BG_TEST_SET=new).
NEW_ANALYSIS = D / 'office-3-backgammon-20261124-1531/analysis'
NEW_BLOCKS = []
if NEW_ANALYSIS.exists():
    for p in sorted(NEW_ANALYSIS.glob('game-*.json')):
        A = json.loads(p.read_text())
        NEW_BLOCKS.append(('s6', A['startFrame'], A['endFrame'], p, f'Nov 24 15:31 game {int(p.stem[5:])}'))
OLD_BLOCKS = BLOCKS
if TEST_SET == 'new': BLOCKS = NEW_BLOCKS
# Checker reference for a block whose published game ends before play stops (Nov 23: the players
# played the position out after the pass); the session decode keeps those turns.
CHECKER_REF = {'s4': D / 'office-3-backgammon-20261123/decode2.json'}
MARGIN = 250  # frames kept out of training on either side of a block (10 s)


def held(session, frame, margin=MARGIN):
    """True when this frame of a session lies in (or within `margin` of) a held-out block. The whole
    Nov 24 15:31 recording (s6) is held out."""
    return session == 's6' or any(s == session and a - margin <= frame <= b + margin for s, a, b, _, _ in OLD_BLOCKS)


def held_key(key, margin=MARGIN):
    s, f = key.split(':')
    return held(s, int(f), margin)


def session_of_work(work):
    work = Path(work).resolve()
    for s, w in WORK.items():
        if w.resolve() == work: return s
    return None


def board_view(session):
    ref = json.loads((WORK[session] / 'ref/reference.json').read_text())
    return 'turned' if ref.get('turned180') else 'mirrored' if ref.get('mirrored') else None


def settings(session):
    p = WORK[session] / 'session.json'
    return json.loads(p.read_text()) if p.exists() else {}


def red_player(session):
    return settings(session).get('redDice', 'dark')
