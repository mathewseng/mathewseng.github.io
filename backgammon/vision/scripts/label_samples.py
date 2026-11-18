#!/usr/bin/env python3
"""Transcribe reviewed close-ups into source-linked labels. Omitted IDs were ambiguous."""
from pathlib import Path
import json

from project_paths import ARTIFACT_DIR

WORK = ARTIFACT_DIR
HOLDOUT = {19,20,21,22,23,24,48,49,50,51,52,69,70,71,72}
DARK = {
    0: [2,28,29,33,36,39,40,44,46,47,48,49,52,53,54,56,60,61,64,67,71,72,73,74,75,76,77,78,80,81,82,85,86,87,88,89],
    1: [0,1,4,10,13,14,18,20,25,32,50,57,59,79],
    2: [3,5,11,12,16,17,22,41,45,55,70],
    3: [9,27,31,37,62,66,69,84],
    4: [15,35,42,43,51,58,63],
    5: [],
    6: [8,19,26,68],
}
LIGHT_PROPOSALS = {
    0: [1,2,3,4,5,7,8,9,11,12,14,16,17,22,24,25,26,28,29,33,36,37,42,43,50,51,56,59,61,62,63,66,67,68,73,80,83,84,88],
    1: [58],
    2: [],
    3: [46,54,76,85],
    4: [38,41,49,52,71,72,89],
    5: [],
    6: [0,6,10,13,21,27,31,35,40,64,75],
}
WHITE = {
    0: [43,60,62,63,88,92,95,112],
    1: [11,12,15,18,26,29,34,50,56,58,61,64,65,66,71,81,82,86,87,93,102,104,107],
    2: [16,23,38,41,42,45,46,55,91],
    3: [4,7,8,14,33,39,40,49,51,52,70,80,94,97,100,106,111,116,118],
    4: [3,24,25,27,31,32,54,59,69,74,101,103,105,117],
    5: [9,10,30,67,90,98],
    6: [0,2,5,20,21,47,75,76,77,78,79,83,89,96,99,108,113,114],
}


def read(name):
    return json.loads((WORK/'review'/f'{name}.json').read_text())


def write(name, rows):
    target = WORK/'labels'
    target.mkdir(exist_ok=True)
    (target/f'{name}.json').write_text(json.dumps(rows,indent=2)+'\n')
    print(name,len(rows), 'held out',sum(row['split']=='test' for row in rows))


def row(key,x,y,value,color,source):
    return {'image':key, 'center':[x,y],'value':value,'color':color,'source':source,
            'split':'test' if int(key.split('_')[0]) in HOLDOUT else 'train'}


def main():
    dice = []
    for name,groups in [('dice-dark',DARK),('dice-light',LIGHT_PROPOSALS),('white-real',WHITE)]:
        pool=read(name)
        for face, indices in groups.items():
            for i in indices:
                c=pool[i]
                key,x,y=(c[0],c[3],c[4]) if name=='white-real' else c[:3]
                color = 'white' if name=='white-real' else 'dark' if name=='dice-dark' else None
                if name=='white-real' and i==5:
                    color='dark'
                dice.append(row(key,x,y,face,color,name))
    write('dice',dice)
    ids64 = [0,1,2,11,12,13,*range(15,27),*range(36,41),68,69]
    ids2 = [14,*range(27,36),*range(56,68)]
    cube_rows=read('cube-candidates')
    cubes=[row(*cube_rows[index],face,'white','cube-candidates') for face,ids in [(64,ids64),(2,ids2)] for index in ids]
    # The cube stays in the same orientation within these two periods. Only
    # the side and existence can be safely annotated from these top-face pixels.
    cubes.extend(row(*cube_rows[index],None,'white','cube-candidates')
                 for index in [*range(3,11),*range(41,56)])
    write('cube',cubes)


if __name__=='__main__':
    main()
