import sys, os
os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.6'; os.environ['PYTORCH_MPS_LOW_WATERMARK_RATIO'] = '0.5'
import torch
from ultralytics.models.yolo.obb import OBBTrainer
from ultralytics.nn.tasks import OBBModel
data, name, init, epochs = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
lr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.002
deg = float(os.environ.get('DEG', 3)); frz = int(os.environ.get('FREEZE', 0))
args = dict(model='yolo11n-obb.yaml', task='obb', data=data, imgsz=1024, rect=True, epochs=epochs, batch=8, device='mps', workers=2,
            project=os.path.abspath('runs'), name=name, exist_ok=True, optimizer='SGD', lr0=lr, lrf=0.1, momentum=0.937, warmup_epochs=0.3,
            mosaic=0.0, close_mosaic=0, degrees=deg, freeze=frz or None, translate=0.05, scale=0.15, fliplr=0.5, flipud=0.3, hsv_h=0.01, hsv_s=0.3, hsv_v=0.25,
            patience=100, plots=False, amp=False, cache=False, val=True, save_period=1)
tr = OBBTrainer(overrides=args)
src = torch.load(init, weights_only=False)
src = src.get('ema') or src['model']
m = OBBModel(src.yaml, nc=1, verbose=False); m.load(src)
tr.model = m
tr.train()
