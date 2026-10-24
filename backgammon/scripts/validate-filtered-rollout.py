#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Replay the actual native mixed-depth defect without editing frozen inputs."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile

family = Path(__file__).resolve().parents[1]
runtime = Path(os.environ.get('BG_ROLLOUT_NATIVE', '/tmp/bg-cube-study-v2'))
official = os.environ.get('GNUBG_BIN')
official_data = os.environ.get('GNUBG_DATA')
work = Path(tempfile.mkdtemp(prefix='bg-filtered-rollout-'))
fixture_path = family / 'docs/filtered-rollout-regression-input.json'
fixture = json.loads(fixture_path.read_text())
patch = family / 'engine/source/filtered-rollout-bg9.patch'
source = family / 'scripts/filtered-rollout-regression.c'
build = json.loads((runtime / 'build.json').read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


assert sha(runtime / 'gnubg-core') == build['binarySHA256']
(work / 'src').mkdir()
shutil.copyfile(runtime / 'src/eval.c', work / 'src/eval.c')
subprocess.run(['patch', '-p1', '-i', str(patch)], cwd=work, check=True)
flags = [f'-I{runtime}/src' if f == '-Isrc' else
         f'-I{runtime}/src/lib' if f == '-Isrc/lib' else f
         for f in shlex.split(build['flags'])]
subprocess.run(['cc', *flags, '-c', str(work / 'src/eval.c'), '-o', str(work / 'eval-fixed.o')], check=True)
subprocess.run(['cc', *flags, '-c', str(source), '-o', str(work / 'regression.o')], check=True)
objects = sorted(p for p in (runtime / 'obj').rglob('*.o') if p.name not in ['gnubg-core.o', 'eval.o'])
results = {}
for mode in ['before', 'after']:
    evaluator = runtime / 'obj/eval.o' if mode == 'before' else work / 'eval-fixed.o'
    binary = work / mode
    subprocess.run(['cc', str(work / 'regression.o'), str(evaluator), *map(str, objects), '-o', str(binary)], check=True)
    result = json.loads(subprocess.check_output([str(binary), fixture['original']], cwd=runtime, text=True))
    assert result['cacheEntries'] == 0
    result['binarySHA256'] = sha(binary)
    for row in result['rows']:
        # Witness is Black on roll, GNU fMove=0; board[1] is its own home-oriented row.
        assert fixture['state']['turn'] == 1
        board = row['board']
        points = [board[0][i] - board[1][23-i] for i in range(24)]
        bar = [board[0][24], board[1][24]]
        off = [15-sum(board[0]), 15-sum(board[1])]
        row['boardKey'] = ','.join(map(str, points+bar+off))
    results[mode] = result

before, after = results['before'], results['after']
assert before['selectedDepth'] == 0
assert before['selectedPositionID'] == fixture['previousPositionID']
assert after['selectedDepth'] == 2
assert after['selectedPositionID'] == fixture['expectedPositionID']
assert after['selectedScore'] == max(row['scores'][1] for row in after['rows'])
for row in before['rows']:
    other = next(r for r in after['rows'] if r['positionID'] == row['positionID'])
    assert max(abs(a-b) for a, b in zip(row['scores'], other['scores'])) <= 0.000001


def board_after(notation):
    state = fixture['state']
    points, bar, off = list(state['points']), list(state['bar']), list(state['off'])
    actor = state['turn']
    sign = 1 if actor == 0 else -1
    def point(p):
        return p if p in ['bar', 'off'] else int(p)-1 if actor == 0 else 24-int(p)
    for token in notation.split():
        m = re.fullmatch(r'([\d/*a-z]+)(?:\((\d+)\))?', token)
        assert m, token
        route = [point(p) for p in m[1].replace('*', '').split('/')]
        for _ in range(int(m[2] or '1')):
            for start, end in zip(route, route[1:]):
                if start == 'bar':
                    bar[actor] -= 1
                else:
                    points[start] -= sign
                if end == 'off':
                    off[actor] += 1
                else:
                    if points[end] == -sign:
                        points[end] = 0
                        bar[1-actor] += 1
                    points[end] += sign
    return ','.join(map(str, points+bar+off))


comparisons = []
if official and official_data:
    for depth in [0, 2]:
        commands = ['set display off', 'set sound enable off', 'set output digits 6',
                    'set output mwc off', 'set beavers 0', 'set cache 0',
                    f'set evaluation chequerplay evaluation plies {depth}',
                    'set evaluation movefilter 2 0 -1 0 0', 'set evaluation movefilter 2 1 -1 0 0',
                    f"set xgid {fixture['original']}", 'hint 1000', 'quit']
        command_file = work / f'official-{depth}.commands'
        command_file.write_text('\n'.join(commands)+'\n')
        output = subprocess.check_output([official, '-t', '-q', '-r', '-P', official_data,
                                          '-s', str(work), '-c', str(command_file)], text=True)
        (work / f'official-{depth}.txt').write_text(output)
        rows = re.findall(r'\b(\d+)\.\s+Cubeful (\d+)-ply\s+(.+?)\s+Eq\.:\s+([+\-\d.]+)', output)
        assert len(rows) == len(after['rows'])
        for rank, actual_depth, notation, equity in rows:
            assert int(actual_depth) == depth
            key = board_after(notation.strip())
            row = next(r for r in after['rows'] if r['boardKey'] == key)
            native_equity = row['scores'][depth//2]
            delta = abs(float(equity)-native_equity)
            assert delta < 0.00001, (notation, depth, equity, native_equity)
            comparisons.append({'depth': depth, 'rank': int(rank), 'move': notation.strip(),
                                'boardKey': key, 'positionID': row['positionID'],
                                'upstreamEquity': float(equity), 'nativeEquity': native_equity,
                                'difference': delta})
            if depth == 2 and int(rank) == 1:
                assert row['positionID'] == after['selectedPositionID']

# Replay only the two already-excluded validation games. The original study
# executable, inputs and samples remain untouched. This temporary harness adds
# cache disabling; the same fixed evaluator object supplies the sole policy fix.
main_source = (runtime / 'src/gnubg-core.c').read_text()
marker = '    char line[2048];'
assert main_source.count(marker) == 1
main_source = main_source.replace(marker,
    '    if(EvalCacheResize(0)!=0 || GetEvalCacheEntries()!=0)return 7;\n'+marker)
(work / 'rollout-main.c').write_text(main_source)
subprocess.run(['cc', *flags, '-c', str(work / 'rollout-main.c'), '-o', str(work / 'rollout-main.o')], check=True)
replay_binary = work / 'fixed-replay'
subprocess.run(['cc', str(work / 'rollout-main.o'), str(work / 'eval-fixed.o'),
                *map(str, objects), '-o', str(replay_binary)], check=True)
plan = json.loads((family / 'docs/cube-policy-study-v2-inputs.json').read_text())
prior_path = family / 'docs/upstream-rollout-cache-off-validation.json'
prior = json.loads(prior_path.read_text())
assert prior['cacheDisabled'] and prior['excludedFromStudy'] and prior['seed'] == fixture['seed']
replays = []
for candidate in plan['plan'][0]['candidates']:
    fields = [candidate['original'], candidate['after'], 2, fixture['seed'], 2, 2, 0, 0, 2, 2, 2, 0, 0, 1, 0]
    output = subprocess.check_output([str(replay_binary)], cwd=runtime,
                                     input='\t'.join(map(str, fields))+'\n', text=True)
    value = json.loads(next(line for line in output.splitlines() if line.startswith('{')))
    old = next(row for row in prior['results'] if row['id'] == candidate['role']+'-2ply')
    difference = value['equity']-old['upstream']['equity']
    replays.append({'role': candidate['role'], 'original': candidate['original'], 'after': candidate['after'],
                    'before': old['native'], 'afterFix': value, 'official': old['upstream'],
                    'equityDifference': difference, 'outputSHA256': hashlib.sha256(output.encode()).hexdigest()})
    if candidate['role'] == 'previous-choice':
        assert abs(difference) < 0.00001

report = {'schema': 1, 'method': 'Deterministic native checker regression. Re-link frozen engine objects twice; only eval.c changes by the published patch. Disable the ordinary evaluation cache. Preserve normal move filters. Record the chosen move/depth before and after, plus every legal candidate scored independently at 0 and 2 ply. Optional unmodified official CLI runs both depths with root filters disabled so every comparison has the advertised depth. No new accuracy sample or change to the frozen study.',
          'fixture': fixture, 'before': before, 'after': after, 'officialComparisons': comparisons,
          'officialMaxDifference': max((c['difference'] for c in comparisons), default=None),
          'patchSHA256': sha(patch), 'harnessSHA256': sha(source), 'scriptSHA256': sha(__file__),
          'inputSHA256': sha(fixture_path), 'frozenBinarySHA256': build['binarySHA256'],
          'frozenEvalObjectSHA256': sha(runtime / 'obj/eval.o'), 'fixedEvalObjectSHA256': sha(work / 'eval-fixed.o'),
          'unchangedObjects': {str(p.relative_to(runtime)): sha(p) for p in objects},
          'officialBinarySHA256': sha(official) if official else None,
          'excludedSeedReplays': {'seed': fixture['seed'], 'trialsPerCandidate': 2,
              'cacheDisabled': True, 'excludedFromStudy': True,
              'officialSourceSHA256': sha(prior_path), 'binarySHA256': sha(replay_binary),
              'harnessSHA256': sha(work / 'rollout-main.c'), 'results': replays,
              'limitations': ['Two fixed validation games are not an equity estimate or an assessment of the XG tolerance.',
                  'The remaining 13/9 difference is disclosed; captured move traces first differ at a bearoff choice whose alternatives both evaluate to exactly -1.0. The fork has deterministic tie ordering, unlike upstream.',
                  'A new independently planned study with the corrected checker policy is required to measure its effect on the 44 reply aggregate.']},
          'passed': True}
destination = family / 'docs/filtered-rollout-regression.json'
destination.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'beforeDepth': before['selectedDepth'], 'afterDepth': after['selectedDepth'],
                  'comparisons': len(comparisons), 'officialMaxDifference': report['officialMaxDifference'],
                  'passed': True, 'output': str(destination), 'logs': str(work)}))
