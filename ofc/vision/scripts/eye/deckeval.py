"""deckeval.py MODEL.onnx: p(jumbo) on every saved crop of the held-out scans; caches ../deckp-TAG-SESS.npy.
Classic sessions should never say jumbo; n1532 by hand."""
import sys, os, json, numpy as np, cv2, onnxruntime as ort
model = sys.argv[1]; tag = os.path.basename(model)[:-5]
o = ort.SessionOptions(); o.intra_op_num_threads = 4
s = ort.InferenceSession(model, o, providers=['CPUExecutionProvider'])
def run(sess):
    f = f'../deckp-{tag}-{sess}.npz'
    if os.path.exists(f): z = np.load(f); return list(z['names']), z['p']
    pr = np.load(f'../scan/{sess}/probs-v3.npz'); names = list(pr['names']); P = []
    for k in range(0, len(names), 1024):
        x = np.stack([cv2.imread(f'../scan/{sess}/crops/{n}') for n in names[k:k + 1024]]).astype(np.float32) / 255
        x = np.concatenate([x, x[:, ::-1, ::-1]]); lg = s.run(None, {'images': np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(lg - lg.max(1, keepdims=True)); p = e / e.sum(1, keepdims=True); m = len(x) // 2
        P.append(np.stack([p[:m], p[m:]], 1))
    P = np.concatenate(P); np.savez_compressed(f, names=np.array(names), p=P); return names, P
for sess in ['s1836', 's0023', 'n1501', 'n1532']:
    names, P = run(sess); pj = P[:, :, 1].min(1)  # both orientations
    if sess != 'n1532':
        print(sess, len(names), ' '.join(f'>={t}: {int((pj >= t).sum())}' for t in (0.5, 0.8, 0.9, 0.95, 0.99)), flush=True)
    else:
        t = np.array([float(n.split('_')[0]) for n in names])
        for a, b, what in [(0, 1023.3, 'classic early (154 truth)'), (2520, 2719.8, 'JUMBO truth 2703'), (2719.8, 3225.4, 'classic (deck train)'),
                           (3225.4, 3494.2, 'jumbo A (train)'), (3494.2, 3745.8, 'classic B (deck train)'), (3745.8, 3937.4, 'jumbo C (train)'),
                           (3937.4, 4374.7, 'classic (fresh truth)'), (4374.7, 4600, 'JUMBO truth 4544')]:
            sel = (t >= a) & (t < b)
            print(f'n1532 {a:6.0f}-{b:6.0f} {what:26s} n={sel.sum():5d}', ' '.join(f'>={th}: {(pj[sel] >= th).mean():.3f}' for th in (0.5, 0.9, 0.95, 0.99)), flush=True)
