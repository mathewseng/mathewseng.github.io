"""cmp.py SIM PREFIX: runtime name for each truth object at the truth frame vs the label file."""
import sys, json, re
sim = json.load(open(sys.argv[1])); pre = sys.argv[2]
d = json.load(open(pre + '-objects.json')); t = d['t']
fr = next(f for f in sim if abs(f['t'] - t) < 1e-3)
byslot = {b['slot']: b for b in fr['bodies']}; tab = {s['slotId']: s for s in fr['table']}
lab = {}
name = pre.split('/')[-1]
for line in open(f'/private/tmp/claude-501/ofc-vision/truth/labels/{name}.txt'):
    m = re.match(r'(\d+) (\S+)', line)
    if m: lab[int(m[1])] = m[2]
for o in d['objects']:
    if o['slot'] is None: rt = '(weak box)'
    elif o['slot'] in byslot: b = byslot[o['slot']]; rt = f"{b['hand']} {b['src']} view={b['card']}"
    else: rt = f"hidden {tab[o['slot']]['card']}"
    l = lab.get(o['id'], '-'); code = l.lstrip('~')
    rtn = rt.split()[1] if rt.startswith('hidden') else rt.split()[0]
    flag = '' if (code == rtn or (code.startswith('?') and ('None' in rt or 'weak' in rt)) or code == 'C?' or l.startswith('dup') and 'None' in rt) else '  <<<'
    print(o['id'], o['kind'], l, '|', rt, flag)
