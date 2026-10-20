
import os, subprocess, sys
# usage: runall.py <tag> <gallery-dir> <query-dir or ""> <workers> [gates...]
tag, gal, q, workers = sys.argv[1:5]
gates = sys.argv[5:] or ["real:full", "real:held-out", "simulated:full", "simulated:held-out"]
S = "/tmp/embed-exp/step1b"
BIN = "/Users/reilley/.t3/worktrees/mtgscan/embedding-replay/apps/mobile/modules/card-recognizer/.data/build-proto/release/card-recognizer"
env = dict(os.environ, RECOGNIZER_NOT_A_CARD=os.environ.get("RECOGNIZER_NOT_A_CARD", "-10"), RECOGNIZER_ART_MARGIN=os.environ.get("RECOGNIZER_ART_MARGIN", "-10"))
if q: env["RECOGNIZER_QUERY_VECTORS"] = q
for g in gates:
    which, mode = g.split(":")
    out = f"{S}/runs/{tag}-{which}-{mode}.json"
    if os.path.exists(out): continue
    subprocess.run([sys.executable, f"{S}/driver.py", BIN, gal, which, mode, out + ".tmp", workers], env=env, check=True)
    os.rename(out + ".tmp", out)
    print("done", out, flush=True)
