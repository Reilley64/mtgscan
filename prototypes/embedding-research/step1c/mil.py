
import sys, numpy as np, torch, coremltools as ct
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
class W(torch.nn.Module):
    def __init__(s, v):
        super().__init__(); s.v = v
        s.register_buffer("mean", torch.tensor(mean).view(1,3,1,1)); s.register_buffer("std", torch.tensor(std).view(1,3,1,1))
    def forward(s, x): return s.v((x - s.mean) / s.std)
tr = torch.jit.trace(W(m).eval(), torch.rand(1,3,S,S))
prog = ct.convert(tr, inputs=[ct.TensorType(name="pixels", shape=(1,3,S,S))], minimum_deployment_target=ct.target.iOS17, convert_to="milinternal")
ops = list(prog.functions["main"].operations)
sm = [i for i, o in enumerate(ops) if o.op_type == "softmax"]
print(len(ops), "softmax at", sm)
for o in ops[sm[0]-12: sm[0]+3]: print(o.op_type, o.name, [i.name for i in o.inputs.values() if hasattr(i, "name")][:3])
