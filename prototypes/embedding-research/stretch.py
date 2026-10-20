
import json, os, sys, time, random, io, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import torchvision.transforms as T
name = sys.argv[1]; NAUG = int(sys.argv[2]) if len(sys.argv) > 2 else 4
dev = "mps" if torch.backends.mps.is_available() else "cpu"
sys.path.insert(0, "/tmp/embed-exp"); from models import load
m, S, (mean, std), fwd = load(name); m = m.eval().to(dev)
mean_t = torch.tensor(mean).view(1,3,1,1); std_t = torch.tensor(std).view(1,3,1,1)
rng = random.Random(0)
persp = T.RandomPerspective(distortion_scale=0.12, p=0.8)
def glare(im):
    w, h = im.size; layer = Image.new("L", im.size, 0); d = ImageDraw.Draw(layer)
    cx, cy = rng.uniform(0, w), rng.uniform(0, h); rx, ry = rng.uniform(30, 160), rng.uniform(20, 120)
    d.ellipse([cx-rx, cy-ry, cx+rx, cy+ry], fill=int(rng.uniform(80, 220)))
    layer = layer.filter(ImageFilter.GaussianBlur(rng.uniform(10, 40)))
    return Image.composite(Image.new("RGB", im.size, (255,255,250)), im, layer)
def augment(im):
    im = im.convert("RGB").resize((488, 680))
    w, h = im.size; s = rng.uniform(0.0, 0.06)
    im = im.crop((rng.uniform(-s, s)*w, rng.uniform(-s, s)*h, w + rng.uniform(-s, s)*w, h + rng.uniform(-s, s)*h)).resize((488, 680))
    im = persp(im); im = im.rotate(rng.uniform(-5, 5), resample=Image.BILINEAR)
    im = ImageEnhance.Brightness(im).enhance(rng.uniform(0.6, 1.4)); im = ImageEnhance.Contrast(im).enhance(rng.uniform(0.6, 1.4))
    im = ImageEnhance.Color(im).enhance(rng.uniform(0.6, 1.4))
    if rng.random() < 0.5: im = glare(im)
    if rng.random() < 0.5: im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 2.0)))
    b = io.BytesIO(); im.save(b, "JPEG", quality=rng.randint(30, 90)); return Image.open(b).convert("RGB")
def tens(im, rot=False):
    if rot: im = im.rotate(180)
    im = im.resize((S, S), Image.BICUBIC)
    return torch.from_numpy(np.asarray(im, dtype=np.float32) / 255).permute(2,0,1)
def feats(imgs, bs=32):
    out = []
    for i in range(0, len(imgs), bs):
        x = ((torch.stack(imgs[i:i+bs]) - mean_t) / std_t).to(dev)
        with torch.no_grad(): out.append(fwd(x).float().cpu())
    return torch.cat(out)
ids = json.load(open("/tmp/embed-exp/subset.json"))["ids"]
gal = [f"/tmp/embed-exp/images/{i}.jpg" for i in ids]
crops = open("/tmp/embed-exp/crops.txt").read().split("\n")
cache = f"/tmp/embed-exp/emb/{name}_raw_cache.pt"
if os.path.exists(cache): D = torch.load(cache)
else:
    t = time.time()
    D = {"gal": feats([tens(Image.open(p).convert("RGB")) for p in gal]),
         "crops": feats([tens(Image.open(p).convert("RGB")) for p in crops]),
         "crops_rot": feats([tens(Image.open(p).convert("RGB"), True) for p in crops])}
    augs = []
    for k in range(NAUG):
        fs = []
        for i in range(0, len(gal), 256):
            fs.append(feats([tens(augment(Image.open(p))) for p in gal[i:i+256]]))
        augs.append(torch.cat(fs)); print("aug pass", k, time.time() - t, flush=True)
    D["aug"] = torch.stack(augs); torch.save(D, cache)
# head training on cached features (backbone frozen)
G0 = "/Users/reilley/Library/Caches/mtgscan/gallery/installed/20261012-cf1753"
cat = json.load(open(f"{G0}/catalog.json")); rows = json.load(open("/tmp/embed-exp/subset.json"))["rows"]
names = [cat[r]["name"] for r in rows]
byname = {}
for i, n in enumerate(names): byname.setdefault(n, []).append(i)
multi = [v for v in byname.values() if len(v) > 1]
d = D["gal"].shape[1]; OUTD = 512
head = nn.Sequential(nn.Linear(d, 1024), nn.GELU(), nn.Linear(1024, OUTD)).to(dev)
opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
pool = torch.cat([D["gal"][None], D["aug"]]).to(dev)  # (1+NAUG, N, d): clean image counts as one view
N = pool.shape[1]; tau = 0.05; steps = int(os.environ.get("STEPS", 3000))
t = time.time()
for step in range(steps):
    idx = []
    for g in rng.sample(multi, min(12, len(multi))): idx += rng.sample(g, min(8, len(g)))
    idx = list(dict.fromkeys(idx + rng.sample(range(N), 256)))[:320]
    idx = torch.tensor(idx, device=dev)
    v = torch.randint(0, pool.shape[0], (2, len(idx)), device=dev)
    a = F.normalize(head(pool[v[0], idx]), dim=-1); b = F.normalize(head(pool[v[1], idx]), dim=-1)
    logits = a @ b.T / tau; y = torch.arange(len(idx), device=dev)
    loss = (F.cross_entropy(logits, y) + F.cross_entropy(logits.T, y)) / 2
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 500 == 0: print(step, loss.item(), time.time() - t, flush=True)
head.eval()
with torch.no_grad():
    f = lambda x: F.normalize(head(x.to(dev)), dim=-1).cpu().numpy()
    tag = f"{name}_head"
    np.save(f"/tmp/embed-exp/emb/{tag}_gallery.npy", f(D["gal"])); np.save(f"/tmp/embed-exp/emb/{tag}_crops.npy", f(D["crops"])); np.save(f"/tmp/embed-exp/emb/{tag}_crops_rot.npy", f(D["crops_rot"]))
print("train secs", time.time() - t)
