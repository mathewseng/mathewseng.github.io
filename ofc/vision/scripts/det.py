import math, sys, cv2, numpy as np, onnxruntime as ort
CROP = (130, 190, 1781, 835)  # x0, y0, w, h of the raw 1920x1080 frame
def card_quad(cx, cy, w, h, deg):
    a = math.radians(deg); ca, sa = math.cos(a), math.sin(a)
    return np.array([(cx + dx*ca - dy*sa, cy + dx*sa + dy*ca) for dx, dy in ((-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2))], np.float32)
def rotated_nms(boxes, scores, thr):
    order = np.argsort(-scores); keep = []; sup = np.zeros(len(boxes), bool)
    rects = [((float(b[0]), float(b[1])), (float(b[2]), float(b[3])), math.degrees(float(b[4]))) for b in boxes]
    areas = boxes[:,2]*boxes[:,3]
    for i in order:
        if sup[i]: continue
        keep.append(i)
        for j in order:
            if j == i or sup[j]: continue
            k, inter = cv2.rotatedRectangleIntersection(rects[i], rects[j])
            if k == cv2.INTERSECT_NONE or inter is None: continue
            ia = cv2.contourArea(inter)
            if ia/(areas[i]+areas[j]-ia+1e-9) > thr: sup[j] = True
    return keep
class Detector:
    def __init__(self, path, conf=0.1, iou=0.5, threads=2):
        o = ort.SessionOptions(); o.intra_op_num_threads = threads
        self.s = ort.InferenceSession(path, o, providers=['CPUExecutionProvider'])
        self.inp = self.s.get_inputs()[0].name; self.conf = conf; self.iou = iou
        _, _, self.H, self.W = self.s.get_inputs()[0].shape
    def __call__(self, frame):
        x0, y0, w, h = CROP
        img = frame[y0:y0+h, x0:x0+w]
        s = min(self.W/w, self.H/h); sw, sh = round(w*s), round(h*s)
        small = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
        canvas = np.full((self.H, self.W, 3), 114, np.uint8)
        ox, oy = (self.W-sw)//2, (self.H-sh)//2
        canvas[oy:oy+sh, ox:ox+sw] = small
        x = canvas[:, :, ::-1].transpose(2,0,1)[None].astype(np.float32)/255
        out = self.s.run(None, {self.inp: x})[0][0]
        sel = out[4] >= self.conf
        if not sel.any(): return []
        boxes, scores = out[[0,1,2,3,5]][:, sel].T.copy(), out[4][sel]
        res = []
        for i in rotated_nms(boxes, scores, self.iou):
            cx, cy, bw, bh, ang = boxes[i]
            cx = (cx-ox)/s + x0; cy = (cy-oy)/s + y0; bw /= s; bh /= s; deg = math.degrees(ang)
            if bw > bh: bw, bh, deg = bh, bw, deg+90
            deg = (deg+90) % 180 - 90
            res.append(dict(x=float(cx), y=float(cy), w=float(bw), h=float(bh), deg=float(deg), conf=float(scores[i])))
        return res
def rectify(img, quad, ow=64, oh=96, margin=0.06):
    q = np.asarray(quad, np.float32); c = q.mean(0); q = c + (q-c)*(1+margin)
    dst = np.array([[0,0],[ow,0],[ow,oh],[0,oh]], np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(q, dst), (ow, oh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
def draw(frame, dets, labels=None):
    out = frame.copy()
    for i, d in enumerate(dets):
        q = card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']).astype(np.int32)
        cv2.polylines(out, [q], True, (0,255,0) if d['conf'] > .3 else (0,200,255), 2)
        t = labels[i] if labels else f"{d['conf']:.2f}"
        cv2.putText(out, t, (int(d['x'])-20, int(d['y'])), cv2.FONT_HERSHEY_SIMPLEX, .5, (0,255,255), 2)
    return out
if __name__ == '__main__':
    det = Detector(sys.argv[1])
    for p in sys.argv[2:]:
        f = cv2.imread(p); d = det(f)
        print(p, len(d), [round(x['conf'],2) for x in d])
        cv2.imwrite(p.replace('.jpg','-det.jpg'), draw(f, d))
