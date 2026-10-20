
import json, numpy as np, torch, torch.nn.functional as F
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
meta = json.load(open("/tmp/embed-exp/step1c/ref/meta.json"))
dev = np.fromfile("/tmp/embed-exp/step1c/android/device_out/f32_jpg261.bin", "<f4").reshape(-1,512)
dev /= np.linalg.norm(dev, axis=1, keepdims=True)
it = Interpreter(model_path="/tmp/embed-exp/step1c/android/models/pes16-f32.tflite", num_threads=8); it.allocate_tensors()
i, o = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
def pad(t, nw, nh):  # t: 3xnh x nw in [0,1]
    bg = torch.full((3,384,384), 127/255.); l, tp = (384-nw)//2, (384-nh)//2; bg[:, tp:tp+nh, l:l+nw] = t; return bg
def emb(x):
    it.set_tensor(i, x[None].numpy().astype(np.float32)); it.invoke(); y = it.get_tensor(o)[0]; return y/np.linalg.norm(y)
res = {"pil_bilinear": [], "torch_bilinear_noaa": []}
for k, p in enumerate(meta["crops"]):
    im = Image.open(p).convert("RGB"); w, h = im.size; s = min(384/w, 384/h); nw, nh = round(w*s), round(h*s)
    a = torch.from_numpy(np.asarray(im.resize((nw,nh), Image.BILINEAR), dtype=np.float32)/255).permute(2,0,1)
    full = torch.from_numpy(np.asarray(im, dtype=np.float32)/255).permute(2,0,1)[None]
    b = F.interpolate(full, size=(nh,nw), mode="bilinear", align_corners=False, antialias=False)[0]
    b = (b*255).round()/255
    res["pil_bilinear"].append(float(emb(pad(a,nw,nh)) @ dev[k])); res["torch_bilinear_noaa"].append(float(emb(pad(b,nw,nh)) @ dev[k]))
out = {k: dict(min=float(np.min(v)), median=float(np.median(v))) for k, v in res.items()}
print(out); json.dump(out, open("/tmp/embed-exp/step1c/android/jpg_gap_check.json","w"), indent=1)
