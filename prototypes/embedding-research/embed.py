
import json, os, sys, time, numpy as np, torch, torch.nn.functional as F
from PIL import Image
dev = "mps" if torch.backends.mps.is_available() else "cpu"
name = sys.argv[1]
OUT = "/tmp/embed-exp/emb"; os.makedirs(OUT, exist_ok=True)

from models import load
m, S, (mean, std), fwd = load(name)
m = m.eval().to(dev)
mean_t = torch.tensor(mean).view(1,3,1,1); std_t = torch.tensor(std).view(1,3,1,1)
def prep(path, rot=False):
    im = Image.open(path).convert("RGB")
    if rot: im = im.rotate(180)
    im = im.resize((S, S), Image.BICUBIC)   # squash full card to square input
    x = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255).permute(2,0,1)
    return x
def run(paths, rot=False, bs=32):
    outs = []
    for i in range(0, len(paths), bs):
        x = torch.stack([prep(p, rot) for p in paths[i:i+bs]])
        x = ((x - mean_t) / std_t).to(dev)
        with torch.no_grad():
            outs.append(F.normalize(fwd(x).float(), dim=-1).cpu())
    return torch.cat(outs).numpy()
ids = json.load(open("/tmp/embed-exp/subset.json"))["ids"]
gal = [f"/tmp/embed-exp/images/{i}.jpg" for i in ids]
crops = open("/tmp/embed-exp/crops.txt").read().split("\n")
run(crops[:32])  # warm-up
t = time.time(); G = run(gal); torch.mps.synchronize() if dev=="mps" else None; tg = time.time() - t
C = run(crops); Cr = run(crops, rot=True)
# batch-1 latency including preprocessing
t = time.time()
for p in crops[:30]: run([p])
t1 = (time.time() - t) / 30
np.save(f"{OUT}/{name}_gallery.npy", G); np.save(f"{OUT}/{name}_crops.npy", C); np.save(f"{OUT}/{name}_crops_rot.npy", Cr)
params = sum(p.numel() for p in (m.visual.parameters() if hasattr(m,"visual") else m.vision_model.parameters() if hasattr(m,"vision_model") else m.parameters()))
json.dump({"model": name, "device": dev, "input": S, "dim": int(G.shape[1]), "params_image_tower": params,
           "ms_per_image_batch32": 1000*tg/len(gal), "ms_per_image_batch1": 1000*t1, "nan": int(np.isnan(G).sum()+np.isnan(C).sum())},
          open(f"{OUT}/{name}_meta.json","w"))
print(name, dev, S, G.shape, params, 1000*tg/len(gal), 1000*t1)
