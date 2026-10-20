
import json, os, sys, numpy as np
name = sys.argv[1]
G0 = os.path.expanduser("~/Library/Caches/mtgscan/gallery/installed/20261012-cf1753")
n = len(json.load(open(f"{G0}/catalog.json"))); CH = 1024
G = np.concatenate([np.load(f"/tmp/embed-exp/full/{name}/{k:03d}.npy") for k in range((n + CH - 1) // CH)])
assert len(G) == n
def write(dirname, V):
    d = f"/tmp/embed-exp/step1b/gal/{dirname}"; os.makedirs(d, exist_ok=True)
    if not os.path.exists(f"{d}/catalog.json"): os.symlink(f"{G0}/catalog.json", f"{d}/catalog.json")
    V.astype(np.float16).tofile(f"{d}/gallery.f16")
    json.dump({"count": n, "dimension": V.shape[1], "revision": 0, "createdAt": "2026-10-20T00:00:00Z", "encoding": "float16", "version": dirname}, open(f"{d}/gallery.json", "w"))
write(f"{name}-f16", G)
X = G.astype(np.float32)
largest = np.abs(X).max(1, keepdims=True); scale = 127 / largest
y = X * scale; codes = np.clip(np.sign(y) * np.floor(np.abs(y) + 0.5), -127, 127).astype(np.int8)
C = codes.astype(np.float32); U = (C / np.linalg.norm(C, axis=1, keepdims=True)).astype(np.float16)
write(f"{name}-int8", U)
cos = (U.astype(np.float32) * (X / np.linalg.norm(X, axis=1, keepdims=True))).sum(1)
print(name, "int8 vs f16 cosine min", cos.min(), "median", np.median(cos))
