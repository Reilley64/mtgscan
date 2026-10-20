
import sys, json, numpy as np, coremltools as ct, time
REF = "/tmp/embed-exp/step1c/ref"; OUT = "/tmp/embed-exp/step1c/coreml"
up = np.load(f"{REF}/siglip_up.npy")
X = np.fromfile(f"{REF}/siglip_all261_pixels01.f16", dtype=np.float16).reshape(261, 3, 256, 256).astype(np.float32)
meta = json.load(open(f"{REF}/meta.json")); ref = meta["refidx"]
res = {}
for name in sys.argv[1:]:
    for cu in ("CPU_ONLY", "CPU_AND_GPU", "ALL"):
        m = ct.models.MLModel(f"{OUT}/{name}.mlpackage", compute_units=getattr(ct.ComputeUnit, cu))
        V = np.stack([m.predict({"pixels": X[i:i+1]})["embedding"].reshape(-1) for i in range(261)])
        nan = int(np.isnan(V).sum())
        Vn = V / np.linalg.norm(V, axis=1, keepdims=True)
        c = (Vn * up).sum(1)
        res[f"{name}/{cu}"] = dict(nan=nan, min24=float(c[ref].min()), med24=float(np.median(c[ref])), min261=float(np.nanmin(c)), med261=float(np.nanmedian(c)), absmax=float(np.nanmax(np.abs(V))))
        print(name, cu, res[f"{name}/{cu}"], flush=True)
json.dump(res, open(f"{OUT}/mac_check_siglip.json", "w"), indent=1)
