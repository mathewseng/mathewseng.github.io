"""Halve an ONNX file by storing float32 weights as float16 followed by a Cast back to float32.
The graph still computes in float32 (ONNX Runtime folds the casts at load), so outputs move only by fp16 rounding."""
import sys, numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src); g = m.graph; casts, keep = [], []
for init in g.initializer:
    if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= 64:
        a = numpy_helper.to_array(init).astype(np.float16)
        keep.append(numpy_helper.from_array(a, init.name + '__fp16'))
        casts.append(helper.make_node('Cast', [init.name + '__fp16'], [init.name], to=TensorProto.FLOAT))
    else:
        keep.append(init)
del g.initializer[:]; g.initializer.extend(keep)
nodes = casts + list(g.node); del g.node[:]; g.node.extend(nodes)
onnx.checker.check_model(m); onnx.save(m, dst); print(dst)
