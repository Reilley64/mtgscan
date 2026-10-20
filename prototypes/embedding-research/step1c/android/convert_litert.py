
import sys, json, numpy as np, torch
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base
import litert_torch
OUT = "/tmp/embed-exp/step1c/android/models"
import os; os.makedirs(OUT, exist_ok=True)
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
class W(torch.nn.Module):
    def __init__(s, v):
        super().__init__(); s.v = v
        s.register_buffer("mean", torch.tensor(mean).view(1,3,1,1)); s.register_buffer("std", torch.tensor(std).view(1,3,1,1))
    def forward(s, x): return s.v((x - s.mean) / s.std)
w = W(m).eval()
x = torch.rand(1, 3, S, S)
em = litert_torch.convert(w, (x,))
with torch.no_grad(): ref = w(x).numpy()
out = em(x)
print("convert diff", np.abs(np.asarray(out) - ref).max(), flush=True)
em.export(f"{OUT}/pes16-f32.tflite"); print("saved f32", flush=True)
