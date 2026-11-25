"""hands.py: hand intervals per session from label counts (clear = <= 1 label for >= 3 s); excluded = hands holding a truth frame."""
import json, os
ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())  # scratch: canvas/, labels/, det/, scan/
TRUTH = {'n1501': [223, 946, 1694, 707, 1309, 1469.7], 'n1532': [154, 2703, 4544, 4197.4, 4361.2]}
def hands(sess):
    F = [json.loads(l) for l in open(f'{ROOT}/labels/{sess}.jsonl')]
    ts = [f['t'] for f in F]; busy = [len(f['labels']) > 1 for f in F]
    out, start, run0 = [], None, None
    for t, b in zip(ts, busy):
        if b:
            if start is None: start = t
            run0 = None
        else:
            if run0 is None: run0 = t
            if start is not None and t - run0 >= 3: out.append((start, run0)); start = None
    if start is not None: out.append((start, ts[-1]))
    return out
def excluded(sess):
    ex = []
    for a, b in hands(sess):
        if any(a - 5 <= t <= b + 5 for t in TRUTH.get(sess, [])): ex.append((a - 10, b + 10))
    return ex
if __name__ == '__main__':
    for s in TRUTH:
        h = hands(s); print(s, len(h), 'hands; excluded', [(round(a), round(b)) for a, b in excluded(s)])
        print('  long hands', [(round(a), round(b)) for a, b in h if b - a > 60])
