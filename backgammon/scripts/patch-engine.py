from pathlib import Path
import sys
p=Path(sys.argv[1])
x=p/'src/xgid.c'
s=x.read_text().replace('return getCubeInfoFromMatchStateWithBeavers(pci, pms, 3);','return getCubeInfoFromMatchStateWithBeavers(pci, pms, 0);')
x.write_text(s)
x=p/'Makefile.emcc'
s=x.read_text().replace('"_hint",','"_hint", "_bg_score", "_bg_cube", "_bg_value",').replace('-s EXPORT_ES6','-s EXPORT_ES6 -s ENVIRONMENT=web,worker,node')
x.write_text(s)
