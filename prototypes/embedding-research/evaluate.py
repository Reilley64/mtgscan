
import json, os, sys, numpy as np
E = "/tmp/embed-exp/emb"
G0 = "/Users/reilley/Library/Caches/mtgscan/gallery/installed/20261012-cf1753"
cat = json.load(open(f"{G0}/catalog.json"))
sub = json.load(open("/tmp/embed-exp/subset.json"))
rows = np.array(sub["rows"]); ids = sub["ids"]
lab = json.load(open(sys.argv[1]))
idpos = {i:k for k,i in enumerate(ids)}
truth = np.array([idpos[c["scryfallId"]] for c in lab["cards"]])
names = np.array([cat[r]["name"] for r in rows]); ill = np.array([cat[r]["illustrationId"] or cat[r]["id"] for r in rows])
nC = len(truth)
def evaluate(G, C, Cr):
    S = C @ G.T; Sr = Cr @ G.T
    sc, sn = S[:nC], S[nC:]
    ts = sc[np.arange(nC), truth]
    rank = (sc > ts[:,None]).sum(1) + 1
    top = sc.argmax(1); top1 = sc.max(1)
    r = {}
    for k in (1,10,20,50): r[f"top{k}"] = (rank <= k).mean()
    sr = np.sort(rank)
    r["K99"] = int(sr[int(np.ceil(0.99*nC))-1]); r["K100"] = int(sr[-1])
    r["name1"] = (names[top] == names[truth]).mean()
    artok = ill[top] == ill[truth]; r["art1"] = artok.mean()
    r["nonmax"] = float(sn.max(1).max()); r["cardmin"] = float(top1.min()); r["sep"] = r["nonmax"] < r["cardmin"]
    r["nonmax_lt_card_p1"] = float(np.mean(top1 > r["nonmax"]))
    rb = Sr[:nC].max(1); r["orient"] = (top1 > rb).mean(); r["orient03"] = (top1 - rb > 0.03).mean()
    m = []
    for i in np.where(artok)[0]:
        other = sc[i][ill != ill[top[i]]].max(); m.append(top1[i] - other)
    r["artmargin"] = float(np.median(m))
    return r
def vision():
    G = np.fromfile(f"{G0}/gallery.f16", dtype=np.float16).reshape(-1,768)[rows].astype(np.float32)
    G /= np.linalg.norm(G, axis=1, keepdims=True)
    C = np.fromfile("/tmp/embed-exp/vision_crops.f32", dtype=np.float32).reshape(-1,768)
    Cr = np.fromfile("/tmp/embed-exp/vision_crops_rot.f32", dtype=np.float32).reshape(-1,768)
    return G, C, Cr
if __name__ == "__main__":
    models = sys.argv[2:]
    res = {}
    for m in models:
        if m == "vision_fp2": res[m] = evaluate(*vision())
        else: res[m] = evaluate(*(np.load(f"{E}/{m}_{s}.npy") for s in ("gallery","crops","crops_rot")))
    cols = ["top1","top10","top20","top50","K99","K100","name1","art1","nonmax","cardmin","sep","orient","orient03","artmargin"]
    print("| model | " + " | ".join(cols) + " |"); print("|" + "---|"*(len(cols)+1))
    for m, r in res.items():
        print(f"| {m} | " + " | ".join(f"{r[c]:.3f}" if isinstance(r[c], float) else str(r[c]) for c in cols) + " |")
    json.dump({m:{k:(v if not isinstance(v,(np.floating,np.bool_)) else v.item()) for k,v in r.items()} for m,r in res.items()}, open("/tmp/embed-exp/metrics.json","w"), indent=1)
