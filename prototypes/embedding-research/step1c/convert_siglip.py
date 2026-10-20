
import sys, os, numpy as np, torch, coremltools as ct
from transformers import AutoModel
torch.set_num_threads(8)
OUT = "/tmp/embed-exp/step1c/coreml"
vm = AutoModel.from_pretrained("google/siglip2-base-patch16-256", attn_implementation="eager").vision_model.eval().float()
class W(torch.nn.Module):
    def __init__(s, v): super().__init__(); s.v = v
    def forward(s, x): return s.v(pixel_values=(x - 0.5) / 0.5).pooler_output
w = W(vm).eval(); x = torch.rand(1, 3, 256, 256)
with torch.no_grad():
    tr = torch.jit.trace(w, x, strict=False); print("trace diff", (tr(x) - w(x)).abs().max().item(), flush=True)
ml = ct.convert(tr, inputs=[ct.TensorType(name="pixels", shape=(1, 3, 256, 256))], outputs=[ct.TensorType(name="embedding")],
                minimum_deployment_target=ct.target.iOS17, compute_precision=ct.precision.FLOAT16, convert_to="mlprogram")
ml.save(f"{OUT}/siglip-f16.mlpackage"); print("saved f16", flush=True)
import coremltools.optimize.coreml as cto
q = cto.linear_quantize_weights(ml, cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_channel")))
q.save(f"{OUT}/siglip-w8lin.mlpackage"); print("saved w8lin", flush=True)
