"""Rebuild a trainable ultralytics YOLO11n-OBB checkpoint from the shipped (BN-fused, fp16-stored) card-body.onnx.
Each fused conv (W, b) becomes conv W + BatchNorm with running stats (mu, var) measured on real frames and
gamma = sqrt(var+eps), beta = mu + b, so eval output is exact and train-mode batch stats start close.
usage: onnx2pt.py BODY.onnx OUT.pt FRAMES_DIR(1024x480 jpgs)"""
import sys, glob
import numpy as np, onnx, torch, cv2
from onnx import numpy_helper
from ultralytics.nn.tasks import OBBModel
from ultralytics.nn.modules import Conv

src, out, frames = sys.argv[1:4]
m = onnx.load(src)
W = {}
for i in m.graph.initializer:
    if i.name.startswith('model.'):
        W[i.name.replace('__fp16', '')] = torch.from_numpy(numpy_helper.to_array(i).astype(np.float32))
model = OBBModel('yolo11n-obb.yaml', nc=1, verbose=False)
sd = model.state_dict()
used = set()
convs = {n: mod for n, mod in model.named_modules() if isinstance(mod, Conv)}
with torch.no_grad():
    for n, mod in convs.items():
        w, b = W[n + '.conv.weight'], W[n + '.conv.bias']
        mod.conv.weight.copy_(w); used |= {n + '.conv.weight', n + '.conv.bias'}
        mod.bn.running_mean.zero_(); mod.bn.running_var.fill_(1 - mod.bn.eps)
        mod.bn.weight.fill_(1.0); mod.bn.bias.copy_(b)
    for k, v in W.items():
        if k in used: continue
        assert k in sd, k
        P = dict(model.named_parameters()); P.update(dict(model.named_buffers())); sd_t = P[k]
        sd_t.copy_(v.reshape(sd_t.shape)); used.add(k)
assert used == set(W), set(W) - used
# calibrate BN running stats on real frames (eval mode -> outputs exact regardless)
stats = {}
hooks = []
for n, mod in convs.items():
    def hk(mm, inp, outp, n=n):
        x = outp.detach().double()
        s = stats.setdefault(n, [0, 0, 0])
        s[0] += x.sum((0, 2, 3)); s[1] += (x * x).sum((0, 2, 3)); s[2] += x.numel() / x.shape[1]
    hooks.append(mod.conv.register_forward_hook(hk))
model.eval()
files = sorted(glob.glob(frames + '/*.jpg'))[:64]
with torch.no_grad():
    for f in files:
        im = cv2.imread(f)[:, :, ::-1].copy()
        x = torch.from_numpy(im).permute(2, 0, 1)[None].float() / 255
        model(x)
for h in hooks: h.remove()
with torch.no_grad():
    for n, mod in convs.items():
        s0, s1, c = stats[n]
        mu = (s0 / c); var = (s1 / c - mu * mu).clamp(min=1e-6)
        b = mod.bn.bias.clone()
        mod.bn.running_mean.copy_(mu.float()); mod.bn.running_var.copy_(var.float())
        mod.bn.weight.copy_(torch.sqrt(var + mod.bn.eps).float()); mod.bn.bias.copy_((mu.float() + b))
model.names = {0: 'card'}
model.args = {'task': 'obb', 'imgsz': 1024}
torch.save({'model': model.half() if False else model, 'train_args': {}, 'date': None, 'version': '8.3.63', 'epoch': -1,
            'optimizer': None, 'best_fitness': None, 'ema': None, 'updates': 0}, out)
print('saved', out, len(files), 'calibration frames')
