
import sys, numpy as np, torch
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
X = torch.from_numpy(np.fromfile("/tmp/embed-exp/step1c/ref/ref24_pixels01.f32", dtype=np.float32).reshape(24,3,384,384)[:4])
mx = {}
def hook(name):
    def f(mod, inp, out):
        t = out[0] if isinstance(out, tuple) else out
        if torch.is_tensor(t): mx[name] = max(mx.get(name, 0), t.abs().max().item())
        i = inp[0] if inp and torch.is_tensor(inp[0]) else None
        if i is not None: mx[name + "<in"] = max(mx.get(name + "<in", 0), i.abs().max().item())
    return f
for n, mod in m.named_modules(): mod.register_forward_hook(hook(n))
with torch.no_grad(): m((X - 0.5) / 0.5)
for k, v in sorted(mx.items(), key=lambda kv: -kv[1])[:25]: print(f"{v:12.1f} {k}")
print(type(m), [n for n, _ in m.named_children()])
