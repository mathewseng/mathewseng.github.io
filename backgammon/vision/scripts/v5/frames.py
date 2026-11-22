"""Map global session frame numbers (25 fps) to rectified clip frames."""
import json
from functools import lru_cache
import av, numpy as np
from session import RECT, WORK, clips


@lru_cache(None)
def offsets():
    cache = WORK / 'clip-frames.json'
    if cache.exists():
        counts = json.loads(cache.read_text())
    else:
        counts = [av.open(str(p)).streams.video[0].frames for p in clips()]
        cache.write_text(json.dumps(counts))
    return np.concatenate([[0], np.cumsum(counts)]).astype(int)


def locate(n):
    o = offsets(); clip = int(np.searchsorted(o, n, side='right') - 1)
    return clip, int(n - o[clip])


def total():
    return int(offsets()[-1])


def read(numbers):
    """Yield (global frame, rectified BGR image) for sorted frame numbers."""
    numbers = sorted(numbers)
    by_clip = {}
    for n in numbers:
        c, i = locate(n); by_clip.setdefault(c, []).append((i, n))
    for c, wanted in sorted(by_clip.items()):
        want = dict(wanted); last = max(want)
        with av.open(str(RECT / f'clip-{c:03d}.mp4')) as box:
            for i, f in enumerate(box.decode(video=0)):
                if i in want: yield want[i], f.to_ndarray(format='bgr24')
                if i >= last: break
