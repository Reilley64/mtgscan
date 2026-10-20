
import sys, numpy as np, torch, torch.nn.functional as F
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
X = torch.from_numpy(np.fromfile("/tmp/embed-exp/step1c/ref/ref24_pixels01.f32", dtype=np.float32).reshape(24,3,384,384)[:6])
orig = F.scaled_dot_product_attention
stats = []
def sdpa(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None, **kw):
    raw = q @ k.transpose(-1, -2)
    stats.append((q.abs().max().item(), k.abs().max().item(), raw.abs().max().item(), (q*q).sum(-1).max().item()))
    return orig(q, k, v, attn_mask=attn_mask, dropout_p=dropout_p, is_causal=is_causal, scale=scale)
F.scaled_dot_product_attention = sdpa
mx = {}
def hook(name):
    def f(mod, inp, out):
        t = out[0] if isinstance(out, tuple) else out
        if torch.is_tensor(t): mx[name] = max(mx.get(name, 0), t.abs().max().item())
    return f
for n, mod in m.named_modules(): mod.register_forward_hook(hook(n))
with torch.no_grad(): m((X - 0.5) / 0.5)
for i, s in enumerate(stats): print("attn", i, ["%.1f" % v for v in s])
for k, v in sorted(mx.items(), key=lambda kv: -kv[1])[:8]: print(f"{v:12.1f} {k}")
import inspect, timm.layers.attention_pool as ap
print(inspect.getsource(type(m.trunk.blocks[0].attn).forward)[:2500])
