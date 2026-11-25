import sys, os
os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.6'; os.environ['PYTORCH_MPS_LOW_WATERMARK_RATIO'] = '0.5'
from ultralytics.models.yolo.obb import OBBTrainer
tr = OBBTrainer(overrides=dict(model=sys.argv[1], resume=sys.argv[1], task='obb'))
tr.train()
