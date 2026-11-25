import sys, glob, numpy as np, torch, cv2, onnxruntime as ort
ck = torch.load(sys.argv[2], weights_only=False)['model'].float().eval()
sess = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider'])
for f in sorted(glob.glob(sys.argv[3] + '/*.jpg'))[::10]:
    im = cv2.imread(f)[:, :, ::-1].copy(); x = torch.from_numpy(im).permute(2, 0, 1)[None].float() / 255
    with torch.no_grad(): a = ck(x)[0][0].numpy()
    b = sess.run(None, {'images': x.numpy()})[0][0]
    sel = b[4] > 0.1
    print(f[-20:], a.shape, b.shape, 'maxdiff conf', np.abs(a[4] - b[4]).max(), 'box', np.abs(a[:4, sel] - b[:4, sel]).max(), 'ang', np.abs(a[5, sel] - b[5, sel]).max(), sel.sum())
