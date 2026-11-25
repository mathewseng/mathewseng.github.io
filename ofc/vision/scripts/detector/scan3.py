"""scan3.py MODEL.onnx SESS OUTROOT [NMS]: keyframe scan with a candidate detector: OUTROOT/scan/SESS/state.jsonl + crops/ (conf>=0.2);
thumbs/ symlinked from the old scan (same keyframes)."""
import sys, os, json, time, cv2, numpy as np, onnxruntime as ort
sys.path.insert(0, os.path.dirname(__file__))
from sessions import src
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
from ofc_card_vision import OfcCardReader, rectify
model, sess, root = sys.argv[1], sys.argv[2], sys.argv[3]
ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())
r = OfcCardReader(REPO + '/profile.json', threads=2); r.profile['detector']['confidence'] = 0.1
if len(sys.argv) > 4: r.profile['detector']['nmsIou'] = float(sys.argv[4])
o = ort.SessionOptions(); o.intra_op_num_threads = 2
r.det = ort.InferenceSession(model, o, providers=['CPUExecutionProvider']); r.det_in = r.det.get_inputs()[0].name
c = r.profile['classifier']
out = f'{root}/scan/{sess}'; os.makedirs(out + '/crops', exist_ok=True)
old = os.path.realpath(os.environ.get('OFC_OLD_SCAN', ROOT + '/scan-old') + f'/{sess}/thumbs')
if not os.path.exists(out + '/thumbs'): os.symlink(old, out + '/thumbs')
ts = [json.loads(l)['t'] for l in open(os.environ.get('OFC_OLD_SCAN', ROOT + '/scan-old') + f'/{sess}/state.jsonl')]
lo, hi = ts[0] - 0.05, ts[-1] + 0.05
k = 0; started = time.time()
with open(out + '/state.jsonl', 'w') as fo:
    for t, fr in src.frames(sess, lo, hi, keyonly=True):
        img = fr.to_ndarray(format='bgr24'); rows = []
        for i, b in enumerate(r.detect(img)):
            row = dict(x=round(b['x'], 1), y=round(b['y'], 1), w=round(b['width'], 1), h=round(b['height'], 1), deg=round(b['angleDegrees'], 1), conf=round(b['detectorConfidence'], 3))
            if b['detectorConfidence'] >= 0.2:
                row['crop'] = f'{t:08.2f}_{i:02d}.jpg'
                cv2.imwrite(f"{out}/crops/{row['crop']}", rectify(img, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']), [cv2.IMWRITE_JPEG_QUALITY, 92])
            rows.append(row)
        fo.write(json.dumps(dict(t=round(t, 3), dets=rows)) + '\n'); k += 1
print('done', sess, k, round(time.time() - started), flush=True)
