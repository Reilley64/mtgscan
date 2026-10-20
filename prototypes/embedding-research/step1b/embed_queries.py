
import json, os, sys, glob, numpy as np, torch, torch.nn.functional as F
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
name = sys.argv[1]; dump = sys.argv[2]; out = sys.argv[3]
cfg = json.load(open("/tmp/embed-exp/best.json"))[name]
dev = "mps"
m, S, (mean, std), fwd = load_base(name); m = m.eval().to(dev)
if cfg.get("half"): m = m.half()
mt = torch.tensor(mean).view(1,3,1,1); st = torch.tensor(std).view(1,3,1,1)
files = sorted(glob.glob(f"{dump}/*.png"))
os.makedirs(out, exist_ok=True)
done = {}
if os.path.exists(f"{out}/keys.txt"):
    ks = open(f"{out}/keys.txt").read().split(); d = int(open(f"{out}/dimension.txt").read())
    V = np.fromfile(f"{out}/vectors.f32", dtype=np.float32).reshape(-1, d); done = dict(zip(ks, V))
todo = [f for f in files if os.path.basename(f)[:-4] not in done]
print(name, len(files), "images", len(todo), "to embed", flush=True)
cpu = ThreadPoolExecutor(8)
def load(p): return prep(Image.open(p).convert("RGB"), cfg["mode"], cfg["W"], cfg["H"], mean)
for i in range(0, len(todo), 64):
    batch = todo[i:i+64]
    x = torch.stack(list(cpu.map(load, batch))); x = ((x - mt) / st).to(dev)
    if cfg.get("half"): x = x.half()
    with torch.no_grad():
        y = fwd(x, cfg["pool"]) if name == "dinov3_s16" else fwd(x)
    y = F.normalize(y.float(), dim=-1).cpu().numpy()
    for f, v in zip(batch, y): done[os.path.basename(f)[:-4]] = v
keys = sorted(done); V = np.stack([done[k] for k in keys]).astype(np.float32)
open(f"{out}/keys.txt", "w").write("\n".join(keys) + "\n"); V.tofile(f"{out}/vectors.f32")
open(f"{out}/dimension.txt", "w").write(str(V.shape[1]))
print("wrote", len(keys), V.shape, flush=True)
