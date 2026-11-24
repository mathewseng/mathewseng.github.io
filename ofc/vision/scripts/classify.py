"""Run an identity classifier ONNX over every crop of a session's tracks; save per-crop probabilities."""
import json, sys, cv2, numpy as np, onnxruntime as ort
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK'] + ['none']
def load(path):
    s = ort.InferenceSession(path, providers=['CPUExecutionProvider']); n = s.get_inputs()[0].name
    def run(x):
        l = s.run(None, {n: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(l - l.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)
    return run
def probs(run, ims, avg180=True):
    out = []
    for i in range(0, len(ims), 256):
        x = np.stack(ims[i:i+256]).astype(np.float32) / 255
        p = run(x)
        if avg180: p = (p + run(np.ascontiguousarray(x[:, ::-1, ::-1]))) / 2
        out.append(p)
    return np.concatenate(out) if out else np.zeros((0, 53))
if __name__ == '__main__':
    model, tag = sys.argv[1], sys.argv[2]
    run = load(model)
    for s in sys.argv[3:]:
        tracks = json.load(open(f'../scan/{s}/tracks.json'))
        names = [c for t in tracks for c in t['crops']]
        ims = [cv2.imread(f'../scan/{s}/crops/{c}') for c in names]
        p = probs(run, ims)
        np.savez_compressed(f'../scan/{s}/probs-{tag}.npz', names=np.array(names), p=p.astype(np.float16))
        print(s, len(names))
