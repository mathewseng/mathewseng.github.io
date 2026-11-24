"""Run an identity ONNX on every saved crop of a session (both 180-degree turns): ../scan/S/probs-TAG.npz."""
import os, sys, cv2, numpy as np, onnxruntime as ort
MASKED = os.environ.get('MASKED') == '1'
model, tag = sys.argv[1], sys.argv[2]
o = ort.SessionOptions(); o.intra_op_num_threads = 4
sess = ort.InferenceSession(model, o, providers=['CPUExecutionProvider']); inp = sess.get_inputs()[0].name
def sm(l): e = np.exp(l - l.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)
for s in sys.argv[3:]:
    names = np.load(f'../scan/{s}/probs-v3.npz')['names']; P1, P2 = [], []
    for k in range(0, len(names), 512):
        x = np.stack([cv2.imread(f'../scan/{s}/crops_m/{n}' if MASKED and os.path.exists(f'../scan/{s}/crops_m/{n}') else f'../scan/{s}/crops/{n}') for n in names[k:k + 512]]).astype(np.float32) / 255
        x = np.concatenate([x, x[:, ::-1, ::-1]]); n = len(x) // 2
        p = sm(sess.run(None, {inp: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0])
        P1.append(p[:n].astype(np.float16)); P2.append(p[n:].astype(np.float16))
    np.savez_compressed(f'../scan/{s}/probs-{tag}.npz', names=names, p1=np.concatenate(P1), p2=np.concatenate(P2))
    print(s, len(names), flush=True)
