
import json, os, sys, time, threading, requests
from concurrent.futures import ThreadPoolExecutor
ids=json.load(open("/tmp/embed-exp/subset.json"))["ids"]
H={"User-Agent":"mtgscan-research/0.1","Accept":"*/*"}
out="/tmp/embed-exp/images"; lock=threading.Lock(); last=[0.0]; failed=[]
def get(url):
    for a in range(2):
        try:
            r=requests.get(url,headers=H,timeout=30)
            if r.status_code==404: return 404
            if r.ok: return r.content
        except Exception: pass
        time.sleep(1)
    return None
def one(i):
    p=f"{out}/{i}.jpg"
    if os.path.exists(p): return
    b=get(f"https://cards.scryfall.io/normal/front/{i[0]}/{i[1]}/{i}.jpg")
    if not isinstance(b,bytes):
        with lock:
            dt=time.time()-last[0]
            if dt<0.1: time.sleep(0.1-dt)
            last[0]=time.time()
        r=requests.get(f"https://api.scryfall.com/cards/{i}",headers={**H,"Accept":"application/json"},timeout=30).json()
        u=(r.get("image_uris") or r["card_faces"][0]["image_uris"])["normal"]
        b=get(u)
    if isinstance(b,bytes): open(p,"wb").write(b)
    else: failed.append(i)
with ThreadPoolExecutor(8) as ex: list(ex.map(one,ids))
print("failed",len(failed),failed[:10])
