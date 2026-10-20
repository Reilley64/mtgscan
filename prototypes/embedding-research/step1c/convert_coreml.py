
import sys, json, numpy as np, torch, coremltools as ct
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base
torch.set_num_threads(8)
OUT = "/tmp/embed-exp/step1c/coreml"
import os; os.makedirs(OUT, exist_ok=True)
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
class W(torch.nn.Module):
    def __init__(s, v):
        super().__init__(); s.v = v
        s.register_buffer("mean", torch.tensor(mean).view(1,3,1,1)); s.register_buffer("std", torch.tensor(std).view(1,3,1,1))
    def forward(s, x): return s.v((x - s.mean) / s.std)
w = W(m).eval()
B = int(sys.argv[1]) if len(sys.argv) > 1 else 1
x = torch.rand(B, 3, S, S)
with torch.no_grad():
    tr = torch.jit.trace(w, x)
    print("trace diff", (tr(x) - w(x)).abs().max().item(), flush=True)
sfx = "" if B == 1 else f"-b{B}"
for prec, cp in (("f32", ct.precision.FLOAT32), ("f16", ct.precision.FLOAT16)):
    if B != 1 and prec == "f32": continue
    ml = ct.convert(tr, inputs=[ct.TensorType(name="pixels", shape=(B, 3, S, S))], outputs=[ct.TensorType(name="embedding")],
                    minimum_deployment_target=ct.target.iOS17, compute_precision=cp, convert_to="mlprogram")
    ml.save(f"{OUT}/pes16-{prec}{sfx}.mlpackage"); print("saved", prec, flush=True)
    if prec == "f16":
        import coremltools.optimize.coreml as cto
        q = cto.linear_quantize_weights(ml, cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_channel")))
        q.save(f"{OUT}/pes16-w8lin{sfx}.mlpackage"); print("saved w8lin", flush=True)
        p = cto.palettize_weights(ml, cto.OptimizationConfig(global_config=cto.OpPalettizerConfig(mode="kmeans", nbits=8, granularity="per_tensor")))
        p.save(f"{OUT}/pes16-w8pal{sfx}.mlpackage"); print("saved w8pal", flush=True)
