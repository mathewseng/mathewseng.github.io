import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'eye'))
import src
OLD = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/ofc/')
src.SESS.update({'s1524': [(OLD + 'ofc-20261123-1524-starts-0800.mp4', 0, 1e9)], 's1931': [(OLD + 'ofc-20261123-1931-no-board-audio.mp4', 0, 1e9)],
                 's1953': [(OLD + 'ofc-20261123-1953.mp4', 0, 1e9)], 's2310': [(OLD + 'ofc-20261123-2310-three-players.mp4', 0, 1e9)],
                 'stud': [(OLD + 'ofc-20261124-0023.mp4', 0, 1e9)]})
frame_at = src.frame_at
