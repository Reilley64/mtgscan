
import sys, json, numpy as np, torch, torch.nn.functional as F
from PIL import Image
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
torch.set_num_threads(8)
m, S, (mean, std), fwd = load_base("pe_core_s16_384"); m = m.eval().float()
print("mean", mean, "std", std, "size", S, flush=True)
crops = [l for l in open("/tmp/embed-exp/crops.txt").read().split("\n") if l]
out = "/tmp/embed-exp/step1c/ref"
import os; os.makedirs(out, exist_ok=True)
mt = torch.tensor(mean).view(1,3,1,1); st = torch.tensor(std).view(1,3,1,1)
def emb(ims):
    x = torch.stack([prep(im, "pad", S, S, mean) for im in ims])
    with torch.no_grad(): y = fwd((x - mt) / st)
    return x, y.float()
U, R, X = [], [], []
for i in range(0, len(crops), 16):
    ims = [Image.open(p).convert("RGB") for p in crops[i:i+16]]
    x, y = emb(ims); U.append(y); X.append(x)
    _, yr = emb([im.rotate(180) for im in ims]); R.append(yr)
U = torch.cat(U); R = torch.cat(R); X = torch.cat(X)
print("raw norm range", U.norm(dim=-1).min().item(), U.norm(dim=-1).max().item(), "absmax", U.abs().max().item())
np.save(f"{out}/up_raw.npy", U.numpy()); np.save(f"{out}/rot_raw.npy", R.numpy())
np.save(f"{out}/up.npy", F.normalize(U, dim=-1).numpy()); np.save(f"{out}/rot.npy", F.normalize(R, dim=-1).numpy())
refidx = [0, 10, 20, 31, 41, 52, 62, 72, 83, 93, 104, 114, 125, 135, 145, 156, 166, 177, 187, 197, 208, 218, 229, 239]
X[refidx].numpy().astype(np.float32).tofile(f"{out}/ref24_pixels01.f32")
X.numpy().astype(np.float16).tofile(f"{out}/all261_pixels01.f16")
json.dump({"crops": crops, "refidx": refidx, "mean": mean, "std": std, "size": S}, open(f"{out}/meta.json", "w"), indent=1)
# also pure 488x680 intermediate check: images are already 488x680
print("done", U.shape)
