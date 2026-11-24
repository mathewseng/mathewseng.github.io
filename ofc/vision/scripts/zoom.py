import json, sys, cv2, numpy as np, glob
mp = json.load(open(sys.argv[1] + '/map.json'))
def find(tid):
    s = tid.rsplit('-', 1)[0]
    for t in json.load(open(f'../scan/{s}/tracks.json')):
        if t['id'] == tid: return s, t
ims = []
for n in sys.argv[3:]:
    s, t = find(mp[n]); order = np.argsort(t['cropConf'])[::-1][:3]
    row = [cv2.resize(cv2.imread(f"../scan/{s}/crops/{t['crops'][i]}"), (192, 288), interpolation=cv2.INTER_CUBIC) for i in order]
    while len(row) < 3: row.append(np.zeros_like(row[0]))
    r = np.hstack(row); cv2.putText(r, n, (4, 24), cv2.FONT_HERSHEY_SIMPLEX, .8, (0, 0, 255), 2); ims.append(r)
cv2.imwrite(sys.argv[2], np.vstack(ims) if len(ims) < 4 else np.hstack([np.vstack(ims[:len(ims)//2 + len(ims)%2]), np.vstack(ims[len(ims)//2 + len(ims)%2:] + ([np.zeros_like(ims[0])] if len(ims)%2 else []))]))
