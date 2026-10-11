"""Reproduce gap diagnostics and fit/evaluate next-stage timing from real traces.
Requires Python 3 + NumPy. No training dependency ships with the application.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
read = lambda p: json.loads((ROOT / p).read_text())
corpus = read('backgammon/data/accuracy-reference.json')
fixed = read('backgammon/docs/depth-study-results.json')
shallow = read('backgammon/data/accuracy-report.json')
trace_path = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'backgammon/docs/search-policy-traces.json')
traces = json.loads(trace_path.read_text())
if not traces.get('finishedAt') or len(traces['samples']) != len(traces['cases']):
    raise ValueError('Timing traces must be finished; incomplete observations cannot become zero.')

def quantile(values, q):
    return float(np.quantile(values, q)) if len(values) else None

def distribution(values):
    return dict(n=len(values), median=quantile(values, .5), p90=quantile(values, .9),
                mean=float(np.mean(values)) if len(values) else None)

def group(index):
    # Position, money conversion and match conversion must share their split.
    return int(hashlib.sha256(('bg-search-policy-v1:' + str(index)).encode()).hexdigest()[:8], 16) % 5

gap_rows = []
for index in range(300):
    levels = {s['settings']['plies']: s for s in fixed['samples'] if s['index'] == index}
    for depth in (2, 3):
        cur, nxt = levels[depth], levels[depth + 1]
        best = cur['candidates'][0]
        previous = shallow['rows'][index]['results']['standard']['key'] if depth == 2 else levels[2]['candidates'][0]['key']
        other = next((c for c in nxt['candidates'] if c['key'] == best['key']), None)
        if other is None:
            supplement = next(g for g in fixed['supplementalGrades'] if g['index'] == index)
            other = next(c for c in supplement['candidates'] if c['key'] == best['key'])
        gap_rows.append(dict(index=index, depth=depth, topic=cur['topic'],
                             gap=best['equity'] - cur['candidates'][1]['equity'],
                             stable=previous == best['key'], changed=best['key'] != nxt['candidates'][0]['key'],
                             gain=nxt['candidates'][0]['equity'] - other['equity']))

gap_bins = []
for depth in (2, 3):
    for lo, hi in [(0,.001),(.001,.005),(.005,.01),(.01,.02),(.02,.04),(.04,.08),(.08,float('inf'))]:
        rows = [r for r in gap_rows if r['depth'] == depth and lo <= r['gap'] < hi]
        gap_bins.append(dict(depth=depth, lower=lo, upper=hi if math.isfinite(hi) else None,
                             n=len(rows), changes=sum(r['changed'] for r in rows),
                             gainAbove005=sum(r['gain'] > .005 for r in rows)))

def next_count(levels, current):
    deep = next(l for l in levels if l['plies'] == 2)
    limit, window = (8, .08) if current['plies'] == 2 else (4, .04)
    candidates = deep['candidates']
    retained = {c['key'] for i,c in enumerate(candidates) if i < 2 or (i < limit and candidates[0]['equity']-c['equity'] <= window)}
    retained.add(current['candidates'][0]['key'])
    return len(retained)

def features(state, current, previous, count):
    n = len(current['candidates'])
    # Predict the per-candidate growth ratio, with current measured time as an
    # offset. Scaling all stage times scales the estimate on a slower device.
    unit = max(.25, current['wallMs']) / n
    prior = max(.25, previous['wallMs']) / len(previous['candidates'])
    growth = max(-4, min(4, math.log(unit/prior)))
    white = [i for i,p in enumerate(state['points']) if p > 0]
    black = [i for i,p in enumerate(state['points']) if p < 0]
    contact = any(state['bar']) or (bool(white) and bool(black) and max(white) > min(black))
    return [1, growth, math.log(n), math.log(count), int(contact), int(any(state['bar'])),
            int(state['rules']['cube']), int(state['matchLength'] > 0), int(state['dice'][0] == state['dice'][1])]

cases = {c['id']: c for c in traces['cases']}
timing_rows = []
for sample in traces['samples']:
    if sample.get('error'):
        raise ValueError(sample['error'])
    for current in sample['levels']:
        if current['plies'] not in (2, 3):
            continue
        depth = current['plies']
        following = next((l for l in sample['levels'] if l['plies'] == depth+1), None)
        censored = sample.get('censored', {})
        if following is None and censored.get('plies') != depth+1:
            continue
        previous = next(l for l in sample['levels'] if l['plies'] == depth-1)
        count = next_count(sample['levels'], current)
        base = max(.25, current['wallMs']) * count / len(current['candidates'])
        actual = following['wallMs'] if following else censored['lowerBoundMs']
        capped = min(actual, traces['stageLimitMs'])
        timing_rows.append(dict(id=sample['id'], index=sample['index'], depth=depth, topic=sample['topic'],
                                context=sample['context'], split='test' if group(sample['index']) == 0 else 'train',
                                baseMs=base, currentMs=current['wallMs'], actualMs=actual, censored=following is None,
                                x=features(cases[sample['id']]['state'],current,previous,count), y=math.log(max(.25,capped)/base),
                                nextCount=count, currentCount=len(current['candidates'])))

def fit(rows, method):
    if method == 'ratio':
        return [quantile([math.log(max(.25,min(r['actualMs'],4000))/max(.25,r['currentMs'])) for r in rows],.5)]
    if method == 'candidate-ratio':
        return [quantile([r['y'] for r in rows], .5)]
    x,y = np.array([r['x'] for r in rows]), np.array([r['y'] for r in rows])
    # Fixed ridge penalty; not tuned on the held-out 20% of positions.
    penalty = np.eye(x.shape[1]) * 3
    penalty[0,0] = 0
    return np.linalg.solve(x.T @ x + penalty, x.T @ y).tolist()

def predict(row, coefficients, method):
    if method == 'ratio':
        return max(.25,row['currentMs']) * math.exp(coefficients[0])
    exponent = coefficients[0] if method == 'candidate-ratio' else float(np.dot(row['x'], coefficients))
    return row['baseMs'] * math.exp(max(-6,min(8,exponent)))

models, evaluations = {}, []
for depth in (2, 3):
    train = [r for r in timing_rows if r['depth']==depth and r['split']=='train']
    test = [r for r in timing_rows if r['depth']==depth and r['split']=='test']
    models[str(depth)] = {}
    for method in ('ratio','candidate-ratio','regression'):
        coefficients = fit(train,method)
        # Selection uses only cross-validation within training positions.
        cv_errors=[]
        for fold in (1,2,3,4):
            inside=[r for r in train if group(r['index'])!=fold]
            outside=[r for r in train if group(r['index'])==fold]
            cv=fit(inside,method)
            cv_errors.extend(abs(math.log(max(.25,min(r['actualMs'],4000))/max(.25,min(predict(r,cv,method),4000)))) for r in outside)
        predicted = [predict(r,coefficients,method) for r in test]
        completed = [(r,p) for r,p in zip(test,predicted) if not r['censored']]
        residuals=[math.log(max(.25,r['actualMs'])/max(.25,predict(r,coefficients,method))) for r in train if not r['censored']]
        models[str(depth)][method]=dict(coefficients=coefficients,cvLogMAE=float(np.mean(cv_errors)),
                                        residualP10=quantile(residuals,.1),residualP90=quantile(residuals,.9))
        evaluations.append(dict(depth=depth,method=method,trainN=len(train),testN=len(test),testCensored=sum(r['censored'] for r in test),
                                 medianFactorError=quantile([math.exp(abs(math.log(max(.25,r['actualMs'])/max(.25,p)))) for r,p in completed],.5),
                                 p90FactorError=quantile([math.exp(abs(math.log(max(.25,r['actualMs'])/max(.25,p)))) for r,p in completed],.9),
                                 withinFactor2=sum(max(.25,r['actualMs'])/2<=p<=max(.25,r['actualMs'])*2 for r,p in completed),completedTestN=len(completed),
                                 fitWithin1sCorrect=sum((p<=1000)==(not r['censored'] and r['actualMs']<=1000) for r,p in zip(test,predicted))))

chosen={d:dict(method=min(m,key=lambda k:m[k]['cvLogMAE']),**m[min(m,key=lambda k:m[k]['cvLogMAE'])]) for d,m in models.items()}
for r in timing_rows:
    model=chosen[str(r['depth'])]
    r['predictedMs']=predict(r,model['coefficients'],model['method'])

predictions={(r['id'],r['depth']):r['predictedMs'] for r in timing_rows}
def replay(sample, gap, multiplier):
    elapsed=0;previous=None
    state=cases[sample['id']]['state']
    for level in sample['levels']:
        if previous and elapsed+level['wallMs']>1000:
            return previous,1000
        elapsed+=level['wallMs']
        if elapsed>=1000 or level['plies']==4:
            return level,elapsed
        if previous and level['plies']>=2:
            estimate=predictions.get((sample['id'],level['plies']),0)
            a,b=level['candidates'],previous['candidates']
            if gap is not None and not state['matchLength'] and len(a)>1 and len(b)>1 and a[0]['key']==b[0]['key'] and a[0]['equity']-a[1]['equity'] >= gap*(2 if state['rules']['cube'] else 1) and b[0]['equity']-b[1]['equity']>=.02 and estimate>=50:
                return level,elapsed
            if multiplier and level['wallMs']>=10 and estimate>multiplier*(1000-elapsed):
                return level,elapsed
        previous=level
    return previous,1000

# Conservative fixed threshold grid. Select on training groups only,
# requiring no >0.005 foregone improvement vs the completed one-second baseline.
# Held-out rows are evaluated later by the independent JS replay, never here.
policy_trials=[]
training_samples=[s for s in traces['samples'] if group(s['index'])!=0]
for gap in (.04,.08):
    for multiplier in (2,3,4,8,1e9):
        saved=0;misses=0;worst=0
        for sample in training_samples:
            baseline,old_ms=replay(sample,None,None)
            selected,new_ms=replay(sample,gap,multiplier)
            score=next(c['equity'] for c in baseline['candidates'] if c['key']==selected['candidates'][0]['key'])
            loss=baseline['candidates'][0]['equity']-score
            saved+=old_ms-new_ms;misses+=loss>.005;worst=max(worst,loss)
        policy_trials.append(dict(cubelessGap=gap,moneyGap=gap*2,costMultiplier=multiplier,meanSavedMs=saved/len(training_samples),missedAbove005=misses,worstForegoneGain=worst))
eligible=[p for p in policy_trials if not p['missedAbove005']]
if not eligible:
    raise ValueError('No tested stopping policy meets the training quality constraint; do not ship it.')
policy=max(eligible,key=lambda p:p['meanSavedMs'])

summary=dict(schema=1,traceSha256=hashlib.sha256(trace_path.read_bytes()).hexdigest(),
             source='search-policy-traces.json',method='Timing model selection by grouped cross-validation within 80% training positions; hash-held-out 20% are never used for fitting or model selection. All contexts of a source position share their group. Target is next-stage time capped at 4000 ms; timeouts are right-censored, not exact times. Multiplicative errors exclude censored observations. Budget classification includes them because all exceed 1000 ms. No phone measurements.',
             gapBins=gap_bins,gapRows=gap_rows,timingEvaluation=evaluations,models=models,chosen=chosen,timingRows=timing_rows,
             stoppingPolicy=policy,stoppingTrainingTrials=policy_trials)
out=ROOT/'backgammon/docs/search-policy-analysis.json'
out.write_text(json.dumps(summary,indent=2)+'\n')
model_path=ROOT/'backgammon/engine/search-model.mjs'
model_path.write_text('// Generated by scripts/analyze-search-policy.py; see docs/SEARCH-POLICY.md.\n'
                      '// Empirical estimates, not guarantees. 4000 ms-capped training target.\n'
                      'export const SEARCH_MODEL = '+json.dumps(dict(version='gap-time-v1',traceSha256=summary['traceSha256'],stageCapMs=4000,depths=chosen,policy=policy),indent=2)+';\n')
print(json.dumps(dict(chosen=chosen,evaluations=evaluations,stoppingPolicy=policy),indent=2))
