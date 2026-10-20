
import sys, json, numpy as np, torch, torch.nn.functional as F
from PIL import Image
sys.path.insert(0, "/tmp/embed-exp")
from prep_models import load_base, prep
torch.set_num_threads(8)
m, S, (mean, std), fwd = load_base("siglip2_b16_256"); m = m.eval().float()
crops = json.load(open("/tmp/embed-exp/step1c/ref/meta.json"))["crops"]; refidx = json.load(open("/tmp/embed-exp/step1c/ref/meta.json"))["refidx"]
mt = torch.tensor(mean).view(1,3,1,1); st = torch.tensor(std).view(1,3,1,1)
U, R, X = [], [], []
for i in range(0, len(crops), 16):
    ims = [Image.open(p).convert("RGB") for p in crops[i:i+16]]
    x = torch.stack([prep(im, "squash", S, S, mean) for im in ims]); X.append(x)
    xr = torch.stack([prep(im.rotate(180), "squash", S, S, mean) for im in ims])
    with torch.no_grad(): U.append(fwd((x - mt) / st).float()); R.append(fwd((xr - mt) / st).float())
U = torch.cat(U); R = torch.cat(R); X = torch.cat(X)
out = "/tmp/embed-exp/step1c/ref"
np.save(f"{out}/siglip_up.npy", F.normalize(U, dim=-1).numpy()); np.save(f"{out}/siglip_rot.npy", F.normalize(R, dim=-1).numpy())
X[refidx].numpy().astype(np.float32).tofile(f"{out}/siglip_ref24_pixels01.f32")
X.numpy().astype(np.float16).tofile(f"{out}/siglip_all261_pixels01.f16")
print("done", U.shape, mean, std, S)
