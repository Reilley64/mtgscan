
import json, sys, time, numpy as np, torch, torch.nn.functional as F
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
from PIL import Image
best = json.load(open("/tmp/embed-exp/best.json"))
ids = json.load(open("/tmp/embed-exp/subset.json"))["ids"][:256]
imgs = [Image.open(f"/tmp/embed-exp/images/{i}.jpg").convert("RGB") for i in ids]
for name, cfg in best.items():
    m, S, (mean, std), fwd = load_base(name); m = m.eval().to("mps")
    mt = torch.tensor(mean).view(1,3,1,1); st = torch.tensor(std).view(1,3,1,1)
    X = ((torch.stack([prep(im, cfg["mode"], cfg["W"], cfg["H"], mean) for im in imgs]) - mt) / st)
    def run(half, bs):
        mm = m.half() if half else m.float(); out = []
        t = time.time()
        for i in range(0, len(X), bs):
            x = X[i:i+bs].to("mps"); x = x.half() if half else x
            with torch.no_grad(): y = fwd(x, cfg["pool"]) if name == "dinov3_s16" else fwd(x)
            out.append(F.normalize(y.float(), dim=-1).cpu())
        torch.mps.synchronize(); return torch.cat(out), 1000 * (time.time() - t) / len(X)
    run(False, 32)
    a, ta = run(False, 32); a64, ta64 = run(False, 64); b, tb = run(True, 32)
    cos = (a * b).sum(1)
    print(name, f"fp32 {ta:.1f}ms bs64 {ta64:.1f}ms fp16 {tb:.1f}ms cos min {cos.min():.5f} nan {torch.isnan(b).sum().item()}", flush=True)
