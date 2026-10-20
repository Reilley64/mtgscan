
import sys, json, time, numpy as np
from ai_edge_litert.interpreter import Interpreter
R = "/tmp/embed-exp/step1c/ref"; meta = json.load(open(f"{R}/meta.json")); up = np.load(f"{R}/up.npy")
X = np.fromfile(f"{R}/ref24_pixels01.f32", np.float32).reshape(24,3,384,384)
out = {}
for name in sys.argv[1:]:
    it = Interpreter(model_path=f"/tmp/embed-exp/step1c/android/models/pes16-{name}.tflite", num_threads=8); it.allocate_tensors()
    i, o = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
    Y, ts = [], []
    for x in X:
        it.set_tensor(i, x[None]); t = time.perf_counter(); it.invoke(); ts.append((time.perf_counter()-t)*1e3); Y.append(it.get_tensor(o)[0].copy())
    Y = np.array(Y); nan = bool(np.isnan(Y).any()); Y = Y / np.linalg.norm(Y, axis=1, keepdims=True)
    c = (Y * up[meta["refidx"]]).sum(1)
    out[name] = dict(min_cos=float(c.min()), median_cos=float(np.median(c)), nan=nan, mac_ms_median=float(np.median(ts)))
    print(name, out[name], flush=True)
json.dump(out, open("/tmp/embed-exp/step1c/android/mac_check.json", "w"), indent=1)
