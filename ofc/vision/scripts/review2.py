"""Class-sorted review sheets of track representatives across sessions.
usage: review2.py TAG OUTDIR SESSIONS(comma) [CLASSES(comma)]  -> sheets + OUTDIR/map.json (tile number -> track id)"""
import json, sys, os, cv2, numpy as np
from sheet import sheet
from pseudo import track_means, CODES
ORDER = [s + r for s in 'CDHS' for r in '23456789TJQKA'] + ['none']
tag, out, sessions = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
only = sys.argv[4].split(',') if len(sys.argv) > 4 else None
per = int(os.environ.get('PER', 70))
items = []
for s in sessions:
    tr, P, M = track_means(s, tag)
    lab = json.load(open(f'../labels/{s}.json')) if os.path.exists(f'../labels/{s}.json') else {}
    for t, m in zip(tr, M):
        top = CODES[int(m.argmax())]
        if only and top not in only: continue
        if os.environ.get('NEW') and '.' not in t['id']: continue
        rep = t['crops'][int(np.argmax(t['cropConf']))]
        items.append((ORDER.index(top), -float(m.max()), t['id'], top, float(m.max()), f'../scan/{s}/crops/{rep}', lab.get(t['id'])))
items.sort()
os.makedirs(out, exist_ok=True); mp = {}
for i in range(0, len(items), per):
    chunk = items[i:i+per]; labs = []
    for j, it in enumerate(chunk):
        n = i + j; mp[n] = it[2]
        labs.append(f"{n} {it[3]} {it[4]:.2f}" + (f" [{it[6]}]" if it[6] else ''))
    sheet([cv2.imread(it[5]) for it in chunk], labs, f'{out}/{i//per:02d}.jpg')
json.dump(mp, open(f'{out}/map.json', 'w')); print(len(items), (len(items)+per-1)//per)
