# Step 1c summary: PE-Core S16 on the iPhone 16e and the Android emulator

| iPhone 16e, Core ML `.all` | 2 embeddings p50 / p95 | Lowest cos, model only (24) | Lowest cos, end to end (522) | Peak footprint | Size |
|---|---|---|---|---|---|
| Vision feature print rev 2 | 23.7 / 25.3 ms | - | - | 131.6 MB | built in (gallery 158 MB f16) |
| S16 float16 | 25.4 / 29.6 ms | 0.9997 | 0.9915 | 128.0 MB | 46.5 MB |
| S16 8-bit linear | 24.6 / 25.1 ms | 0.9955 | 0.9858 | 129.8 MB | 23.6 MB |
| S16 8-bit palette | 27.2 / 27.8 ms | 0.9986 | 0.9906 | 135.0 MB | 23.5 MB |
| S16 mixed float16 (NaN-safe) | 32.0 / 33.3 ms | 0.9998 | 0.9917 | 146.2 MB | 46.5 MB |

- Pure float16 (and the 8-bit models made from it) give NaN on `.cpuOnly`. The block 0 attention logits reach about 145k, and float16 stops at 65,504. Keeping 3 ops in float32 fixes it on every unit, for about 7 ms. `.cpuAndGPU` is 92-520 ms, so it misses the 40 ms line.
- Load: the first load after install takes about 3 s; later loads take 25 ms. `compileModel(at:)` takes 0.1-0.2 s. Gallery: 52.6 MB int8, 105 MB float16 on the phone (Vision's is 158 MB). Footprint includes about 104 MB of test images. Neural Engine weights and the mapped gallery do not count in it.
- Android emulator, LiteRT via litert-torch 0.9.4: float32 1.0000, float16 weights 1.0000, int8 weights 0.9977, dynamic int8 0.9884 (lowest of 24). No NaN. End to end from JPEG it is 0.979, because Android bilinear has no antialiasing. A smoothed downscale is needed. Emulator speed is not meaningful.
- SigLIP 2 B/16 (reference): 22.0 ms at float16 and 16.5 ms at 8-bit linear, but 8-bit linear fails parity (0.937). End to end with squash 256 reaches only 0.9705.

Verdict: PE-Core S16 passes the iPhone 16e latency line (p50 at most 40 ms) and the parity line (at least 0.98, no NaN) on `.all`, at float16 and at 8 bits. Use the mixed model so that a fallback to the CPU cannot give NaN; it takes 32 ms. App memory is about the same as with Vision. Android parity holds for LiteRT. Android speed and memory on a real phone are still not measured.
Details: doc section 11; /tmp/embed-exp/step1c; bench app in prototypes/embed-bench (embedding-replay branch, commit 5589d27, local only).
