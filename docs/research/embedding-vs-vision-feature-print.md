# Can a trained embedding match Apple Vision feature prints?

Research notes for the Android embedding question (#20, #21, #389). Date: 2026-10-19.

The owner asked: "Would a model eventually get better than Apple Vision as we get new training crops?" Android has no Vision framework, so an Android build needs another image embedding. These notes ask whether an open model, trained or fine-tuned for cards and improved over time with the training crops from #389, could match or beat Vision feature prints for the recognizer as built. If it could, one model might serve both iOS and Android.

Labels:

- **Measured**: a number from mtgscan's own runs (#20, #21, the scanner evidence pack, or the run in section 8), or a number a cited paper measured.
- **Documented**: an official source (paper, model card, licence, vendor docs) states it.
- **Inference**: our reasoning. An experiment must confirm it.
- **Unverified**: a claim from a blog or a source we could not check.

## 1. What the recognizer needs from an embedding

The recognizer is `apps/mobile/modules/card-recognizer/ios/Recognizer/CardRecognizer.swift`. The embedding is used in these places (**Documented** in the code):

1. **Two vectors per scan.** It embeds the straightened card upright and turned 180 degrees, and takes the cosine with all 102,730 gallery rows (768 dimensions, int8 in the release gallery, float16 on the Mac). The orientation with the higher best score wins. A gap above 0.03 (`orientationMargin`) counts as confident. Otherwise the collector line is read in both orientations.
2. **Not a card.** If the best cosine is below 0.5 (`notACardSimilarity`), the scan is not a card.
3. **Shortlist.** The top 50 printings, plus every printing that shares the art of the top 10 (`illustrationExpansion`). The card names of the top 10 in each orientation also help spot a title read as a collector line.
4. **Collector line decides.** A full reading is accepted only if its card is among the top 10 cards of the image shortlist and its art is among the top 5 arts (`artCheckDepth`). A set code alone picks among shortlisted printings of the top card.
5. **No reading.** A card is accepted from the image alone only when no other printing shares its art, the frame is not the 2015 frame, and the next different art is at least 0.03 behind (`unreadArtMargin`).

So the embedding does not have to pick the exact printing. It has to put the right art in the top 5 and the right card in the top 10, keep cards and non-cards apart on an absolute cosine scale, tell upright from upside down, and give margins that a fixed threshold can use. The thresholds 0.5 and 0.03 belong to Vision's cosine scale. A new model needs its own values (**Inference**).

Vision's results today:

| Measure | Vision feature print revision 2 | Source |
| --- | ---: | --- |
| Exact printing in top 20, 21,418-printing gallery, 157 crops | 99.4% | #20 (**Measured**) |
| Top K for 99% exact printing, same set | 15 | #20 (**Measured**) |
| Top K for 99% exact printing, full 102,730 gallery, 250 evidence pack crops | 51 | section 9 (**Measured**) |
| Card name first, same set | 100% | #20 (**Measured**) |
| Exact printing first, same set | 63% to 76% for every model tested | #20 (**Measured**) |
| Best non-card cosine vs worst card cosine | 0.44 vs 0.55 | #20 (**Measured**) |
| Evidence pack, 250 card crops, full gallery | 249 right card first, 236 right printing first, 214 correct accepts, 0 false accepts, 11 of 11 non-cards rejected | `apps/mobile/test/scanner-evidence/README.md` (**Measured**) |
| Feature prints for both orientations on an iPhone 16e | 19 ms p50 | #21 (**Measured**) |
| Model to ship | none (system API) | |
| Gallery | 768 dimensions, int8, about 79 MB | #19 (**Documented**) |
| Mac-built gallery on the phone | lowest cosine 0.9997 over 24 references | #21 (**Measured**) |

Two facts from the installed gallery `20261012-cf1753` (**Measured**, counted from its `catalog.json`):

- 75,541 of 102,730 printings (73.5%) share their art with at least one other printing. There are 49,070 distinct arts.
- 86% of printings share a card name with another printing. There are 33,905 distinct names.

Same-art printings differ only in the set symbol, the collector line, or a stamp. A global embedding of a phone crop cannot be expected to separate them reliably. That is why every model in #20 gets the exact printing first only 63% to 76% of the time, and why the collector line decides (**Inference**, supported by #20).

## 2. What Apple Vision feature print is

- **Documented.** `VNGenerateImageFeaturePrintRequest` exists since iOS 13 and macOS 10.15. Revision 2 exists since iOS 17 and macOS 14 ([request](https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest), [revision 2](https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequestrevision2)). The pages say nothing about the model, its training data, or its size.
- **Documented.** At WWDC19, Apple said the feature print comes from the upper layers of Vision's image classification network, and that it describes "the content of the image" in "a semantic sense" ([WWDC19 session 222](https://developer.apple.com/videos/play/wwdc2019/222/)).
- **Documented.** Create ML's scene print feature extractor has revisions 1 and 2. Apple says it was "trained on millions of images", works best on real-world objects, and "is not suitable for character recognition" ([Create ML `scenePrint(revision:)`](https://developer.apple.com/documentation/createml/mlimageclassifier/featureextractortype/sceneprint(revision:))). At WWDC23, Apple said "the latest version of the Apple Neural Scene Analyzer" is now the Create ML feature extractor, with "a smaller output embedding size" than before ([WWDC23 session 10044](https://developer.apple.com/videos/play/wwdc2023/10044/)).
- **Documented.** Apple Neural Scene Analyzer (ANSA) is a MobileNetV3 variant with 16 million parameters. Since iOS 16 its backbone is trained with an image-language contrastive objective on "a few hundred million image-text pairs". All its heads run in under 9.7 ms on the Neural Engine, and the iOS 16 model adds a "perceptual print head" ([Apple ML Research, June 2022](https://machinelearning.apple.com/research/on-device-scene-analysis)).
- **Measured.** Revision 2 returns 768 floats, which the recognizer L2-normalises (`FeaturePrint.swift`). A community answer reports 2,048 unnormalised floats on iOS 16 and 768 normalised floats on iOS 17 (**Unverified**, [Stack Overflow](https://stackoverflow.com/questions/77185128/is-vnfeatureprintobservation-and-vision-distance-computation-different-for-two)).
- **Inference.** Revision 2 is probably an ANSA embedding. That would make it a small CLIP-style image-language model that was not trained for cards. This fits #20, where the CLIP-family models (MobileCLIP-S2, MobileCLIP2-S0) came closest to Vision, and ImageNet classifiers (EfficientNet-B0, MobileNetV4-M) did far worse.
- **Unverified (none found).** We found no published report of anyone beating Vision feature prints with a fine-tuned model on card or product retrieval. We also found no Apple statement on what revision 2 was trained on. Apps cannot fine-tune it.

So the bar is a strong general model, not a card model. Section 3 shows that a domain-trained model usually beats a general model inside its domain (**Inference**).

## 3. Fine-tuned vs general embeddings for instance retrieval

The papers below share our setting in part: many classes, few reference images per class, and queries from another camera domain.

| Study | Setting | General model | Fine-tuned model | Training data used |
| --- | --- | --- | --- | --- |
| UnED, ICCV 2023 ([paper](https://arxiv.org/abs/2309.01858)) | Retrieval R@1. Test classes are disjoint from training classes. | Off-the-shelf CLIP ViT-B/16, 768-D: SOP 65.4, Rp2k (retail products) 59.9, GLDv2 (landmarks) 31.0 | CLIP fine-tuned per domain ("specialist"), 64-D: SOP 81.2, Rp2k 84.4, GLDv2 46.6 | SOP 48,942 images of 9,054 classes; Rp2k 188,724 of 1,074; GLDv2 1.42 million of 73,182 |
| Tonioni and Di Stefano 2019 ([paper](https://arxiv.org/abs/1902.00760), [HTML](https://arxiv.org/html/1902.00760)) | Grocery products, one studio image per product, shelf photos as queries, 1-NN accuracy | Off-the-shelf VGG16 MAC: 0.792, 0.787, 0.725 on three test sets | Plain triplet fine-tuning: 0.799, 0.775, 0.765. Their GAN plus hierarchy method (DIHE): 0.853, 0.842, 0.827 | Only the 3,288 studio images of one product set. The third test set has only products unseen in training. |
| ILIAS, CVPR 2025 ([paper](https://arxiv.org/abs/2502.11748)) | 1,000 objects, 100 million distractors | Foundation models | "Models fine-tuned on specific domains, such as landmarks or products, excel in that domain but fail on ILIAS". A linear adaptation layer trained with multi-domain labels helps, "especially for vision-language models". Local descriptor re-ranking is "still a key ingredient". | UnED for the adaptation layer |
| GLDv2, CVPR 2020 ([paper](https://arxiv.org/html/2004.01804v2)) | Landmark retrieval | | Training on the cleaner, larger GLDv2 instead of GLDv1 improves mAP "by up to 10%" | GLDv2-train-clean: 1,580,470 images of 81,313 landmarks |
| A Metric Learning Reality Check, 2020 ([paper](https://arxiv.org/abs/2003.08505)) | Metric learning losses compared fairly | | "Actual improvements over time have been marginal at best" | |

What this says for mtgscan:

- **Documented.** Fine-tuning a general embedding on in-domain labels gains about 15 to 25 points of R@1 on products and landmarks (UnED). The gain holds on classes the model never saw in training, because UnED's test classes are disjoint from its training classes.
- **Documented.** With only one clean reference image per class and a camera domain gap, plain fine-tuning gains little (Tonioni and Di Stefano: "in the cross domain and low shot regime is quite hard to properly fine tune an embedding network"). Their gains came from generating harder, more realistic training images.
- **Documented.** The choice of loss matters less than papers claimed (Musgrave et al.). Data and backbone matter more (**Inference** from GLDv2 and UnED).
- **Inference.** The papers that gain a lot used tens of thousands to millions of labelled real images. #389 caps the training crops at about 6,000 on the Supabase Free plan. That is not enough to train a card embedding from crops alone. It is enough to test one, and to adapt one.

## 4. Synthetic training from Scryfall images vs real photos

Scryfall gives one clean image per printing: 102,730 printings and 49,070 distinct arts in the current gallery (**Measured**). The crops will be few and long-tailed: 6,000 crops cover at most 5.8% of printings, and most crops will be popular cards (**Inference**).

| Source | What they did | Result |
| --- | --- | --- |
| TCG-AR, 2026 ([paper](https://arxiv.org/html/2607.02090v1)) | Pokémon, 20,360 cards, one reference image each. ResNet-50 with a 512-D ArcFace head, trained only on synthetic crops: six augmented 224 x 224 crops per card. Tested on 636 real crops from top-down game footage. | Top-1 85.1% over all 20,360 cards (top-5 96.2%). The same backbone with a triplet head reached 1.7% on real crops, "although adequate on synthetic crops". Limiting the search to the 631 deck-list cards gave 96.4%. Cards released after the training cutoff "remain accurate" with no retraining. (**Measured** by the paper) |
| RPC retail checkout, 2019 ([paper](https://ar5iv.labs.arxiv.org/html/1901.07249)) | Product detection trained from single-product exemplar images. Copy-paste synthesis, then CycleGAN to make it look like checkout photos. | Checkout accuracy, easy mode: copy-paste 18.49%, CycleGAN-rendered 63.19%, both 73.17%. Realism of the synthetic images mattered a lot. (Detection, not retrieval.) |
| Nowruzi et al., 2019 ([paper](https://arxiv.org/html/1907.07061)) | Detection, large synthetic sets plus 2.5% to 10% real data | "Fine-tuning synthetic training model with limited real data provides better results than mixed training". Realistic sensor distortion "ha[s] a larger effect" than photo-realism. |
| Yu-Gi-Oh one-shot recognizer ([repo](https://github.com/vanstorm9/yugioh-one-shot-learning)) | ResNet-101 with triplet loss on 10,856 official card images | About 99% on brightness, contrast, and shear changes of the same database images. The author lists real photos as future work. (**Unverified** on real photos) |

What this says for mtgscan:

- **Inference.** Train the embedding mostly on augmented Scryfall images, with every printing in training. Use the crops for three things, in this order: a held-out test set that training never sees, threshold calibration, and a small final fine-tune for the camera gap (light, glare, sleeves, foil, wear). The crops do not need to cover every printing, because a metric embedding generalises to unseen classes (UnED, TCG-AR).
- **Inference.** The augmentation must copy the phone path, not generic photo noise: the rectifier's corner error and slight perspective, both orientations, white balance and exposure, glare spots and sleeve sheen, foil sheen, blur, sensor noise, JPEG, and edge wear. `apps/mobile/test/scanner-evidence/simulated/simulate.py` already renders phone-like scans. The evidence pack README warns that its simulation "starts from the same scans as the gallery, so the image match is easier than for real photos". So simulated scores are optimistic, and the real crops are the test that counts.
- **Inference.** The ArcFace result in TCG-AR suggests a classification-style loss over all classes. For MTG, one class per art (49,070 classes) fits the recognizer, which needs the right art and card, not the right printing. Same-name, different-art printings make the hard negatives.
- **Inference.** Crop labels are the printing the user saved (#389). Same-text twins (about 16% of printings, #19) make the printing label unreliable for those cards. Art-level labels avoid most of that noise.

## 5. MTG and trading card recognizers that train their own embedding

| Project | Embedding | Reported result |
| --- | --- | --- |
| TCG-AR (Pokémon), [paper](https://arxiv.org/html/2607.02090v1), [code](https://github.com/ULiege-VIULab/tcg-ar) | ResNet-50, ArcFace, synthetic data only | 85.1% top-1 of 20,360 cards on real game footage (section 4) |
| nmichlo/mtg-vision ([repo](https://github.com/nmichlo/mtg-vision)) | ConvNeXt V2, CircleLoss, Scryfall images augmented twice per card, same-name hard negatives, Qdrant search. "Real-world MTG card recognition using only synthetic data". | No accuracy published. ConvNeXt V2 FCMAE weights on timm are CC BY-NC 4.0 ([timm/convnextv2_nano.fcmae_ft_in22k_in1k](https://huggingface.co/timm/convnextv2_nano.fcmae_ft_in22k_in1k)), so that starting point is not for products. |
| coldwaterq/mtg-card-scanner ([repo](https://github.com/coldwaterq/mtg-card-scanner), [util.py](https://github.com/coldwaterq/mtg-card-scanner/blob/main/util.py)) | Off-the-shelf CLIP ViT-bigG in Milvus, no training | Code comments: OpenAI CLIP ViT-L "can't identify correct set in top 10"; ViT-bigG "correct set between 3-5". (**Unverified**) |
| PokeScope (Pokémon app), [blog](https://pokescope.app/blog/how-i-built-pokemon-card-scanner-ai-50000-users/) | Fine-tuned CLIP, YOLOv8, OCR for card numbers | "Went from ~60% to 95%+ match accuracy". Still needed OCR for near-identical cards. Months of manual photos through sleeves. (**Unverified**, vendor blog) |
| Yu-Gi-Oh one-shot ([repo](https://github.com/vanstorm9/yugioh-one-shot-learning)) | ResNet-101, triplet loss, ORB re-ranking | About 99% on simulated images only (section 4) |
| fortierq/mtgscan, reeshof/MTG-card-scanner (cited in #7) | fortierq: cloud OCR and fuzzy name matching. reeshof: not an embedding gallery | reeshof: 98.8% name accuracy on 81 cards, set ignored (#7) |

- **Documented.** Every public MTG project we found that trains an embedding uses synthetic data from Scryfall. None publishes a real-photo accuracy at the printing or art level.
- **Documented.** The only paper with real-photo numbers (TCG-AR) gets 85% top-1 over 20,360 Pokémon cards from synthetic data alone. That is not directly comparable to #20. TCG-AR's crops are small, top-down video crops of cards on a table, and Pokémon has fewer same-art reprints.
- **Inference.** Two independent sources (TCG-AR, PokeScope) and #20 agree that near-identical printings need OCR or a deck list, not a better embedding.

## 6. Candidate backbones for both iOS and Android

Licences checked on the model cards and licence files on 2026-10-19. "Image params" counts the image tower only.

| Model | Weights licence | Image params | Mobile evidence | mtgscan zero-shot (#20) |
| --- | --- | ---: | --- | --- |
| Apple Vision feature print rev 2 | System API, Apple only | about 16M if ANSA (**Inference**) | 19 ms for two images on iPhone 16e (#21) | 99.4% top 20, K99 = 15 |
| MobileCLIP-S2, MobileCLIP2-S0, DFN CLIP | Apple research licence: "exclusively for Research Purposes", which "does not include ... product development", and fine-tunes inherit this ([MobileCLIP2 LICENSE](https://huggingface.co/apple/MobileCLIP2-B/blob/main/LICENSE); `apple-amlr` on [apple/DFN2B-CLIP-ViT-B-16](https://huggingface.co/apple/DFN2B-CLIP-ViT-B-16)) | 11.4M (S0) | 1.5 ms image encoder on iPhone 12 Pro Max ([MobileCLIP2 paper](https://arxiv.org/html/2508.20691v1)) | 98.7% top 20, K99 = 21 to 24. **Not usable.** |
| SigLIP 2 B/16-256 | Apache 2.0 ([model card](https://huggingface.co/google/siglip2-base-patch16-256)) | 92.9M | 11.4 ms on iPhone 12 Pro Max (MobileCLIP2 paper, table of baselines) | 99.6% top 20, K99 = 6 on a 4,456 gallery (section 8) |
| Meta Perception Encoder PE-Core T16, S16, B16 | Apache 2.0 ([PE-Core-S16-384](https://huggingface.co/facebook/PE-Core-S16-384), [PE-Core-T16-384](https://huggingface.co/facebook/PE-Core-T16-384), [PE-Core-B16-224](https://huggingface.co/facebook/PE-Core-B16-224)) | S16: 23.8M ([timm](https://huggingface.co/timm/vit_pe_core_small_patch16_384.fb)); B16: 90M | none published for phones | B16: 100% top 20, K99 = 12; S16: 98.0%, K99 = 24 (section 8) |
| DINOv3 ViT-S/16 | DINOv3 License: commercial use allowed; derivatives you distribute stay under the same licence with a copy of it; no reverse engineering of the materials; trade-control and military-use limits; Meta may change the terms ([LICENSE.md](https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md)) | 21.6M | Core ML float16 gave NaN even on real crops (earlier mtgscan work, **Measured**, unpublished) | 94.3% top 20, K99 = 213 (60% in section 8 with untuned preprocessing) |
| DINOv2-S | Apache 2.0 ([model card](https://huggingface.co/facebook/dinov2-small)) | 22M | | 47% to 64% top 20 (with EfficientNet-B0, MobileNetV4-M) |
| MobileNetV4-Conv-M, EfficientNet-B0, ConvNeXt (timm ImageNet weights) | Tagged Apache 2.0, but timm says ImageNet "was released for non-commercial research purposes only" and "one should assume that the original dataset license applies to the weights" ([timm README](https://github.com/huggingface/pytorch-image-models#licenses)) | 9.2M (MNv4-M), 5.3M (B0) | MNv4-Conv-M: 1.1 ms iPhone 13 Core ML, 11.4 ms Pixel 6 CPU, 4.1 ms Samsung S23 GPU ([MobileNetV4 paper](https://arxiv.org/html/2404.10518)) | 47% to 64% top 20 |
| MobileNetV5-300M (Gemma 3n) | Gemma terms ([timm/mobilenetv5_300m.gemma3n](https://huggingface.co/timm/mobilenetv5_300m.gemma3n)) | 294M | | not run |
| OpenCLIP LAION ViT-B/32 | MIT ([model card](https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K)) | about 88M | | not run |

Runtimes (**Documented**):

- **Core ML** on iOS through `coremltools` ([docs](https://apple.github.io/coremltools/docs-guides/source/opt-overview.html), which also cover 8-bit and lower weight compression).
- **LiteRT** runs on Android and iOS. Its Core ML delegate on iOS is beta and supports float32 and float16 models only ([Core ML delegate](https://ai.google.dev/edge/litert/performance/coreml_delegate)). PyTorch models convert with LiteRT Torch ([repo](https://github.com/google-ai-edge/ai-edge-torch)).
- **ExecuTorch** lists XNNPACK, Vulkan, Qualcomm, MediaTek, and Samsung backends on Android, and XNNPACK and Core ML on iOS ([README](https://github.com/pytorch/executorch)).
- **ONNX Runtime** has a Core ML execution provider for iOS ([docs](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)).

- **Inference.** The gallery is built once, on the owner's Mac, and both phones search it. So the Android runtime and the iOS runtime must give the same vector as the Mac for the same crop. Vision passes this today with 0.9997 (#21). A trained model needs the same parity check on each runtime and each precision, with real crops, not random input. The DINOv3 NaN result shows float16 can fail outright.
- **Inference.** Gallery size scales with the dimension: 102,730 x 768 bytes is about 79 MB at int8. A 256-D embedding would be about 26 MB.

**Training on Scryfall images (brief).** Scryfall provides its data and images "as part of the Wizards of the Coast Fan Content Policy ... for the primary purpose of creating additional Magic software, performing research, or creating community content". Its image rules forbid showing card images distorted, blurred, or colour-shifted, and forbid cropping off the copyright or artist ([Scryfall API docs](https://scryfall.com/docs/api)). Those rules are about showing images. They do not mention training. The Fan Content Policy requires the content to be free and lets Wizards stop any use "for any reason or no reason" ([Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)). #19 already records that Scryfall's policy does not settle training on its images. The trained weights would be derived from card art that Wizards owns. This needs the same review as the rest of the Scryfall terms before a wider release (**Inference**).

## 7. Is the embedding the bar?

Only partly. The collector line makes the final choice between same-art printings, and that reading is Vision text recognition. Android needs its own text reader too, such as ML Kit text recognition (#7). The Android recognizer will only be as good as both parts (**Inference**).

A new embedding should be judged on the measures the recognizer uses, not on "exact printing first":

| Measure | Why the recognizer needs it | Vision today |
| --- | --- | --- |
| Top K for 99% exact printing | The shortlist is 50 plus art expansion | 15 on the 21,418 gallery (#20) |
| Right art in the top 5, right card in the top 10 | A reading is accepted only inside these | 249 of 250 right card first (evidence pack) |
| Name first and art first | Decides what the user sees first and the no-reading accept | 100% name first (#20) |
| Accepts without a reading at 0 false accepts | Needs a usable margin to the next art | part of 214 correct accepts (evidence pack) |
| Non-card gap | One fixed threshold must reject non-cards | 0.44 non-card vs 0.55 card (#20) |
| Orientation | Upright must score above upside down | passes every gate |
| Model plus gallery size | Download and memory | 0 MB model, 79 MB gallery |
| Time for two embeddings | Inside the 205 ms recognizer p50 | 19 ms on iPhone 16e (#21) |
| Parity between Mac, iOS, and Android | One gallery for every phone | 0.9997 (#21) |
| New sets | Gallery rebuild only, no retraining | yes |

- **Inference.** Exact printing first is capped near 63% to 76% for any global embedding by same-art reprints (section 1). A trained model could raise it a little by learning set symbols and frame details, but the collector line will still decide.
- **Inference.** Every threshold must be re-tuned for a new model, on crops that were not used for training, and checked with the held-out mode of the evidence pack.

## 8. Local check of zero-shot open models against Vision

A small run for these notes on 2026-10-19, on an M3 Mac, in a separate environment under `/tmp/embed-exp` (not in the repo). All numbers are **Measured**, with no training.

Setup:

- **Queries.** The evidence pack's 250 card crops (62 printings, one iPhone) and 11 non-card crops, from `apps/mobile/test/scanner-evidence/real/labels.json`, upright and turned 180 degrees.
- **Gallery.** 4,456 printings: all 456 printings that share a name with a labelled crop (so every same-art reprint is in), plus 4,000 random printings (seed 20261019). Images are Scryfall `normal` fronts. This is about 4% of the 102,730-printing catalog, so every absolute number is optimistic. The comparison between models is the point.
- **Vision.** Gallery rows come from the installed gallery `20261012-cf1753`. Crop vectors come from a small Swift tool with the same settings as `FeaturePrint.swift` (488 x 680, `.scaleFill`, revision 2, L2-normalised). Recomputing 20 gallery images on this Mac gave a lowest cosine of 0.9996 with the stored rows. Over all 4,456 downloaded images the median was 0.9997, and 6 rows were below 0.98, probably because Scryfall replaced those images after the gallery was built. The open models embed today's images, so they see slightly newer images than Vision's stored rows.
- **Open models.** Each image is squashed to the model's square input with the model's own normalisation. Global image embedding, L2-normalised, cosine. No per-model tuning of crop, aspect ratio, or pooling.

| Model (licence) | Exact printing first | Top 10 | Top 20 | Top K for 99% | Top K for 100% | Card first | Art first | Best non-card / worst card cosine | Upright wins | Median art margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Vision feature print rev 2 (system) | 68.8% | 98.0% | 99.6% | 15 | 180 | 99.2% | 97.2% | 0.450 / 0.563 | 98.4% | 0.085 |
| SigLIP 2 B/16-256 (Apache 2.0) | 78.8% | 99.2% | 99.6% | **6** | 59 | 99.2% | 98.8% | 0.524 / 0.718 | 99.2% | 0.129 |
| PE-Core B16-224 (Apache 2.0) | 70.4% | 98.8% | 100% | 12 | **14** | **99.6%** | **99.2%** | 0.428 / 0.715 | 98.8% | 0.119 |
| PE-Core S16-384 (Apache 2.0) | 70.4% | 96.4% | 98.0% | 24 | 112 | 99.2% | 97.6% | 0.540 / 0.770 | 98.4% | 0.100 |
| MobileCLIP2-S0 (research only) | 66.0% | 92.4% | 95.6% | 94 | 518 | 94.4% | 93.6% | 0.383 / 0.688 | 99.2% | 0.079 |
| DINOv3 ViT-S/16 (DINOv3 License) | 22.8% | 52.8% | 60.0% | 1,970 | 2,404 | 42.4% | 42.0% | 0.638 / 0.829 | 87.6% | 0.015 |
| DINOv2-S (Apache 2.0) | 32.4% | 70.8% | 77.6% | 1,158 | 1,634 | 56.8% | 54.0% | 0.390 / 0.582 | 77.6% | 0.078 |

Image tower sizes: SigLIP 2 B/16 92.9M parameters (768-D), PE-Core B16 93.7M (1,024-D), PE-Core S16 23.8M (512-D), MobileCLIP2-S0 11.4M (512-D), DINOv3-S and DINOv2-S about 22M (384-D). No model gave NaN in float32 on the Mac. Mac timings are not phone timings and are left out.

What this shows:

- **Measured.** Zero-shot, with no training, SigLIP 2 B/16 and PE-Core B16 already match or beat Vision on this gallery on every measure the recognizer uses: top K for 99% (6 and 12 vs 15), art first (98.8% and 99.2% vs 97.2%), and a wider gap between non-cards and cards (0.19 and 0.29 vs 0.11). Both licences allow product use.
- **Measured.** Exact printing first stays between 69% and 79% for the best models, as in #20. Same-art reprints still need the collector line.
- **Measured.** The small PE-Core S16 (24M) is close to Vision but behind it (K99 24 vs 15).
- **Measured, with a caveat.** DINOv3-S and MobileCLIP2-S0 did much worse here than in #20 (94.3% and 98.7% top 20 there). The likely cause is preprocessing. This run squashed each card to a square and used the default pooled output, with no per-model choices. Section 9 confirms this. With the CLS token instead of timm's default mean pooling, DINOv3-S goes from K99 1,970 to 19.
- **Not shown.** These are 250 crops of 62 printings from one phone, on a gallery 23 times smaller than the catalog. On the full gallery, K values will grow for every model (section 9). The run does not show phone latency, Core ML or LiteRT parity, or int8 behaviour.
- **Measured.** A quick synthetic-only adapter made things worse for the shortlist. A small MLP head (768 to 1,024 to 512) on frozen SigLIP 2 was trained for 73 seconds with InfoNCE on each gallery printing's clean image plus 2 augmented copies, with same-name hard negatives and no real crops. Exact printing first rose from 78.8% to 84.8% and the median art margin from 0.129 to 0.266. But top 10 fell from 99.2% to 97.2%, K99 grew from 6 to 114, and non-cards no longer separated from cards (best non-card 0.518, worst card 0.472). With only 3 views per printing, the head overfits. A real training run needs many more augmented views per printing and a held-out check (section 14).

The scripts are in `/tmp/embed-exp` (`download.py`, `featureprint.swift`, `models.py`, `embed.py`, `evaluate.py`).

## 9. Full-gallery screen: zero-shot open models vs Vision on all 102,730 printings

Step 1 of the plan, run on 2026-10-19 and 2026-10-20 on the M3 Mac in `/tmp/embed-exp`, with no training. All numbers are **Measured**.

Setup:

- **Gallery.** Every printing in the installed Vision gallery `20261012-cf1753`, in its row order (102,730 printings). Vision uses the shipped vectors from `gallery.f16`. The open models embed Scryfall `normal` front images, downloaded from `cards.scryfall.io` in chunks of 1,024, embedded, and deleted. No image failed to download. The pass took about 3.6 hours.
- **Queries.** The same 250 card crops and 11 non-card crops as section 8, upright and turned 180 degrees.
- **Precision.** SigLIP 2, PE-Core S16, and DINOv3 ran in float16 on MPS, PE-Core B16 in float32. On 256 gallery images, float16 and float32 vectors agreed to a lowest cosine of 0.9998 or better for every model, with no NaN. Vectors are stored as float16.

### 9.1 Preprocessing chosen on the 4,456 subset

A few variants each, chosen by K99 on the section 8 subset. "Squash" stretches the card to the input size, "pad" keeps the aspect ratio and fills the sides with the model's mean colour, and "crop" cuts a centre square. Bold rows are the chosen settings.

| Model | Variant | Pooling | K99 | K100 | Art first | Non-card gap |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| DINOv3 ViT-S/16 | pad 224 | CLS + mean | 47 | 85 | 94.4% | 0.211 |
| DINOv3 ViT-S/16 | pad 224 | CLS | 35 | 96 | 95.2% | 0.205 |
| DINOv3 ViT-S/16 | pad 224 | mean of patches | 2,495 | 2,652 | 40.4% | 0.115 |
| DINOv3 ViT-S/16 | squash 224 | CLS + mean | 75 | 298 | 92.4% | 0.239 |
| DINOv3 ViT-S/16 | squash 224 | CLS | 45 | 242 | 93.2% | 0.262 |
| DINOv3 ViT-S/16 | squash 224 | mean of patches | 1,970 | 2,404 | 42.0% | 0.191 |
| DINOv3 ViT-S/16 | squash 224 x 320 | CLS + mean | 70 | 220 | 95.6% | 0.211 |
| DINOv3 ViT-S/16 | squash 224 x 320 | CLS | 30 | 349 | 94.8% | 0.239 |
| DINOv3 ViT-S/16 | squash 224 x 320 | mean of patches | 1,185 | 1,956 | 46.4% | 0.153 |
| DINOv3 ViT-S/16 | **squash 336 x 464** | CLS + mean | **19** | 21 | 98.0% | 0.199 |
| DINOv3 ViT-S/16 | squash 336 x 464 | CLS | 20 | 21 | 98.4% | 0.213 |
| DINOv3 ViT-S/16 | squash 336 x 464 | mean of patches | 802 | 2,013 | 60.0% | 0.145 |
| PE-Core B16-224 | crop 224 | model default | 21 | 22 | 100.0% | 0.176 |
| PE-Core B16-224 | pad 224 | model default | 15 | 901 | 99.6% | 0.281 |
| PE-Core B16-224 | **squash 224** | model default | **12** | 14 | 99.2% | 0.287 |
| SigLIP 2 B/16-256 | crop 256 | model default | 13 | 284 | 98.8% | 0.117 |
| SigLIP 2 B/16-256 | pad 256 | model default | 11 | 155 | 98.8% | 0.147 |
| SigLIP 2 B/16-256 | **squash 256** | model default | **6** | 59 | 98.8% | 0.193 |
| PE-Core S16-384 | crop 384 | model default | 168 | 385 | 98.0% | 0.102 |
| PE-Core S16-384 | **pad 384** | model default | **21** | 57 | 99.6% | 0.220 |
| PE-Core S16-384 | squash 384 | model default | 24 | 112 | 97.6% | 0.230 |

- DINOv3's poor section 8 result came from timm's default output, which averages the patch tokens. The CLS token works far better (K99 1,970 to 45 at the same input), and a larger non-square input (336 x 464, which DINOv3's position encoding allows) brings K99 to 19. CLS + mean was chosen by the K99 rule. CLS alone (K99 20, 384 dimensions) is almost the same.
- Squash was best for SigLIP 2 and PE-Core B16. Pad was slightly better for PE-Core S16. A centre crop cuts off the title and the collector line, and it was never best.

### 9.2 Results on the full gallery

Upright queries, as in section 8. The recognizer itself also tries the turned view and reads the collector line in both views when unsure (section 1), so "Upright wins" and the next column describe the embedding only.

| Model and setting | Exact printing first | Top 10 | Top 20 | Top K for 99% | Top K for 100% | Card first | Art first | Best non-card / worst card cosine | Upright wins | Crops where the turned view scores higher | Median art margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Vision feature print rev 2 | 67.2% | 96.8% | 98.8% | 51 | 4,243 | 97.2% | 95.2% | 0.480 / 0.569 | 94.0% | 15 | 0.071 |
| SigLIP 2 B/16-256, squash 256 | 78.4% | 98.8% | 99.2% | 11 | 1,168 | 99.2% | 98.8% | 0.624 / 0.757 | 98.8% | 3 | 0.107 |
| PE-Core B16-224, squash 224 | 70.0% | 98.0% | 99.6% | 14 | 199 | 98.8% | 98.8% | 0.509 / 0.749 | 98.8% | 3 | 0.098 |
| PE-Core S16-384, pad 384 | 68.4% | 96.4% | 98.8% | 21 | 1,125 | 98.8% | 98.8% | 0.623 / 0.776 | 98.4% | 4 | 0.084 |
| DINOv3 ViT-S/16, squash 336 x 464, CLS + mean | 62.0% | 93.2% | 97.6% | 49 | 450 | 92.8% | 92.8% | 0.527 / 0.699 | 98.0% | 5 | 0.108 |

Right shortlist, measured the way the recognizer builds it (the true printing is in the top 50, or shares the art of one of the top 10): 99.2% for Vision, SigLIP 2, and PE-Core S16, 99.6% for PE-Core B16, and 99.2% for DINOv3. The same two crops miss for Vision, SigLIP 2, and PE-Core S16. One is Angel's Grace SOA 2, the Mystical Archive card that also chose the wrong view in #21. The other is the upside-down Gravedigger TMP crop from #21. The recognizer's turned view handles the second.

How K99 grew from the subset to the full gallery, 23 times larger:

| Model | K99, 4,456 subset | K99, full gallery | K100, subset | K100, full gallery |
| --- | ---: | ---: | ---: | ---: |
| Vision feature print rev 2 | 15 | 51 | 180 | 4,243 |
| SigLIP 2 B/16-256 | 6 | 11 | 59 | 1,168 |
| PE-Core B16-224 | 12 | 14 | 14 | 199 |
| PE-Core S16-384 | 21 | 21 | 57 | 1,125 |
| DINOv3 ViT-S/16 | 19 | 49 | 21 | 450 |

Model size, from the image tower parameter counts (section 8): SigLIP 2 B/16 93M parameters, about 186 MB at float16 or 93 MB at 8 bits. PE-Core B16 94M, about the same. PE-Core S16 24M, about 48 MB at float16 or 24 MB at 8 bits. DINOv3-S 22M. Gallery at int8: 768 dimensions is about 79 MB (SigLIP 2, DINOv3 CLS + mean), 1,024 is about 105 MB (PE-Core B16), 512 is about 53 MB (PE-Core S16), 384 is about 39 MB (DINOv3 CLS only).

What this shows:

- **Measured.** On the full catalog, Vision's own K99 on these 250 crops is 51, not the 15 measured in #20. #20 used 157 crops and a 21,418-printing gallery. The bar "K99 at most 15" in section 14 was set from that smaller test.
- **Measured.** Zero-shot, SigLIP 2 B/16 (K99 11) and PE-Core B16 (K99 14) beat Vision (K99 51) and meet "at most 15" on the full gallery. Both also beat Vision on card first (99.2% and 98.8% vs 97.2%), art first (98.8% vs 95.2%), the non-card gap (0.133 and 0.240 vs 0.089), and the median art margin.
- **Measured.** PE-Core S16, the smallest of the strong candidates (24M parameters), gets K99 21. That is better than Vision's 51 but misses "at most 15". DINOv3-S with tuned preprocessing is about level with Vision on K99 (49) and behind it on card first and art first.
- **Measured.** The open models pick the right orientation more often. The turned view scores higher on 15 of 250 crops for Vision and on 3 to 5 for the open models.
- **Measured.** All four open models keep every non-card below every card on the full gallery, as Vision does. With 11 non-card crops, that is weak evidence.
- **Not shown.** These are still 250 crops of 62 printings from one phone. The run measures the embedding only. It does not run the recognizer's decision rules with new thresholds (Gates 1 and 2), phone latency, Core ML or LiteRT parity, or int8 vectors. The best two models are about 4 times larger than PE-Core S16 (section 12.1).

The scripts are in `/tmp/embed-exp` (`tune.py`, `full.py`, `eval_full.py`, `common.py`, `prep_models.py`). Results are in `/tmp/embed-exp/full/metrics_full.json`.

## 10. Recognizer replay: zero-shot open models behind the recognizer

Step 1b of the plan, run on 2026-10-20 on the M3 Mac. Numbers are **Measured** unless marked.

Setup:

- **Recognizer.** The macOS recognizer command on the branch `prototype/embedding-replay` (not merged). A small hook lets the command use precomputed vectors instead of Vision. Each embedding input is the recognizer's own 488 x 680 image after rectification, upright and turned. The command dumps those images, keyed by the SHA-256 of their pixels. The Python model embeds them with the gallery's preprocessing (section 9.1), and the command looks the vectors up by the same key. Every decision rule is the shipped code. Only the three cosine thresholds come from the environment. All runs had 0 recognizer errors, so the rectified images were identical from run to run.
- **Gallery.** The section 9 vectors, quantised to int8 per vector with the shipped encoder (`GalleryEncoding.int8Codes`, decoded with `unitVector`), in the row order of `20261012-cf1753`. Float16 runs were also made for comparison.
- **Baseline.** `bun run recognizer:replay` with the installed gallery `20261012-cf1753` exits 0: parity 1.0 over 24 references, and every gate of Gates 1 and 2 matches the expected files. The prototype hook, run with Vision, gives the same results.
- **Gates.** Gate 1 is 250 real crops and 11 non-cards. Gate 2 is 3,000 simulated scans. Each runs on the full gallery and held out, with the pass criteria of the scanner evidence pack README. Gate 2 photos are rendered from Scryfall `large` images, and the galleries use Scryfall `normal` images, so Gate 2 is easier than real photos.

### 10.1 Which thresholds depend on the cosine scale

- `notACardSimilarity` (0.5) and `unreadArtMargin` (0.03) change decisions.
- `orientationMargin` (0.03) changes no decision. The second collector-line read can replace the first only with a stronger reading, and a confident first reading is already full strength. So the margin only decides whether the second read runs. Checked: with the margin at 1.0, SigLIP 2 gave identical results on Gate 1. It stays at 0.03 for every model. At 0.03 the open models are confident on 96% to 99% of the real crops.
- The shortlist, art check depth, and title candidates use ranks, not cosines.

### 10.2 Tuning rule

Leave one art out. Each scan gets thresholds fitted on every scan whose true art is different, from the real and simulated sets and from both the full and held-out runs. Each non-card is its own fold.

- **Not a card.** The midpoint between the best non-card and the worst card (top cosine, full runs).
- **Art margin.** The smallest step of 0.0025 above every accept without a reading that breaks a gate on the tuning scans. A wrong printing in Gate 1 full, any accept in Gate 1 held out, and a wrong card in Gate 2 break a gate.

Nothing is tuned on the scan it is reported on. The rule fits each threshold exactly to the worst case of the other folds, with no safety margin. So the worst case of each model fails once when it is held out. Vision gets the same rule in the table below, next to its shipped thresholds.

Fitted thresholds (all data, int8): Vision 0.526 and 0.0275, SigLIP 2 0.678 and 0.0775, PE-Core S16 0.689 and 0.025, PE-Core B16 0.616 and 0.05. Leave one art out changes these only for the folds that hold the worst case.

### 10.3 Results, int8 gallery

"Unread" counts correct accepts without a collector line reading (only printing of its art). Gate 2 full allows other printings of the right card (358 recorded for Vision), so they are not counted as failures.

| Model, thresholds | Gate 1 correct accepts | Wrong card | Wrong printing | Non-cards rejected | Unread | Abstains | Held-out accepts | Gate 1 | Gate 2 correct accepts | Wrong card | Unread | Abstains | Held-out wrong cards | Gate 2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Vision, shipped 0.5 and 0.03 | 214 | 0 | 0 | 11 of 11 | 14 | 36 | 0 | pass | 2,135 | 0 | 91 | 507 | 0 | pass |
| Vision, leave one art out | 215 | 0 | 0 | 11 of 11 | 15 | 35 | 0 | pass | 2,136 | 0 | 92 | 506 | 1 | fail |
| SigLIP 2 B/16, leave one art out | 213 | 0 | 0 | 11 of 11 | 11 | 37 | 1 | fail | 2,120 | 0 | 74 | 520 | 3 | fail |
| PE-Core S16, leave one art out | 216 | 0 | 0 | 11 of 11 | 15 | 34 | 0 | pass | 2,141 | 0 | 95 | 500 | 1 | fail |
| PE-Core B16, leave one art out | 213 | 0 | 0 | 11 of 11 | 14 | 37 | 1 | fail | 2,137 | 0 | 90 | 505 | 1 | fail |

With the thresholds fitted on all the data (in sample, so optimistic), Vision and PE-Core S16 pass every gate. SigLIP 2 and PE-Core B16 still fail Gate 2 held out with 3 and 1 wrong cards. PE-Core S16 then gives 216 correct accepts on Gate 1 (Vision 214) and 2,141 on Gate 2 (Vision 2,135).

Every failure in the table:

| Model | Gate | Scan | What happened | A cosine threshold controls it |
| --- | --- | --- | --- | --- |
| Vision, leave one art out | Gate 2 held out | `sim-02774` | Swamp UGL 86 accepted for Forest UGL 88, unread, art margin 0.027 | yes (Vision's own worst case) |
| PE-Core S16 | Gate 2 held out | `sim-02734` | Penance EXO 15 accepted for Demonic Consultation ICE 121, unread, margin 0.024 | yes (its own worst case) |
| SigLIP 2, PE-Core B16 | Gate 1 held out | `muyuq3pm-25` | Athreos plst JOU-146 accepted with JOU 146 held out. It is a same-text twin with the same art. Margin 0.076 (SigLIP 2), 0.048 (PE-Core B16), 0.022 (Vision) | yes |
| SigLIP 2, PE-Core B16 | Gate 2 held out | `sim-02104` | Starscape Cleric BLB 116 accepted for Moonrise Cleric BLB 226, from the set code alone | no |
| SigLIP 2 | Gate 2 held out | `sim-02275`, `sim-02695` | Spirit Mascot SOS 230 for Pest Mascot SOS 209, Saheeli Sublime Artificer DRC 119 for Saheeli Radiant Creator DRC 3, set code alone | no |

### 10.4 int8 against float16

| Model | K99, float16 | K99, int8 | Card first, both | Lowest cosine, int8 row vs float16 row | Largest change in accepts | Largest change in exact printing first |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SigLIP 2 B/16 | 11 | 9 | 99.2% | 0.9993 | 1 scan | 1 scan |
| PE-Core S16 | 21 | 20 | 98.8% | 0.9996 | 0 | 4 scans |
| PE-Core B16 | 19 | 18 | 98.8% | 0.9995 | 1 scan | 2 scans |

Every gate passes or fails the same way at both precisions. K99 here uses the recognizer's own inputs for the 250 crops. PE-Core B16 gets 19 at float16 here, against 14 in section 9, which embedded the crop files directly. The other two models match section 9.

What this shows:

- **Measured.** The int8 gallery costs nothing that the gates can see.
- **Measured.** With a fair tuning rule, no model passes every gate, and Vision does not either. Each model's worst unread case fails once when it is held out. So the art margin needs a margin above the worst case seen, or more data, whichever model is used.
- **Measured.** PE-Core S16, the smallest model (24M parameters, 512 dimensions), comes closest. Its only failure is its own worst case, as for Vision. It matches or beats Vision on correct accepts, unread accepts, card first, non-card gap (best non-card 0.624, worst card 0.778, against 0.483 and 0.569), and orientation (section 9). It still misses the K99 line (20 to 21, line 15).
- **Measured.** SigLIP 2 and PE-Core B16 fail Gate 2 held out through the set-code rule. When the true card is missing, the image's top card is another card from the same set, and "set X leaves one printing of the top card" accepts it. Vision did not rank a same-set card first on these scans. That rule has no cosine threshold.
- **Inference.** Stronger embeddings seem to rank by set style (frame, set symbol) more than Vision does. That makes a set-code-only accept less safe. A guard on that rule, for example a minimum art margin or a cosine floor, would be a decision-rule change. It needs its own test. This run did not try one.
- **Measured.** SigLIP 2 also accepts a same-text twin in Gate 1 held out unless the art margin is at least 0.0775. At that margin it keeps only 11 unread accepts (Vision 14), and 213 correct accepts, one below the 214 line. PE-Core B16 also gets 213.
- **Not shown.** Phone speed, memory, Core ML or LiteRT parity, and other phones. These are still 250 crops of 62 printings from one phone.

The code and runs: worktree branch `prototype/embedding-replay` (hook in `FeaturePrint.swift`, `Gallery.swift`, `CardRecognizer.swift`, and the macOS command), and `/tmp/embed-exp/step1b` (`driver.py`, `embed_queries.py`, `build_gallery.py`, `runall.py`, `runs/`, `results.json`).

## 11. Phone check: PE-Core S16 on the iPhone 16e and in the Android emulator

Step 1c of the plan, run on 2026-10-20. Numbers are **Measured** unless marked.

Setup:

- **Model.** PE-Core S16-384 image tower, "pad 384" as in section 9.1. The model takes pixels in [0, 1] and does its own normalisation. Vectors are L2-normalised after the model.
- **Reference.** Mac PyTorch float32 on the CPU, from the crop files. These vectors agree with the section 9 vectors to a lowest cosine of 0.99993.
- **iPhone.** A standalone bench app (`dev.reilley.mtgscan.embedbench`, source in `prototypes/embed-bench` on the `prototype/embedding-replay` branch, not pushed). It reuses the recognizer's rectifier calls, `VNGenerateImageFeaturePrintRequest` revision 2 as `FeaturePrint.swift` uses it, and the search code of `Gallery.swift`. Core ML models were converted with coremltools 9.0 (torch 2.7.0), as ML programs for iOS 17. "8-bit linear" is int8 per-channel weights. "8-bit palette" is a 256-entry k-means palette.
- **Parity.** "Model only" feeds the 24 reference inputs, preprocessed on the Mac. "End to end" starts from the JPEG and does the app's work in Swift: load, turn 180 degrees for the turned view, resize to 488 x 680, pad to 384 with Core Graphics, and run the model. It covers all 261 crops, upright and turned (522 vectors).
- **Speed.** One scan is two embeddings, upright and turned, from the 488 x 680 images. The time includes padding and pixel conversion for the open model, as `FeaturePrint.vector` includes Vision's own. 20 warm-up scans, then 150 scans.
- **Memory.** Peak `phys_footprint` of the app, with the model loaded, the gallery mapped as `Gallery.swift` maps it, and 100 scans searched (two queries, top 50 each). Each run is a fresh launch. 40 decoded crops stay in memory, about 104 MB before the model loads.

### 11.1 Float16 overflow in the first attention block

The pure float16 model returns NaN for every input on `.cpuOnly` on the iPhone, and on `.cpuOnly` and `.cpuAndGPU` on the Mac. The 8-bit models made from it do the same. In block 0, the attention logits reach about 145,000 after scaling, and float16 stops at 65,504. The Neural Engine and the iPhone GPU returned no NaN. The residual stream reaches about 390, which float16 holds.

A mixed model keeps three ops in float32: the query scaling, the query-key product, and the softmax of block 0. It returns no NaN on any compute unit, on the Mac or on the phone. On `.all` it costs about 7 ms per scan (table below).

**Inference.** Core ML does not promise which unit runs a layer. If the app uses the pure float16 model and Core ML moves block 0 to the CPU, every vector is NaN. The mixed model is the safe choice.

### 11.2 Results on the iPhone 16e

Parity, lowest / median cosine against the Mac vectors:

| Model | Units | Model only, 24 references | End to end, 24 references | End to end, 522 vectors | NaN |
| --- | --- | --- | --- | --- | --- |
| float32 | any | 1.0000 / 1.0000 | 0.9959 / 0.9978 | 0.9914 / 0.9980 | none |
| float16 | `.all` | 0.9997 / 0.9999 | 0.9957 / 0.9976 | 0.9915 / 0.9979 | none |
| float16 | `.cpuAndGPU` | 1.0000 / 1.0000 | 0.9958 / 0.9977 | 0.9916 / 0.9980 | none |
| float16 | `.cpuOnly` | NaN | NaN | NaN | every vector |
| 8-bit linear | `.all` | 0.9955 / 0.9972 | 0.9917 / 0.9954 | 0.9858 / 0.9955 | none (NaN on `.cpuOnly`) |
| 8-bit palette | `.all` | 0.9986 / 0.9991 | 0.9948 / 0.9969 | 0.9906 / 0.9972 | none (NaN on `.cpuOnly`) |
| mixed float16 | `.all` | 0.9998 / 0.9999 | 0.9957 / 0.9977 | 0.9917 / 0.9979 | none |
| mixed float16 | `.cpuOnly` | 0.9995 / 0.9997 | 0.9952 / 0.9974 | 0.9911 / 0.9978 | none |
| mixed 8-bit linear | `.all` | 0.9957 / 0.9973 | 0.9922 / 0.9955 | 0.9856 / 0.9956 | none |
| mixed 8-bit palette | `.all` | 0.9988 / 0.9991 | 0.9951 / 0.9969 | 0.9913 / 0.9972 | none |

`.cpuAndNeuralEngine` gave the same vectors as `.all` for every model.

Two embeddings per scan, ms, p50 / p95 over 150 scans:

| Embedding | `.all` | `.cpuAndGPU` | `.cpuOnly` |
| --- | --- | --- | --- |
| Vision feature print rev 2 | 23.7 / 25.3 (second run 23.9 / 25.5) | | |
| PE-Core S16 float16 | 25.4 / 29.6 (second run 27.5 / 29.4) | 91.9 / 94.3 | NaN |
| PE-Core S16 8-bit linear | 24.6 / 25.1 | 519 / 526 | NaN |
| PE-Core S16 8-bit palette | 27.2 / 27.8 | 105 / 126 | NaN |
| PE-Core S16 mixed float16 | 32.0 / 33.3 | 104 / 136 | 84.0 / 86.0 |
| PE-Core S16 mixed 8-bit linear | 32.4 / 46.1 | 522 / 569 | 84.9 / 88.5 |
| PE-Core S16 mixed 8-bit palette | 32.9 / 34.2 | 107 / 135 | 86.4 / 89.4 |
| PE-Core S16 float32 | | | 160 / 193 |

Model load on `.all`:

- The first load after install takes 2.8 to 3.7 s for every float16 and 8-bit S16 model (9.8 s once for the pure 8-bit palette model). Later loads take 22 to 37 ms. The first load compiles the model for the device, and the system keeps the result.
- Compiling a downloaded `.mlpackage` with `MLModel.compileModel(at:)` takes 91 to 176 ms. The first load after it takes 3.0 to 3.7 s.
- The first prediction takes 13 to 25 ms on `.all`. On `.cpuAndGPU` it takes 0.1 to 2.6 s.

Peak app memory, `phys_footprint`, MB (resident peak in brackets):

| Model and gallery | Peak footprint | Resident peak |
| --- | ---: | ---: |
| Vision, 768-d gallery | 131.6 | 274.5 |
| S16 float16, `.all`, 512-d gallery | 128.0 | 223.9 |
| S16 8-bit linear, `.all` | 129.8 | 222.9 |
| S16 8-bit palette, `.all` | 135.0 | 227.5 |
| S16 mixed float16, `.all` | 146.2 | 240.2 |
| S16 mixed float16, `.cpuOnly` | 135.3 | 272.5 |
| S16 float16, `.cpuAndGPU` | 153.2 | 286.4 |

- `phys_footprint` is what iOS counts against the app's memory limit. The mapped gallery is clean file memory, so it shows in resident memory and not in the footprint, for both models. **Inference.** On the Neural Engine, the compiled model lives outside the app process, so the footprint does not count it either.
- Sizes. S16 model on disk: float16 46.5 MB (43.7 MB zipped), 8-bit linear 23.6 MB (21.5 MB zipped), 8-bit palette 23.5 MB (22.4 MB zipped). The mixed models are the same size. S16 gallery, 102,730 x 512: 52.6 MB as int8 codes, 105.2 MB as the float16 file the phone keeps. Vision gallery: 157.8 MB as float16.

SigLIP 2 B/16 on the same phone, for reference (squash 256):

- Float16 on `.all`: model only 0.9997 / 0.9999, end to end 0.9862 on the 24 references and 0.9705 over 522 vectors. That misses the 0.98 line. It is a preprocessing gap: the model-only check passes, and squashing 488 x 680 to 256 x 256 with Core Graphics differs from PIL bicubic. On `.cpuOnly` it gives 0.9703 model only.
- 8-bit linear fails parity (0.937 model only, on the phone and on the Mac). An 8-bit palette passes on the Mac (0.993). It was not run on the phone.
- Two embeddings per scan: 22.0 / 24.3 ms (float16, `.all`), 16.5 / 19.5 ms (8-bit linear). `.cpuAndGPU` takes 136 ms. The model is 181 MB at float16 and 91 MB at 8 bits.

### 11.3 Android emulator, LiteRT

Parity only. Converted with litert-torch 0.9.4 (formerly ai-edge-torch, torch 2.13) straight from PyTorch, without ONNX. Quantised with ai-edge-quantizer 0.9.0. Run with LiteRT 2.3.0 on the CPU (XNNPACK, 4 threads) in a temporary arm64 Android 35 emulator.

| File | Size | Model only, 24 references | Model only, 261 crops | End to end from JPEG, 261 crops |
| --- | ---: | --- | --- | --- |
| float32 | 90.7 MiB | 1.0000 / 1.0000 | 0.99998 / 1.0000 | 0.979 / 0.993 |
| float16 weights | 46.1 MiB | 1.0000 / 1.0000 | 0.99998 / 1.0000 | 0.979 / 0.993 |
| int8 weights, float32 compute | 24.4 MiB | 0.9977 / 0.9985 | 0.9972 / 0.9985 | 0.978 / 0.992 |
| dynamic int8 (fully connected and convolution only) | 24.4 MiB | 0.9884 / 0.9929 | 0.9863 / 0.9929 | 0.970 / 0.987 |

- No NaN in any file. The Mac LiteRT interpreter gives the same numbers.
- The stock dynamic int8 recipe made a file that fails to load (a batch matmul with an int8 constant). Restricting it to fully connected and convolution layers fixed that.
- The end-to-end path is below 0.98 because of preprocessing. Android's `createScaledBitmap` with filtering is bilinear without antialiasing. The reference uses PIL bicubic. Fed the same unsmoothed bilinear inputs on the Mac, the model matches the emulator at 0.9978. An Android build needs an antialiased downscale.
- Emulator time is 200 to 770 ms per image. It does not predict a phone.

What this shows:

- **Measured.** On the iPhone 16e, PE-Core S16 meets the latency line on `.all`: 25 ms p50 for two embeddings at float16 or 8 bits, and 32 ms for the mixed model that cannot give NaN. Vision takes 24 ms in the same app. `.cpuAndGPU` takes 92 to 520 ms and misses the line.
- **Measured.** S16 meets the parity line on `.all` at float16 and at both 8-bit forms, model only and end to end from the JPEG. The lowest end-to-end cosine over 522 vectors is 0.9915 at float16 and 0.9858 with 8-bit linear weights.
- **Measured.** Pure float16 gives NaN on the CPU, from block 0 attention. Three float32 ops fix it for about 7 ms per scan.
- **Measured.** Peak app footprint with S16 on the Neural Engine and its gallery is about the same as with Vision (128 to 146 MB against 132 MB, including about 104 MB of test images). Resident memory is about 50 MB lower with S16, because its gallery is smaller.
- **Measured.** LiteRT reproduces the Mac vectors on Android at float32, float16 weights, and int8 weights. Android preprocessing must smooth when it scales down.
- **Not shown.** Android speed and memory on a real phone, the bin deck (Gate 3), other iPhones, and thermal behaviour over long sessions.

The runs: `/tmp/embed-exp/step1c` (`phone_results.json`, `phone_parity.csv`, `coreml/`, `android/`).

## 12. Answer to the owner's question

**Yes on the embedding measures, and an open model already does it without training. More crops alone will not change that.** On all 102,730 printings, SigLIP 2 B/16 and PE-Core B16 (both Apache 2.0) beat Vision feature prints zero-shot on shortlist recall (K99 11 and 14 vs 51), card first, art first, and the non-card gap (section 9). Both are about 93M parameters, about 93 MB at 8 bits. The app can download a model of that size at runtime with the gallery (section 12.1), so size alone does not rule them out. There is no size limit for now; a smaller model is preferred if it meets the same standard. The small PE-Core S16 (24M) also beats Vision (K99 21 vs 51) but misses K99 at most 15. Behind the recognizer, most of the embedding gain disappears, because the collector line already fixes most shortlist misses (section 10). PE-Core S16 comes out slightly ahead of Vision (216 vs 214 correct accepts on real crops) and fails only the strict leave-one-art-out rule, as Vision does. SigLIP 2 and PE-Core B16 come out level or behind. On the iPhone 16e, PE-Core S16 passes the speed and parity lines (section 11): two embeddings take 32 ms with the NaN-safe mixed-precision model, against 24 ms for Vision, and app memory is about the same. LiteRT in the Android emulator matches the Mac vectors. What is left to show is speed and memory on a real Android phone, and whether the result holds on real crops from other phones (#389). No embedding will tell same-art printings apart reliably. The collector line keeps that job.

Why it holds (**Inference** unless marked):

- Vision feature prints come from a small general model trained on photos and captions (section 2). It was not trained for cards.
- In-domain training beats general embeddings by about 15 to 25 points of R@1 on products and landmarks, and the gain carries to unseen classes (UnED, section 3).
- A card model trained only on synthetic data reached 85% top-1 over 20,360 Pokémon cards on real footage (TCG-AR, section 4).
- **Measured.** Zero-shot, two open models already beat Vision on the full gallery (section 9). Training is not needed to beat Vision. It is worth doing to get a smaller model to the same level, for example by fine-tuning PE-Core S16 on augmented Scryfall images with SigLIP 2 or PE-Core B16 as a teacher. The 250 crops come from one phone, so either path still needs the held-out crops from #389.

When it holds:

1. **If training is needed, train mostly on Scryfall images with phone-like augmentation**, with every printing in training and art-level classes. Most of the gain for a small model should come from this, and from a large zero-shot model as a teacher.
2. **Use the training crops for testing first, adaptation second.** About 6,000 crops are too few to train an embedding from (section 3). They are the only real test of the camera gap. Hold a fixed part out forever. Fine-tune on the rest only when the held-out score shows a gap that synthetic data does not close.
3. **Re-tune every threshold** (not a card, orientation, art margin) on held-out crops for the new model.
4. **Check parity** on every runtime and precision against the Mac-built gallery.

To answer the question as asked, more crops will make the model better mainly where synthetic data is weakest (glare, sleeves, foils, worn cards, other phones). Expect large gains from the first few hundred to few thousand varied crops, then smaller ones (**Inference** from Nowruzi et al. and Tonioni and Di Stefano). The crops' biggest value is that they show whether any model, Vision included, works on other users' scans.

Should one model replace Vision on iOS as well? Only if it passes the same gates. Vision costs nothing to ship, takes 19 ms for two images, and already passes every gate. Section 9 shows that Vision is not the strongest embedding on the full catalog. Its lead is that it ships with iOS, so it needs no download, no extra memory for weights, and no upkeep. If the trained model passes the gates on both platforms, one model means one gallery and one set of thresholds. If it does not pass on iOS, keep Vision on iOS and build a second gallery for Android (**Inference**).

### 12.1 Model size and delivery

An earlier draft of this plan set a model size bar of about 25 MB. It had no source. It was the size of PE-Core S16 at 8 bits. The owner has set no size limit for now: among models that meet the pass bar, prefer the smallest. The practical limits are the stores, the hosting plan, memory, and speed.

- **Documented.** iOS asks before downloading an app larger than 200 MB over mobile data, and the user can change that setting ([9to5Mac](https://9to5mac.com/2019/05/31/apple-iphone-cellular-limit-increased/)). Google Play limits the compressed base download ([Google Play size limits](https://support.google.com/googleplay/android-developer/answer/9859372), [App Bundle FAQ](https://developer.android.com/guide/app-bundle/faq)). A 93 MB model fits under both.
- **Documented.** Core ML can compile a model downloaded after install with `MLModel.compileModel(at:)`, and the app keeps the compiled model ([Apple](https://developer.apple.com/documentation/coreml/downloading-and-compiling-a-model-on-the-user-s-device)). LiteRT loads a model from a file ([LiteRT](https://ai.google.dev/edge/litert)). App Review forbids downloading code that changes the app's features ([guideline 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements)). Model weights are data, and Apple documents downloading them (**Inference** that this is allowed).
- **Measured, in the repo.** The app already downloads the gallery at runtime (`GalleryDownloads.swift`), with resume, retries, Wi-Fi waiting, a free-space check, and a sha256 for each part. The manifest names the embedding that built the gallery (`featurePrint` in `supabase/gallery/manifest.ts`). The model can be one more part of the same manifest. Gallery vectors only work with the model that made them, so one versioned download keeps them matched (**Inference**).
- **Measured, in the repo.** `supabase/gallery/budget.ts` uses the Free plan's limits: 1 GB storage, 5 GB egress a month, and 50 MB for each uploaded object. A full install downloads about 80 MB today, so 5 GB covers about 60 full installs a month. With a 93 MB model it is about 170 MB, or about 29 installs. Each kept model version also takes about 93 MB of storage, which leaves less room for training crops, and the model must be split into parts under 50 MB.
- **Inference.** A new model means a new gallery, so every phone downloads both again. Recognition cannot start until both are installed, which roughly doubles today's first wait. If egress becomes the limit, the options are the Pro plan or a store without egress fees, such as Cloudflare R2 ([pricing](https://developers.cloudflare.com/r2/pricing/)).
- **Inference.** Memory does not change with how the model arrives. A B/16 model adds about 93 MB of weights at 8 bits or 186 MB at float16 to the ~250 MB the app uses today (#21). Memory is reported, not capped, for now. Cheap Android phones are where it is most likely to matter.

## 13. Main risks

- **Licence.** MobileCLIP and DFN weights are research-only. timm ImageNet weights carry an ImageNet caveat. DINOv3 is usable commercially but keeps its own licence for derivatives and lets Meta change the terms. SigLIP 2 and PE-Core are Apache 2.0 (section 6).
- **Training on Scryfall images.** Neither Scryfall nor the Fan Content Policy addresses training. Review before a wider release (section 6, #19).
- **Domain gap.** Synthetic-only results on synthetic tests overstate real accuracy (Yu-Gi-Oh repo; TCG-AR triplet head: adequate on synthetic, 1.7% on real).
- **Small, biased test set.** 250 crops of 62 printings from one phone and one tester. The #389 crops will be skewed to popular cards and to the users who leave uploads on.
- **Label noise.** The saved printing is wrong more often for same-text twins. Use art-level labels.
- **Runtime parity.** Float16 or int8 conversion can change or break the vectors (the DINOv3 NaN). LiteRT's Core ML delegate is beta.
- **Memory, speed, and egress.** The two best zero-shot models are the large ones. SigLIP 2 B/16 is 93M image parameters (about 93 MB at 8 bits, on top of a 79 MB gallery) and 11.4 ms per image on an iPhone 12 Pro Max. A runtime download fits the store limits but roughly halves the full installs that the Free plan's egress covers (section 12.1). The recognizer needs two images per scan. Older Android phones may be several times slower (**Inference**; the MobileNetV4 table shows a 10x spread across devices for the same model).
- **Android text reading.** The collector line is read with Vision today. An Android reader is a separate accuracy risk (section 7).
- **Upkeep.** A trained model needs a training pipeline, a model release process, and a retest on each new set. Vision needs none of that.

## 14. Experiment plan

All steps run on the owner's Mac in a separate environment, never in the repo. Crops stay off the repo, as #389 requires.

**Step 1. Zero-shot screen on the full gallery. Done (section 9).** SigLIP 2 B/16 (K99 11) and PE-Core B16 (K99 14) pass the K99 line zero-shot. PE-Core S16 gets K99 21. Vision gets K99 51 on the same run. Memory, speed, and download size are not measured yet.

**Step 1b. Recognizer replay with a zero-shot model (about 2 days).** Before any training, put SigLIP 2 B/16 or PE-Core B16 behind the recognizer on the Mac. Re-tune the not-a-card, orientation, and art-margin thresholds, and run Gates 1 and 2. This shows whether the embedding gain carries to accepts with 0 false accepts. It also measures what the int8 gallery costs in accuracy. **Done (section 10).** Under a leave-one-art-out tuning rule, no model passes every gate, and Vision does not either. PE-Core S16 comes closest: its only failure is its own worst case, as for Vision. With thresholds fitted on all the data, it passes every gate with more correct accepts than Vision (216 vs 214 real, 2,141 vs 2,135 simulated). SigLIP 2 and PE-Core B16 accept wrong cards in Gate 2 held out through the set-code rule, which has no cosine threshold. The int8 gallery costs nothing the gates can see.

**Step 1c. Memory and speed on phones (about 2 days).** Convert PE-Core S16, the best model in step 1b, to Core ML and LiteRT, at float16 and 8 bits. On the iPhone 16e, measure parity against the Mac vectors, time for two embeddings, and peak app memory while scanning with the gallery loaded. The owner has no Android phone: check LiteRT parity in the Android emulator on the Mac, and leave Android speed and memory to a cloud device farm (Firebase Test Lab or AWS Device Farm) when Android work starts. If the model passes the latency and parity lines below, it can go on to the held-out crops (step 3) without training. **Done (section 11).** On the iPhone 16e, Core ML on `.all` meets both lines at float16 and at 8 bits: 25 ms p50 for two embeddings (Vision 24 ms), and a lowest end-to-end cosine of 0.9915 at float16 and 0.9858 at 8 bits over 522 vectors. Pure float16 gives NaN on the CPU. A model with three float32 ops in block 0 fixes that and takes 32 ms. Peak app memory is about the same as with Vision. LiteRT on the Android emulator matches the Mac at float32, float16 weights, and int8 weights. Android preprocessing must smooth when it scales down, or end-to-end parity drops to 0.979.

**Step 2. Train a smaller model (about 1 week, optional).** There is no size limit for now, but a smaller model is preferred if it meets the same pass bar. Start from PE-Core S16 or another backbone of about 25M parameters. Train on all Scryfall `normal` images with phone-like augmentation (section 4), one class per art, ArcFace-style loss, same-name hard negatives, 256 to 512 output dimensions. Also try distilling from SigLIP 2 B/16 or PE-Core B16. Use many augmented views per printing: the 3-view adapter in section 8 overfit. Do not use the evidence pack or #389 crops for training or tuning.

**Step 3. Held-out test on new crops.** Download the first #389 crops with the owner's command. Fix a held-out split before any training, for example one random half of all printings, so that held-out printings are never trained on. Compare the model and Vision on the evidence pack and on this held-out split.

**Step 4. Adaptation with crops (only if step 3 shows a gap).** Fine-tune on the training split of crops, mixed with synthetic data. Re-test on the same held-out split.

**Step 5. Replay and phones.** Put the model behind the recognizer (thresholds re-tuned on the training split only), run `bun run recognizer:replay` gates, then convert to Core ML and LiteRT and run the bin deck (Gate 3) on an iPhone and an Android phone.

Pass bar. The model must meet every line, measured in the same run as Vision:

| Measure | Pass |
| --- | --- |
| Top K for 99% exact printing, full gallery | at most Vision's K in the same run, and at most 15. Vision's full-gallery K99 on the evidence pack is 51 (section 9). |
| Right card first and right art first | at least Vision's rate on the evidence pack and on the held-out crops |
| Accepts without a reading | at least as many correct as Vision, with 0 false accepts |
| Evidence pack Gate 1, with new thresholds | 0 wrong-card and 0 wrong-printing accepts, 11 of 11 non-cards rejected, at least 214 correct accepts of 250 |
| Evidence pack Gate 2 | 0 wrong-card accepts on the 3,000 simulated scans, full and held out. Note: the simulated scans come from Scryfall images, so a model trained on Scryfall images has an easier time there. Treat Gate 2 as a guard, not as proof. |
| Non-card gap | best non-card cosine below worst card cosine on all crops, with a gap no smaller than Vision's in the same run |
| Orientation | upright beats upside down on at least as many crops as Vision |
| Size and memory | no limit for now (owner decision). Report model size, full-install download, and peak app memory while scanning on the iPhone 16e and on a cheap Android phone with about 4 GB of RAM |
| Latency, two embeddings | p50 at most 40 ms on the iPhone 16e (Core ML); p50 at most 60 ms on a mid-range Android phone (LiteRT); end-to-end p95 below 1.5 s (Gate 3) |
| Parity | lowest cosine at least 0.98 between the Mac gallery vectors and each phone runtime, over 24 reference images, as in the `real/feature-prints.json` check; no NaN in float16 or int8 |
| Bin deck (Gate 3) | 0 false accepts, right card first for at least 29 of 30, exact printing first for at least 27 of 30, on both phones |

Among models that pass, prefer the smallest. If a model passes on both phones, it can replace Vision on both. If it passes only on Android, ship it there and keep Vision on iOS.
