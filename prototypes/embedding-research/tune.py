
import json, os, sys, time, numpy as np, torch, torch.nn.functional as F
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
from common import evaluate
dev = "mps"
sub = json.load(open("/tmp/embed-exp/subset.json")); rows = np.array(sub["rows"])
gal = [f"/tmp/embed-exp/images/{i}.jpg" for i in sub["ids"]]
crops = open("/tmp/embed-exp/crops.txt").read().split("\n")
OUT = "/tmp/embed-exp/tune"; os.makedirs(OUT, exist_ok=True)
pool = ThreadPoolExecutor(8)
def load_img(p, rot):
    im = Image.open(p).convert("RGB")
    return im.rotate(180) if rot else im

VARIANTS = {
 "dinov3_s16": [("squash",224,224), ("pad",224,224), ("squash",224,320), ("squash",336,464)],
 "pe_core_b16_224": [("squash",224,224), ("pad",224,224), ("crop",224,224)],
 "siglip2_b16_256": [("squash",256,256), ("pad",256,256), ("crop",256,256)],
 "pe_core_s16_384": [("squash",384,384), ("pad",384,384), ("crop",384,384)],
}
names = sys.argv[1:] or list(VARIANTS)
for name in names:
    m, S, (mean, std), fwd = load_base(name)
    m = m.eval().to(dev)
    mt = torch.tensor(mean).view(1,3,1,1); st = torch.tensor(std).view(1,3,1,1)
    for mode, W, H in VARIANTS[name]:
        def run(paths, rot=False, bs=32):
            outs = {}
            for i in range(0, len(paths), bs):
                ims = list(pool.map(lambda p: load_img(p, rot), paths[i:i+bs]))
                x = torch.stack(list(pool.map(lambda im: prep(im, mode, W, H, mean), ims)))
                x = ((x - mt) / st).to(dev)
                with torch.no_grad():
                    if name == "dinov3_s16":
                        res = {p: F.normalize(fwd(x, p).float(), dim=-1).cpu() for p in ("cls","mean","cat")}
                    else:
                        res = {"pooled": F.normalize(fwd(x).float(), dim=-1).cpu()}
                for k, v in res.items(): outs.setdefault(k, []).append(v)
            return {k: torch.cat(v).numpy() for k, v in outs.items()}
        t = time.time(); G = run(gal); tg = 1000 * (time.time() - t) / len(gal)
        C = run(crops); Cr = run(crops, True)
        for pk in G:
            key = f"{name}|{mode}|{W}x{H}|{pk}"
            r = evaluate(G[pk], C[pk], Cr[pk], rows); r.pop("ranks")
            r.update(model=name, mode=mode, size=f"{W}x{H}", pool=pk, ms_per_img_mps=tg, nan=int(np.isnan(G[pk]).sum()))
            json.dump(r, open(f"{OUT}/{key.replace('|','__')}.json", "w"))
            print(key, "K99", r["K99"], "K100", r["K100"], "art1", round(r["art1"],3), "name1", round(r["name1"],3), "sep", round(r["cardmin"]-r["nonmax"],3), f"{tg:.1f}ms", flush=True)
    del m; torch.mps.empty_cache()
