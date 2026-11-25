"""rotprobs.py SESS: v3 probabilities of every scanned crop turned 90 deg (and its 180 turn) -> scan-rot/SESS.npz (p1, p2, names)."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import sys, os, json, numpy as np, cv2, onnxruntime as ort
s = sys.argv[1]; model = sys.argv[2] if len(sys.argv) > 2 else RT + '/models/card-identity.onnx'
tag = sys.argv[3] if len(sys.argv) > 3 else 'v3'
o = ort.SessionOptions(); o.intra_op_num_threads = 4
sess = ort.InferenceSession(model, o, providers=['CPUExecutionProvider'])
pz = np.load(f'scan/{s}/probs-v3.npz'); names = list(pz['names'])
P1, P2 = [], []
for i in range(0, len(names), 512):
    cr = [cv2.resize(cv2.rotate(cv2.imread(f'scan/{s}/crops/{n}'), cv2.ROTATE_90_CLOCKWISE), (64, 96)) for n in names[i:i + 512]]
    x = np.stack(cr).astype(np.float32) / 255; x = np.concatenate([x, x[:, ::-1, ::-1]]); n = len(cr)
    l = sess.run(None, {sess.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
    if tag == 'v3' or l.max() > 0:
        e = np.exp(l - l.max(1, keepdims=True)); p = e / e.sum(1, keepdims=True)
    else: p = np.exp(l)
    P1.append(p[:n]); P2.append(p[n:])
os.makedirs('scan-rot', exist_ok=True)
np.savez_compressed(f'scan-rot/{s}-{tag}.npz', p1=np.concatenate(P1), p2=np.concatenate(P2), names=np.array(names))
print('done', s, len(names))
