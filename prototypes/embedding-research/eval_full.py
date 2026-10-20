
import json, os, sys, numpy as np
sys.path.insert(0, "/tmp/embed-exp")
from common import evaluate, cat, G0
ROOT = "/tmp/embed-exp/full"; n = len(cat); CH = 1024
res = {}
for name in sys.argv[1:]:
    if name == "vision_fp2":
        G = np.fromfile(f"{G0}/gallery.f16", dtype=np.float16).reshape(-1, 768).astype(np.float32)
        G /= np.linalg.norm(G, axis=1, keepdims=True)
        C = np.fromfile("/tmp/embed-exp/vision_crops.f32", dtype=np.float32).reshape(-1, 768)
        Cr = np.fromfile("/tmp/embed-exp/vision_crops_rot.f32", dtype=np.float32).reshape(-1, 768)
    else:
        G = np.concatenate([np.load(f"{ROOT}/{name}/{k:03d}.npy") for k in range((n + CH - 1) // CH)]).astype(np.float32)
        C = np.load(f"{ROOT}/{name}/crops.npy"); Cr = np.load(f"{ROOT}/{name}/crops_rot.npy")
    assert len(G) == n, (name, len(G))
    r = evaluate(G, C, Cr, np.arange(n)); res[name] = r
    print(name, {k: v for k, v in r.items() if k != "ranks"}, flush=True)
json.dump(res, open(f"{ROOT}/metrics_full.json", "w"))
