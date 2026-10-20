
import json, os, sys, time, shutil, threading, numpy as np, torch, torch.nn.functional as F, requests
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
from common import cat
dev = "mps"
BEST = json.load(open("/tmp/embed-exp/best.json"))   # {model: {mode, W, H, pool}}
ROOT = "/tmp/embed-exp/full"; IMG = f"{ROOT}/imgs"; os.makedirs(IMG, exist_ok=True)
CH = 1024; ids = [c["id"] for c in cat]; nchunks = (len(ids) + CH - 1) // CH
LIMIT = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--chunks=")), nchunks))
OLD = "/tmp/embed-exp/images"
H = {"User-Agent": "mtgscan-research/0.1", "Accept": "*/*"}
api_lock = threading.Lock(); last = [0.0]
tl = threading.local()
def sess():
    if not hasattr(tl, "s"): tl.s = requests.Session()
    return tl.s
def get(url):
    for a in range(3):
        try:
            r = sess().get(url, headers=H, timeout=30)
            if r.status_code == 404: return 404
            if r.ok: return r.content
        except Exception: pass
        time.sleep(1 + a)
    return None
def fetch(i, d):
    old = f"{OLD}/{i}.jpg"
    if os.path.exists(old): return old
    p = f"{d}/{i}.jpg"
    if os.path.exists(p): return p
    b = get(f"https://cards.scryfall.io/normal/front/{i[0]}/{i[1]}/{i}.jpg")
    if not isinstance(b, bytes):
        try:
            with api_lock:
                dt = time.time() - last[0]
                if dt < 0.11: time.sleep(0.11 - dt)
                last[0] = time.time()
            j = sess().get(f"https://api.scryfall.com/cards/{i}", headers={**H, "Accept": "application/json"}, timeout=30).json()
            u = (j.get("image_uris") or j["card_faces"][0]["image_uris"])["normal"]
            b = get(u)
        except Exception: b = None
    if not isinstance(b, bytes): return None
    open(p, "wb").write(b); return p
dl = ThreadPoolExecutor(8); cpu = ThreadPoolExecutor(8)
def download(k):
    while shutil.disk_usage("/").free < 3.5e9:
        print("low disk, waiting", flush=True); time.sleep(60)
    d = f"{IMG}/{k:03d}"; os.makedirs(d, exist_ok=True)
    return d, list(dl.map(lambda i: fetch(i, d), ids[k*CH:(k+1)*CH]))

models = {}
for name, cfg in BEST.items():
    m, S, (mean, std), fwd = load_base(name)
    m = m.eval().to(dev)
    if cfg.get("half"): m = m.half()
    models[name] = (m, fwd, torch.tensor(mean).view(1,3,1,1), torch.tensor(std).view(1,3,1,1), mean, cfg)
    os.makedirs(f"{ROOT}/{name}", exist_ok=True)

def embed(name, imgs, bs=32):
    m, fwd, mt, st, mean, cfg = models[name]; out = []
    for i in range(0, len(imgs), bs):
        x = torch.stack(list(cpu.map(lambda im: prep(im, cfg["mode"], cfg["W"], cfg["H"], mean), imgs[i:i+bs])))
        x = ((x - mt) / st).to(dev)
        if cfg.get("half"): x = x.half()
        with torch.no_grad():
            y = fwd(x, cfg["pool"]) if name == "dinov3_s16" else fwd(x)
        out.append(F.normalize(y.float(), dim=-1).cpu())
    return torch.cat(out).numpy()

def load_img(p, rot=False):
    im = Image.open(p).convert("RGB"); return im.rotate(180) if rot else im

# crops
crops = open("/tmp/embed-exp/crops.txt").read().split("\n")
for name in models:
    f = f"{ROOT}/{name}/crops.npy"
    if not os.path.exists(f):
        np.save(f, embed(name, [load_img(p) for p in crops])); np.save(f"{ROOT}/{name}/crops_rot.npy", embed(name, [load_img(p, True) for p in crops]))

todo = [k for k in range(min(LIMIT, nchunks)) if not all(os.path.exists(f"{ROOT}/{n}/{k:03d}.npy") for n in models)]
print("chunks to do", len(todo), "of", nchunks, flush=True)
fails = json.load(open(f"{ROOT}/failures.json")) if os.path.exists(f"{ROOT}/failures.json") else {}
dlx = ThreadPoolExecutor(1)
nxt = dlx.submit(download, todo[0]) if todo else None
t0 = time.time()
for j, k in enumerate(todo):
    d, paths = nxt.result()
    if j + 1 < len(todo): nxt = dlx.submit(download, todo[j + 1])
    ok = [p is not None for p in paths]
    for i, p in zip(ids[k*CH:(k+1)*CH], paths):
        if p is None: fails[i] = k
    imgs = list(cpu.map(load_img, [p for p in paths if p]))
    for name in models:
        f = f"{ROOT}/{name}/{k:03d}.npy"
        if os.path.exists(f): continue
        e = embed(name, imgs)
        full = np.zeros((len(paths), e.shape[1]), np.float16); full[np.array(ok)] = e.astype(np.float16)
        np.save(f, full)
    shutil.rmtree(d, ignore_errors=True)
    json.dump(fails, open(f"{ROOT}/failures.json", "w"))
    el = time.time() - t0
    print(f"chunk {k} done ({j+1}/{len(todo)}), failed so far {len(fails)}, {el/(j+1):.0f}s/chunk, eta {el/(j+1)*(len(todo)-j-1)/3600:.2f}h, free {shutil.disk_usage('/').free/1e9:.1f}GB", flush=True)
    json.dump({"done": j + 1, "todo": len(todo), "nchunks": nchunks, "fails": len(fails), "t": time.time()}, open(f"{ROOT}/progress.json", "w"))
print("finished", flush=True)
