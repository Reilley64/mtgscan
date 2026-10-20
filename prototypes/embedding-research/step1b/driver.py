
import asyncio, json, os, sys
# usage: driver.py <binary> <gallery-dir> <real|simulated> <full|held-out> <out.json> [workers]
binary, gallery, which, mode, out = sys.argv[1:6]
workers = int(sys.argv[6]) if len(sys.argv) > 6 else 4
EV = "/Users/reilley/.t3/worktrees/mtgscan/embedding-replay/apps/mobile/test/scanner-evidence"
SIM = os.path.expanduser("~/Library/Caches/mtgscan/recognizer-simulated")
labels_path = f"{EV}/real/labels.json" if which == "real" else f"{SIM}/labels.json"
lab = json.load(open(labels_path)); d = os.path.dirname(labels_path)
held = mode == "held-out"
reqs = []
for i, c in enumerate(lab["cards"]):
    r = {"requestId": f"card-{i}"}
    if c.get("photo"): r.update(photoPath=os.path.join(d, c["photo"]), outline=c["quad"])
    else: r["cropPath"] = os.path.join(d, c["crop"])
    if held: r["excludeIds"] = [c["scryfallId"]]
    reqs.append((r, c.get("photo") or c["crop"], c["scryfallId"], c.get("group")))
for i, p in enumerate(lab.get("nonCards", [])):
    reqs.append(({"requestId": f"non-card-{i}", "cropPath": os.path.join(d, p)}, p, None, None))

async def worker(queue, results):
    proc = await asyncio.create_subprocess_exec(binary, "serve", gallery, stdin=asyncio.subprocess.PIPE,
                                                stdout=asyncio.subprocess.PIPE, limit=2**24)
    line = await proc.stdout.readline(); assert b"ready" in line, line
    seq = 0
    while not queue.empty():
        r, inp, truth, group = queue.get_nowait()
        proc.stdin.write((json.dumps(r) + "\n").encode()); await proc.stdin.drain()
        resp = json.loads(await proc.stdout.readline())
        results.append({"input": inp, "truth": truth, "group": group, "pid": proc.pid, "seq": seq, **resp}); seq += 1
    proc.stdin.close(); await proc.wait()

async def main():
    q = asyncio.Queue()
    for x in reqs: q.put_nowait(x)
    results = []
    await asyncio.gather(*[worker(q, results) for _ in range(workers)])
    order = {r[0]["requestId"]: k for k, r in enumerate(reqs)}
    results.sort(key=lambda x: order[x["requestId"]])
    json.dump({"which": which, "heldOut": held, "results": results}, open(out, "w"))
    print(len(results), "done", sum(1 for x in results if x.get("error")), "errors")
asyncio.run(main())
