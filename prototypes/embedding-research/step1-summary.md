Step 1 (full-gallery zero-shot screen) done. Doc updated: new section 9, and sections 10 and 12 revised (old 9-11 renumbered to 10-12). Uncommitted; no other files touched.

Full gallery = all 102,730 rows of 20261012-cf1753 (Vision uses the shipped vectors). 250 card + 11 non-card crops, upright. No download failures; ~3.6 h on MPS (fp16 except PE-B, cos vs fp32 >= 0.9998).

| Model (setting) | K99 subset -> full | K100 full | Card first | Art first | Non-card max / card min | Turned view wins |
|---|---|---|---|---|---|---|
| Vision rev2 | 15 -> 51 | 4,243 | 97.2% | 95.2% | 0.480 / 0.569 | 15 |
| SigLIP2 B/16 (squash 256) | 6 -> 11 | 1,168 | 99.2% | 98.8% | 0.624 / 0.757 | 3 |
| PE-Core B16 (squash 224) | 12 -> 14 | 199 | 98.8% | 98.8% | 0.509 / 0.749 | 3 |
| PE-Core S16 (pad 384) | 21 -> 21 | 1,125 | 98.8% | 98.8% | 0.623 / 0.776 | 4 |
| DINOv3-S (336x464, CLS+mean) | 19 -> 49 | 450 | 92.8% | 92.8% | 0.527 / 0.699 | 5 |

Tuning: squash was best for SigLIP2 and PE-B, pad for PE-S. DINOv3's earlier failure came from timm's default mean pooling; the CLS token at 336x464 fixes it (K99 1,970 -> 19 on the subset).

Verdict: zero-shot, SigLIP2 B/16 and PE-Core B16 (both Apache 2.0) pass K99 <= 15 on the full gallery. They also beat Vision on card first, art first, and the non-card gap. Vision's own full-gallery K99 is 51; the earlier 15 came from #20's smaller test. Both models are ~93M parameters (~93 MB at int8), about 4x the 25 MB bar. PE-Core S16 (24M) beats Vision but misses <= 15. The open problem is model size, not accuracy.

Plan changes: added Step 1b, a recognizer replay with a zero-shot model, retuned thresholds and Gates 1/2. Step 2 now trains or distils a small model (PE-S size) toward SigLIP2/PE-B. Caveats: 62 printings from one phone; embedding-only, so no gates, phone latency, parity, or int8 tested yet. Scripts and metrics are in /tmp/embed-exp (full/metrics_full.json).