# Open image embeddings vs Apple Vision FeaturePrint rev 2 on real mtgscan crops

Measured 2026-10-19 on this Mac (Apple Silicon, torch 2.14.1 on MPS). **This uses a reduced gallery of 4,456 printings, not the 102,730-printing catalog, so the absolute numbers are optimistic. Compare the models with each other.**

## Setup
- Queries: 250 labelled real card crops + 11 non-card crops from `apps/mobile/test/scanner-evidence/real/labels.json`. Crops are 488x680 upright JPEGs.
- Gallery (same rows for every model): every catalog printing whose `name` matches a labelled printing's name (59 names, 456 printings, including all same-art reprints) + 4,000 random other printings (`random.Random(20261019).sample`). Total 4,456. Row list: `subset.json`.
- Images: Scryfall `normal` front JPEGs (488x680), all 4,456 downloaded from cards.scryfall.io. None failed, so the API fallback was not needed.
- Vision FP rev 2: the gallery uses `gallery.f16` rows (no header; 157,793,280 B = 102730*768*2). Crops come from `featureprint.swift`: CIImage load with orientation -> resize to 488x680 -> `VNGenerateImageFeaturePrintRequest` rev 2, `.scaleFill` -> L2 norm. This copies `FeaturePrint.swift`/`CardRectifier.resized`.
  - Sanity: cosine 1.0000 on all 24 vectors recorded in `real/feature-prints.json`.
  - Recomputed FP of the 4,456 downloaded gallery images vs `gallery.f16`: median cosine 0.9997. 6 rows are below 0.98 (min 0.929); those Scryfall images probably changed after the gallery was built.
- Open models: squash the full card to the model's square input (PIL bicubic, no crop), apply the model's own mean/std, then L2 norm. Cosine similarity.
  - `dinov3_s16`: timm `vit_small_patch16_dinov3.lvd1689m`, `num_classes=0` (timm default pooled output), 224, ImageNet norm.
  - `dinov2_s14`: HF `facebook/dinov2-small` `pooler_output` (CLS + layernorm), 224, ImageNet norm.
  - `siglip2_b16_256`: HF `google/siglip2-base-patch16-256` `get_image_features`, 256, mean/std 0.5.
  - `mobileclip2_s0`: open_clip `MobileCLIP2-S0`/`dfndr2b` `encode_image`, 256, no normalisation (open_clip's own transform).
  - `pe_core_s16_384`: open_clip `PE-Core-S-16-384`/`meta` `encode_image`, 384, mean/std 0.5.
  - `pe_core_b16_224`: open_clip `PE-Core-B-16`/`meta` `encode_image`, 224, mean/std 0.5.
- Rotation: the crop is rotated 180° (PIL for open models, CGAffineTransform for Vision) and scored against the same gallery.

## Results
| model | top1 | top10 | top20 | top50 | K99 | K100 | name1 | art1 | nonmax | cardmin | sep | orient | orient03 | artmargin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| vision_fp2 | 0.688 | 0.980 | 0.996 | 0.996 | 15 | 180 | 0.992 | 0.972 | 0.450 | 0.563 | True | 0.984 | 0.944 | 0.085 |
| dinov3_s16 | 0.228 | 0.528 | 0.600 | 0.692 | 1970 | 2404 | 0.424 | 0.420 | 0.638 | 0.829 | True | 0.876 | 0.144 | 0.015 |
| dinov2_s14 | 0.324 | 0.708 | 0.776 | 0.832 | 1158 | 1634 | 0.568 | 0.540 | 0.390 | 0.582 | True | 0.776 | 0.540 | 0.078 |
| siglip2_b16_256 | 0.788 | 0.992 | 0.996 | 0.996 | 6 | 59 | 0.992 | 0.988 | 0.524 | 0.718 | True | 0.992 | 0.988 | 0.129 |
| mobileclip2_s0 | 0.660 | 0.924 | 0.956 | 0.988 | 94 | 518 | 0.944 | 0.936 | 0.383 | 0.688 | True | 0.992 | 0.956 | 0.079 |
| pe_core_s16_384 | 0.704 | 0.964 | 0.980 | 0.992 | 24 | 112 | 0.992 | 0.976 | 0.540 | 0.770 | True | 0.984 | 0.972 | 0.100 |
| pe_core_b16_224 | 0.704 | 0.988 | 1.000 | 1.000 | 12 | 14 | 0.996 | 0.992 | 0.428 | 0.715 | True | 0.988 | 0.988 | 0.119 |
| siglip2_b16_256_head | 0.848 | 0.972 | 0.972 | 0.980 | 114 | 802 | 0.988 | 0.984 | 0.518 | 0.472 | False | 0.984 | 0.976 | 0.266 |

Column key:
- top-K: exact printing in top K.
- K99/K100: smallest K that puts the exact printing in the top K for ≥99% / 100% of the 250 crops.
- name1/art1: top-1 name / illustrationId is correct.
- nonmax: max top-1 cosine over the 11 non-cards.
- cardmin: min top-1 cosine over the 250 cards.
- sep: nonmax < cardmin.
- orient: upright best cosine > best cosine of the 180° crop.
- orient03: same, with margin > 0.03.
- artmargin: median of top-1 minus the best score of a different illustration, over crops whose top-1 art is right.

Cosine scales differ by model, so compare thresholds and margins within one model only.

Top-1 exact printing is capped by same-art reprints. 51.6% of the crops have an illustration that more than one gallery printing shares, so art1 and name1 matter more than top1.

### Speed / size (MPS; the time includes JPEG decode and PIL resize on CPU, so it is an end-to-end upper bound, not pure model time)
| model | image-tower params | dim | ms/img batch 32 | ms/img batch 1 |
|---|---|---|---|---|
| vision_fp2 | n/a (OS) | 768 | ~18 (CPU+ANE/GPU via Vision, serial, incl. decode; run alongside another job) | same |
| dinov3_s16 | 21.6M | 384 | 13.1 | 16.7 |
| dinov2_s14 | 22.1M | 384 | 12.1 | 15.6 |
| siglip2_b16_256 | 92.9M | 768 | 36.5 | 47.0 |
| mobileclip2_s0 | 11.4M | 512 | 15.4 | 21.9 |
| pe_core_s16_384 | 23.8M | 512 | 59.5 | 106.6 |
| pe_core_b16_224 | 93.7M | 1024 | 57.8 | 125.7 |

The models ran one after another and were not repeated, so the timings are noisy. PE-Core-B at 224 measuring slower than SigLIP2-B at 256 looks wrong and may be thermal or caching noise.

## Stretch: synthetic-only head on frozen SigLIP2-B/16-256 (`siglip2_b16_256_head`)
- Frozen backbone. Head: MLP 768 -> 1024 -> GELU -> 512. Symmetric InfoNCE, τ = 0.05, AdamW 1e-3, 3,000 steps of ~320 printings per batch. Each batch packs 12 same-name groups (up to 8 printings each) as hard negatives, then fills with random printings.
- Views: the clean Scryfall image + 2 cached augmentations per gallery printing. Augmentations: random border crop/scale ±6%, perspective 0.12, rotation ±5°, brightness/contrast/colour 0.6–1.4, glare ellipse (p = 0.5), Gaussian blur (p = 0.5), JPEG quality 30–90. Features were cached once and the head trained on the cached features. **No real crops were used in training.** The training printings are the same 4,456 gallery printings that are evaluated, so this is transductive on the gallery.
- Cost: augmentation plus feature extraction took 16.5 min (CPU-bound PIL). Head training took 73 s on MPS. The loss collapsed to ~1e-3, which suggests the model overfits 3 views per printing.
- Result vs the plain SigLIP2 backbone:
  - Better: top-1 exact 0.788 -> 0.848, art margin 0.129 -> 0.266.
  - Worse: top-10 0.992 -> 0.972, K99 6 -> 114, K100 59 -> 802.
  - Non-card separation is lost (nonmax 0.518 > cardmin 0.472).
  - Net: worse for the recognizer's shortlist use. More augmentations per printing, stronger regularisation, or a residual/linear head on top of the frozen embedding would be the next things to try. None were tried here.

## Notes / oddities
- DINOv3-S is very poor zero-shot here (top-10 0.53). The timm default pooled output may be the wrong feature for retrieval (CLS vs patch-mean vs register tokens). Other pooling was not tried.
- DINOv2-S is also weak. The language-supervised models (SigLIP2, PE-Core, MobileCLIP2) are much better.
- No NaNs in any model.
- SigLIP2-B is the best zero-shot model on top-1 and K99 (6 vs Vision's 15), with a larger art margin (0.129 vs 0.085).
- PE-Core-B/16 has the best tail: K100 = 14, top-20 = 100%.
- Vision has one crop at rank 180, so its K100 = 180.
- All models separate the 11 non-cards from the 250 cards by top-1 cosine on this small set. Only 11 non-cards were tested.

## Commands / scripts (all in /tmp/embed-exp)
```
uv venv /tmp/embed-exp/.venv --python 3.12
uv pip install --python .venv/bin/python torch torchvision timm open_clip_torch transformers pillow numpy sentencepiece protobuf
python3 download.py                      # subset.json -> images/ (8 workers, retry once, API fallback)
swiftc -O featureprint.swift -o featureprint
./featureprint crops.txt vision_crops.f32; ./featureprint crops.txt vision_crops_rot.f32 rot180
./featureprint gal.txt vision_gal_check.f32   # parity check vs gallery.f16
.venv/bin/python embed.py <model>        # models.py holds loaders; writes emb/<model>_{gallery,crops,crops_rot}.npy + _meta.json
.venv/bin/python stretch.py siglip2_b16_256 2
.venv/bin/python evaluate.py <labels.json> vision_fp2 dinov3_s16 dinov2_s14 siglip2_b16_256 mobileclip2_s0 pe_core_s16_384 pe_core_b16_224 siglip2_b16_256_head
```
The subset selection (names of the labelled printings + 4,000 random, seed 20261019) was done inline in the agent REPL. Its output is `subset.json` (`rows` = catalog indices, `ids`). Metrics are in `metrics.json`.
