"""export.py CKPT.pt OUT.onnx: ONNX with the shipped layout (1x3x480x1024 -> 1x6xN)."""
import sys, shutil, torch
from ultralytics import YOLO
ck = torch.load(sys.argv[1], weights_only=False)
m = (ck.get('ema') or ck['model']).float()
ck2 = {'model': m, 'train_args': {'task': 'obb', 'imgsz': 1024}}
m.args = {'task': 'obb', 'imgsz': 1024}
torch.save(ck2, sys.argv[2] + '.tmp.pt')
y = YOLO(sys.argv[2] + '.tmp.pt', task='obb')
p = y.export(format='onnx', imgsz=(480, 1024), opset=17, simplify=True, batch=1)
shutil.move(p, sys.argv[2])
