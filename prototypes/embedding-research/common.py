
import json, numpy as np
G0 = "/Users/reilley/Library/Caches/mtgscan/gallery/installed/20261012-cf1753"
LAB = "/Users/reilley/.t3/worktrees/mtgscan/t3-1cfda40f/apps/mobile/test/scanner-evidence/real/labels.json"
cat = json.load(open(f"{G0}/catalog.json"))
lab = json.load(open(LAB))
row_of = {c["id"]: k for k, c in enumerate(cat)}
NAMES = np.array([c["name"] for c in cat]); ILL = np.array([c["illustrationId"] or c["id"] for c in cat])
TRUTH_ROWS = np.array([row_of[c["scryfallId"]] for c in lab["cards"]])
nC = len(TRUTH_ROWS)

def evaluate(G, C, Cr, rows):
    """G: gallery vectors for catalog rows `rows` (array). C, Cr: 261 crop vectors (cards then non-cards)."""
    rows = np.asarray(rows); pos = {r: k for k, r in enumerate(rows)}
    truth = np.array([pos[r] for r in TRUTH_ROWS])
    names = NAMES[rows]; ill = ILL[rows]
    S = (C @ G.T).astype(np.float32); Sr = (Cr @ G.T).astype(np.float32)
    sc, sn = S[:nC], S[nC:]
    ts = sc[np.arange(nC), truth]
    rank = (sc > ts[:, None]).sum(1) + 1
    top = sc.argmax(1); top1 = sc.max(1)
    r = {}
    for k in (1, 10, 20, 50): r[f"top{k}"] = float((rank <= k).mean())
    sr = np.sort(rank)
    r["K99"] = int(sr[int(np.ceil(0.99 * nC)) - 1]); r["K100"] = int(sr[-1])
    r["name1"] = float((names[top] == names[truth]).mean())
    artok = ill[top] == ill[truth]; r["art1"] = float(artok.mean())
    r["nonmax"] = float(sn.max(1).max()); r["cardmin"] = float(top1.min()); r["sep"] = bool(r["nonmax"] < r["cardmin"])
    rb = Sr[:nC].max(1); r["orient"] = float((top1 > rb).mean()); r["orient03"] = float((top1 - rb > 0.03).mean())
    m = [top1[i] - sc[i][ill != ill[top[i]]].max() for i in np.where(artok)[0]]
    r["artmargin"] = float(np.median(m))
    r["ranks"] = rank.tolist()
    return r
