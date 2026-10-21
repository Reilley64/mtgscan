# Card edge detection: improvements and offline measurement

Date: 2026-10-21

Research notes for the follow-up that #486 asked for: better card edge detection, and a way to measure a change without the owner or the phone. Refs #10, #421, #486.

Sources: the code at `origin/main` (`7727fd6`), `.out-of-scope/vision-rectangle-card-detector.md` on branch `docs/rectangle-detector-out-of-scope` (PR #488), the comments on #10, #421, and #486, `README.md` (Card detector, Training crops), `GLOSSARY.md`, and the scanner evidence pack README. Paths are under `apps/mobile/` unless they start with `supabase/`.

Labels:

- **Measured.** A number from mtgscan's own runs, from #421, or from the experiments in section 3.
- **Documented.** An official source states it (Apple documentation, a dataset page or licence, a paper, a repository licence).
- **Inference.** Our reasoning. An experiment must confirm it.
- **Unverified.** We could not check it.

The experiments ran in `/tmp` on an Apple M3 with macOS 27.0.1 and Xcode 26.3. They did not change product code, and their scripts were not kept.

## Summary

- The outline is already sub-pixel exact when the right lines win. On synthetic frames the median corner error is 0.03 to 0.08 mm (**Measured**, section 3). The errors that matter are wrong lines: the inner frame, a shadow edge, a sleeve or pocket edge, or a stale outline after the hand moved.
- Two causes of harmful outlines (inside the card) are cheap to fix:
  1. The hand moves between the held-still detection sample and the photo. Refining the outline again on the photo fixed 40 of 45 synthetic 4.8 mm shifts to within 0.5 mm. The other 5 snapped to an inner line, which a size check can refuse (**Measured**).
  2. The aspect gate measures the outline in the frame, not on the card. A tilted phone pushes the outer edge out of 63:88 ± 0.02, and the inner frame can then pass. On synthetic frames with strong tilt, 18 of 37 detected outlines were inside by more than 1 mm (**Measured**). A perspective-correct aspect from the camera intrinsics fixes the cause (**Documented** method, **Inference** for the gain).
- No newer Apple API gives a better outline. Document segmentation has had one revision since iOS 15. `RecognizeDocumentsRequest` (iOS 26) returns no corner points (**Documented**).
- The measurement to build first is a detector replay on the Mac: a macOS detector command, a pinned synthetic frame recipe with known corners, short synthetic sequences, the capture rule replayed on the samples, and an A/B against `main` on the same machine. The training crop scorer from #421 checks the shipped detector in the field.

## 1. The card detector today

- About 5 times a second (`analysisInterval = 0.19`), the card detector reads a 1280 x 720 `420f` preview frame (`modules/card-detector/ios/CameraSession.swift:19-20`).
- `VNDetectDocumentSegmentationRequest` gives the document proposal (`ios/Detector/CardQuadDetector.swift:52`).
- The edge refiner moves each proposal edge to a straight luma step (`ios/Detector/CardEdgeRefiner.swift`):
  - 24 samples per edge, from 12% to 88% of its length, so the rounded corners are never sampled (`:33-35`).
  - The search reaches 15% of the proposal's short side, at most 96 px (`:36-38`).
  - Each step peak gets a parabolic sub-pixel fit (`:461`), and each line a total least squares fit (`:285`).
  - Up to 5 lines per edge are kept. All four lines must share one step polarity, and the quad must be card-shaped. The outermost combination wins (`:126-145`).
- The card corners are the intersections of the four lines, so they are the sharp corners of the card's outer rectangle, not points on the rounded corner.
- The aspect gate is `abs(aspect - 63/88) <= 0.02`, where the aspect is the ratio of the mean side lengths in the frame (`ios/Detector/CardQuadGeometry.swift:129`, `:208`, `:214`).
- The detector gates of a detection sample are proposal confidence at least 0.5, area 0.08 to 0.9, and edge support at least 0.7 (`ios/Detector/DetectionSample.swift:5-7`). One edge may fall back to the proposal line when the confidence is at least 0.9 (`CardQuadDetector.swift:137`).
- Automatic capture takes the photo when the outline holds still for 400 ms, with every corner within 4% of the short side (`src/scan/capture.ts:39`). `takePhoto` returns the outline of that detection sample with the photo, unchanged (`CameraSession.swift:61-86`).
- The recognizer straightens the full photo along that outline with `CIPerspectiveCorrection` (`modules/card-recognizer/ios/Recognizer/CardRectifier.swift:55`). Nothing refines the outline on the photo.
- On the iPhone 16e the detector's p95 is 14.1 to 14.5 ms at about 4.56 Hz, against a bar of p95 below 20 ms at 4.5 Hz or more (#10, **Measured**).

At the usual card size, a card is about 360 px wide in the frame, so 1 px is about 0.17 mm (**Inference.** 63 mm over half of 720 px).

## 2. What the evidence says about the weak spots

From the #421 A/B (5 crops per detector, iPhone 16e, **Measured**):

- The current detector's median size error is 0.40 mm. Its large errors are all too large: Exultant Skymarcher by 2.2 x 3.9 mm, Doctor Doom by 2.0 mm in height. Both were recognized.
- One Vraska crop moved 4.8 mm between the outline holding still and the photo. The crop lost the collector line, and the recognizer abstained.
- The trial's inner-frame outline (Skymarcher, 3.7 x 5.4 mm inside) lost the border and the collector line. Recognition failed.

What the crops add (**Inference** from looking at them): the Skymarcher and Doctor Doom crops show a dark band outside the card's own edge, like a sleeve. The outermost-lines rule then takes the sleeve edge, which is the outline the rule is meant to find. A sleeved card always gives a "too large" outline by the sleeve margin.

From #10 (**Measured**, offline on a private corpus that no longer exists): a card with a hard shadow on one edge falls back to the inner frame, and a borderless card in a binder pocket often fits the pocket edge. On the phone, a patterned surface fitted in only 1 of 5 telemetry lines.

The first-release target is "one card lying flat on a surface, mostly visible" (#10). Binder pockets are outside it.

## 3. Offline experiments

### 3.1 The #421 crop scorer reproduces

The 10 training crops of the #421 A/B were still on the Mac. We rebuilt the method: ECC with an affine motion model on Sobel edge images, crop against Scryfall's `normal` image of the saved card printing, both at 488 x 680 (7.75 px per mm).

| Start of the ECC search | Crops within 0.3 mm of the #421 table | Failure |
| --- | --: | --- |
| Identity, and 0.94 and 1.06 scales | 9 of 10 | The 4.8 mm shift crop converged wrong: correlation 0.46, height "6.4 mm too large" |
| A SIFT affine fit (ratio test, RANSAC), then ECC | 10 of 10 | None. Largest difference 0.27 mm. The shift crop gives -4.83 mm, as in #421. |

So the scorer is repeatable, but it needs a feature-based start and a correlation floor. Correlations of good fits were 0.77 to 0.96 (**Measured**).

### 3.2 The shipped detector on a Mac, on frames with known corners

We built a small macOS command that compiles the four files in `modules/card-detector/ios/Detector` unchanged. It reads a PNG, converts RGB to a full-range `420f` buffer (BT.709 luma and chroma), turns it into a 1280 x 720 landscape buffer, and calls `CardQuadDetector.detect` with `.right`, as the phone does. A second mode calls `CardEdgeRefiner.refine` with a given proposal.

We rendered 240 portrait frames of 720 x 1280 with OpenCV, 30 per condition, from 200 Scryfall `normal` images in the gallery image cache:

- The card is 300 to 500 px wide, turned up to 20 degrees. Each corner moves up to 2.5% of the card size, which acts like camera tilt.
- Every frame has sensor noise, a slight blur, and a glare band on half of the cards. 15% have motion blur.
- Conditions: plain surface; patterned surface (stripes, checks, wood grain, text, or card art as a playmat); a hard shadow 1.5 to 5 mm to one side; a sleeve 0.8 to 1.6 mm larger; a binder pocket with 8 neighbour cards and pocket edges; strong motion blur; and empty plain and patterned surfaces.

A side is "inside" when the outline's side lies inside the true card edge. Corner errors are in mm on the card. Mac timing is the `detect` call only (**Measured**):

| Condition | Frames | Detected | Median corner error | p90 corner error | Inside > 1 mm | Outside > 1 mm | Mac p95 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| Plain | 30 | 27 | 0.06 mm | 5.9 mm | 8 | 0 | 4.0 ms |
| Patterned | 30 | 11 | 0.09 mm | 3.8 mm | 3 | 0 | 4.5 ms |
| Hard shadow | 30 | 25 | 3.4 mm | 5.0 mm | 11 | 16 | 4.3 ms |
| Sleeve | 30 | 27 | 1.9 mm | 3.3 mm | 5 | 23 | 4.0 ms |
| Binder pocket | 30 | 9 | 6.7 mm | 10.0 mm | 2 | 8 | 5.1 ms |
| Motion blur | 30 | 26 | 0.20 mm | 7.5 mm | 6 | 0 | 4.5 ms |
| Empty plain | 30 | 0 | | | | | 4.1 ms |
| Empty patterned | 30 | 0 | | | | | 5.0 ms |

- Every inside outline was 2.5 to 9 mm inside: the inner frame or a line in the art. None was a small fit error.
- The inside outlines follow the tilt. With the true outline's aspect in the frame within 0.015 of 63:88, plain frames gave 3 inside outlines out of 17. Beyond 0.015, 18 of 37 detected outlines were inside, over all conditions.
- On the 5 plain frames whose true outline is 0.02 or more off the card aspect, the refiner chose the inner frame even with the true outline as the proposal. All four outer edges had full support. So the outer quad failed the aspect gate, and the inner quad passed it.
- An image-space aspect error of 0.015 to 0.02 comes from tilting the phone about 12 to 13 degrees from straight above the card (**Inference.** Foreshortening alone, 0.716 / cos 12°).
- Sleeves gave outlines on the sleeve edge, as expected.
- Empty surfaces gave no outline. Vision made a proposal on 24 of 30 empty patterned frames, and the edge refiner refused all of them.

The phone does not show inside outlines on plain surfaces this often (#10, #421). The synthetic tilt may be stronger than real use, and Vision may behave differently on rendered frames (#421 saw the same gap). So these rates are not device rates. They show mechanisms that a real-frame set must confirm.

### 3.3 Steadiness on still scenes

We made 12 copies of each plain, patterned, shadow, and sleeve frame, each with new noise, a shift of about 0.7 px, and a turn of about 0.15 degrees. This is a still card, not hand motion (**Measured**):

| Condition | Scenes | Mean detection rate | Scenes never detected | Median jitter | Scenes with a jump over 1 mm |
| --- | --: | --: | --: | --: | --: |
| Plain | 30 | 0.92 | 1 | 0.01 mm | 4 |
| Patterned | 30 | 0.42 | 13 | 0.05 mm | 5 |
| Hard shadow | 30 | 0.89 | 2 | 0.02 mm | 10 |
| Sleeve | 30 | 0.89 | 1 | 0.02 mm | 4 |

On a patterned surface the outline comes and goes. Automatic capture needs a detected card for 400 ms, about 3 samples in a row at 0.19 s each, so a detection rate of 0.42 often never holds still. This matches the device (#10, #421).

### 3.4 Refining the outline again after the hand moved

We took 45 frames whose outline was within 0.5 mm. We moved each frame by 4.8 mm in a random direction and turned it up to about 1 degree. We then refined it with the old outline as the proposal (**Measured**):

- The old outline was 5.3 mm off at the median.
- After refining, 40 of 45 were within 0.44 mm, and 35 within 0.1 mm.
- The other 5 were 5 to 11 mm off. Each had one or two sides on the inner frame, 3 to 4 mm inside.
- 4 of the 5 failures were 4% to 10% narrower or shorter than the old outline. Hand movement at a fixed height changes the size much less (**Inference**).
- The fifth, on a patterned surface, kept its size but sat 7 mm off: 7.4 mm inside at the top and 9.2 mm outside at the bottom.

### 3.5 The previous outline as the proposal on patterned surfaces

On the 17 patterned scenes with at least one outline, we refined each frame with the last outline of its scene as the proposal, and kept outlines that pass the edge support gate (**Measured**):

| Proposal | Outlines | Within 1 mm | Off by more than 1 mm |
| --- | --: | --: | --: |
| Vision (shipped) | 133 | 90 | 43 |
| Previous outline | 165 | 107 | 58 |

The previous outline gives more outlines, both right and wrong. Tracking alone does not fix patterned surfaces. It needs a check that the tracked outline is still right.

### 3.6 SmartDoc 2015 frames

We ran the 3 sample clips of SmartDoc 2015 challenge 1 (588 frames with ground truth, plain background) through the same command. Each frame was cropped to 9:16 and scaled to 720 x 1280 (**Measured**):

- 24 of 588 frames gave an outline. All 24 were inside the page, on printed content.
- None of the 588 true page outlines was within the aspect gate in the frame. Their aspect was 0.77 to 0.97, because the clips are filmed at a strong tilt. An A4 page is 0.707, inside the gate when seen straight on.

So public document video cannot test the shipped detector as it is. It can test it once the aspect gate is perspective-correct (section 4.2), or with the gate as a bench parameter.

## 4. Improvements

Cost is the time on the iPhone 16e frame budget (p95 below 20 ms at 4.5 Hz or more, 14 ms today) unless it runs outside the frame loop.

### 4.1 Refine the outline again on the photo, before straightening

- **Fixes.** Hand movement between the held-still detection sample and the photo, the 4.8 mm shift that cut off a collector line.
- **How.** In the recognizer, before `CIPerspectiveCorrection`, scale the photo's luma to the analysis size (or keep full size and scale the search), and run `CardEdgeRefiner.refine` with the held-still outline as the proposal. Refuse the new outline when it is more than about 2% smaller than the old one, and keep the old outline then. The inner frame is about 10% smaller (57 / 63, **Inference** from a 3 mm border).
- **Evidence.** Section 3.4. 40 of 45 synthetic shifts fixed. The size check catches 4 of the 5 failures. The fifth needs a second check: the new outline may not move far from where the camera motion puts the old one (next point).
- **Motion check.** Vision's image registration can first move the old outline by the camera motion between the last frame and the photo. `VNHomographicImageRegistrationRequest` and `VNTranslationalImageRegistrationRequest` register a targeted image against the handler image ([VNTargetedImageRequest](https://developer.apple.com/documentation/vision/vntargetedimagerequest), [homographic](https://developer.apple.com/documentation/vision/vnhomographicimageregistrationrequest)). A homography is the exact motion model of a flat card (**Inference**).
- **Cost.** Outside the frame loop. The whole `detect` call, Vision included, took about 3.6 ms at the median on the Mac at preview size (**Measured**, section 3.2). It adds to recognition, whose end-to-end p95 bar is 1.5 s (`Bin-deck run` in `GLOSSARY.md`).
- **Risk.** Low with the size check. It must use the same `.right` mapping as the photo; the photo already has the frame's aspect (`README.md`, Card detector).
- **Licence.** None, own code.
- **Related check.** The photo output uses `.balanced` quality (`CameraSession.swift:77`). Zero shutter lag takes the photo from a ring buffer of past frames and is on by default for apps linked on iOS 17 or later where it is supported ([isZeroShutterLagEnabled](https://developer.apple.com/documentation/avfoundation/avcapturephotooutput/iszeroshutterlagenabled), [WWDC23 10105](https://developer.apple.com/videos/play/wwdc2023/10105/)). We could not verify whether it is active with the app's format. If it is not, the photo comes later and the shift is larger.

### 4.2 Measure the aspect on the card, not in the frame

- **Fixes.** Inner-frame outlines and refused cards when the phone is tilted (sections 3.2 and 3.6).
- **How.** With the camera's focal length and principal point, the true aspect of a rectangle seen as a quad can be computed from one image ([Zhang and He, "Whiteboard scanning and image enhancement", Digital Signal Processing, 2007](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/Digital-Signal-Processing.pdf)). The intrinsics come with each frame when the video connection's [isCameraIntrinsicMatrixDeliveryEnabled](https://developer.apple.com/documentation/avfoundation/avcaptureconnection/iscameraintrinsicmatrixdeliveryenabled) is on, as the [kCMSampleBufferAttachmentKey_CameraIntrinsicMatrix](https://developer.apple.com/documentation/coremedia/kcmsamplebufferattachmentkey_cameraintrinsicmatrix) attachment (iOS 11). The gate then compares the corrected aspect with 63:88.
- **Evidence.** The mechanism is measured on synthetic frames. The gain on the phone is not measured.
- **Cost.** A few dozen arithmetic operations per candidate quad (**Inference**). The refiner checks at most 5^4 = 625 combinations per frame (`CardEdgeRefiner.swift:126-145`).
- **Risk.** Medium. The gate gets wider for tilted quads and stricter for flat ones, so it can admit a non-card rectangle or refuse a card it takes today. Empty-surface frames and the inner-frame frames must show no new outline. The synthetic renderer must model tilt as a camera pose, not as corner jitter, to measure it.
- **Licence.** None, own code.

### 4.3 Hard shadows

- **Fixes.** The shadow case from #10. On synthetic frames, 11 of 25 shadow outlines were inside and 16 outside (section 3.2).
- **Candidates** (**Inference**, none tried):
  - Use the chroma planes. A cast shadow darkens a surface but keeps its hue, while the card edge changes both. The refiner reads only luma today (`CardQuadDetector.swift`, `LumaPlane`).
  - Check that the band just inside each chosen line looks like the bands inside the other lines (the same border), and that the band outside differs.
- **Cost.** Chroma adds profile reads on the interleaved chroma plane at half resolution. Likely 1 to 3 ms (**Inference**). The band check reads a few hundred pixels per combination.
- **Risk.** Medium. Borderless and foil cards have no uniform border.

### 4.4 Temporal smoothing or tracking

- **Fixes.** Patterned surfaces where the outline comes and goes (section 3.3).
- **Candidates.**
  - Use the last outline as a second proposal when Vision's proposal is missing or far away. Section 3.5 shows it adds right and wrong outlines in about equal measure, so it needs a check, such as agreement over several frames or the card signature.
  - `VNTrackRectangleRequest` (iOS 11) or the Swift `TrackRectangleRequest` (iOS 18) keeps a quad across frames, with `.fast` or `.accurate` tracking ([TrackRectangleRequest](https://developer.apple.com/documentation/vision/trackrectanglerequest), [VNTrackRectangleRequest](https://developer.apple.com/documentation/vision/vntrackrectanglerequest)). Apple publishes no timing. It is a generic rectangle method, so its output could only be a proposal for the edge refiner.
  - A median of the last few outlines lowers jitter but adds lag. Jitter on a still card is already 0.01 to 0.05 mm, so this helps little (section 3.3).
- **Cost.** Tracking adds a Vision request per frame, unmeasured. Reusing the last outline costs one more refine, about the refiner's time.
- **Risk.** Medium to high. A tracker can hold a wrong outline, such as the inner frame, for many frames. The capture rule then takes a photo of it.
- **Licence.** System API.

### 4.5 Sub-pixel edge fitting and rounded-corner models

- The refiner already fits each step peak to sub-pixel and each line by total least squares (section 1). The synthetic median corner error is 0.03 to 0.08 mm (section 3.2).
- The corners come from line intersections, and samples stop at 12% from each end, so rounded corners do not bias them.
- **Result.** No gain to expect. Not recommended.

### 4.6 Newer Apple APIs and Core Image

All **Documented**, from the Apple documentation fetched on 2026-10-21:

| API | iOS | What it gives | Use for the card outline |
| --- | --- | --- | --- |
| [DetectDocumentSegmentationRequest](https://developer.apple.com/documentation/vision/detectdocumentsegmentationrequest) / [VNDetectDocumentSegmentationRequest](https://developer.apple.com/documentation/vision/vndetectdocumentsegmentationrequest) | 18 / 15 | One quad and a low-resolution mask. One revision only ([revisions](https://developer.apple.com/documentation/vision/detectdocumentsegmentationrequest/revision-swift.enum)). | What the detector uses. The Swift API is a new surface for the same model. |
| [RecognizeDocumentsRequest](https://developer.apple.com/documentation/vision/recognizedocumentsrequest) | 26 | Text, tables, lists, and barcodes in a [DocumentObservation](https://developer.apple.com/documentation/vision/documentobservation). No corner points. | None. It also reads text, so it is unlikely to fit 20 ms (**Inference**). |
| [VNDetectRectanglesRequest](https://developer.apple.com/documentation/vision/vndetectrectanglesrequest) | 11 | Quads, CPU only ([WWDC21 10041](https://developer.apple.com/videos/play/wwdc2021/10041/)) | Out of scope (#421, #486). |
| [CIDetectorTypeRectangle](https://developer.apple.com/documentation/coreimage/cidetectortyperectangle) | 8 | The most prominent rectangle | Generic rectangles, like the above. Apple says Vision replaces `CIDetector` ([CIDetector](https://developer.apple.com/documentation/coreimage/cidetector)). |
| [VNDetectContoursRequest](https://developer.apple.com/documentation/vision/vndetectcontoursrequest) | 14 | Contours at up to 512 px by default | #10 measured p95 40.8 ms with no usable quad. |
| [VNGenerateForegroundInstanceMaskRequest](https://developer.apple.com/documentation/vision/vngenerateforegroundinstancemaskrequest) | 17 | A soft mask per subject | A mask, not a quad. No timing published. |
| [TrackRectangleRequest](https://developer.apple.com/documentation/vision/trackrectanglerequest) | 18 (VN 11) | A tracked quad | See 4.4. |
| Image registration ([homographic](https://developer.apple.com/documentation/vision/vnhomographicimageregistrationrequest), [tracking](https://developer.apple.com/documentation/vision/vntrackhomographicimageregistrationrequest)) | 11 / 17 | A 3 x 3 warp between images | Moves an outline by camera motion (4.1). |
| [DetectLensSmudgeRequest](https://developer.apple.com/documentation/vision/detectlenssmudgerequest) | 26 | A smudge score | Not an outline. |

`GenerateIterativeSegmentationRequest` can be seeded with a box, but it needs iOS 27 and downloads its model on demand ([doc](https://developer.apple.com/documentation/vision/generateiterativesegmentationrequest)). VisionKit's document camera and data scanner expose no card quad ([VNDocumentCameraScan](https://developer.apple.com/documentation/visionkit/vndocumentcamerascan), [DataScannerViewController](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller)).

Apple says document segmentation is trained on paper, signs, notes, receipts, and labels, and runs in real time only on the Neural Engine ([WWDC21 10041](https://developer.apple.com/videos/play/wwdc2021/10041/)). Its architecture, input size, and accuracy are not published.

### 4.7 Open corner and segmentation models

Licence must allow a shipped product, as #430 required for embeddings (**Documented** for each licence):

| Model | Output | Licence of code and weights | Reported result | Size and speed |
| --- | --- | --- | --- | --- |
| [DocAligner](https://github.com/DocsaidLab/DocAligner) LC100 | 4 corner heatmaps at 256 px | Apache 2.0 ([LICENSE](https://github.com/DocsaidLab/DocAligner/blob/main/LICENSE), weights per the [notice](https://docsaid.org/licenses/NOTICE.txt)) | SmartDoc 2015 Jaccard 0.989 ([catalog](https://docsaid.org/api/v1/catalog)) | 1.2 M parameters, 1.6 GFLOPs. No iPhone timing. |
| [LDRNet](https://github.com/niuwagege/LDRNet) | 4 corners and border points at 224 px | MIT, weights in the repository | SmartDoc 2015 Jaccard 0.985 ([paper](https://arxiv.org/abs/2206.02136)) | 10 MB. iPhone 11 with TNN, "up to 790 FPS". |
| [M-LSD](https://github.com/navervision/mlsd) tiny | Line segments | Apache 2.0, weights in the repository | Wireframe sAP10 58.0 | 20.6 ms at 320 px FP16 on an iPhone 12 Pro with TFLite ([paper](https://arxiv.org/abs/2106.00186)) |
| [MobileSAM](https://github.com/ChaoningZhang/MobileSAM), [EfficientSAM](https://github.com/yformer/EfficientSAM) | Prompted masks | Apache 2.0 | | MobileSAM 4.9 FPS on an iPhone 14 ([EdgeSAM README](https://github.com/chongzhou96/EdgeSAM/blob/master/README.md)). Too slow. |
| [EdgeSAM](https://github.com/chongzhou96/EdgeSAM) | Prompted masks | S-Lab 1.0, non-commercial | | Excluded |
| [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) segmentation | Instance masks | AGPL 3.0 or a paid licence | | Excluded |

- No model was trained on cards, black borders, sleeves, or pockets. Each would need training on card frames.
- At 224 to 256 px input, a corner model is coarse, about 3 px per input pixel on a 720 px frame (**Inference**). It could replace the document proposal, but the edge refiner would still set the outline.
- The proposal is not the weak part on plain surfaces. Section 3.2 shows the refiner choosing the inner frame from a perfect proposal.
- **Result.** Low gain per cost now. Worth a look only if patterned surfaces stay bad after 4.4, as a proposal trained for cards.

### 4.8 Binder pockets

On synthetic pocket frames, 9 of 30 were detected, with a median error of 6.7 mm, on pocket edges and neighbour cards (section 3.2). Pockets are outside the first-release target (#10). Leave them until the target changes.

## 5. Measuring a detector change offline

### 5.1 How the Mac can run the detector today

- `bun run detector:test` runs the Swift fixture tests on a Mac (`package.json`). The Detector workflow runs them on `macos-15` runners for every PR that changes the module (`.github/workflows/detector.yml`). `detectorEndToEnd` calls Vision's document segmentation there, so Vision runs in CI (`macos/CardDetectorTests/CardQuadDetectorTests.swift:328`).
- The fixtures render 3 synthetic gray cards. They cannot read an image or a video file, and they check a few cases only.
- The card recognizer has a macOS command target that compiles the phone files (`modules/card-recognizer/Package.swift`, `macos/CardRecognizerCommand/main.swift`). The detector has none.
- **Missing.** A detector command that reads frames (PNG, JPEG, or a video through `AVAssetReader`) and writes one detection sample record per frame; a frame set with known corners; a scorer; and a replay of the samples through the capture rule. Section 3.2 shows the command is about 100 lines and needs no change to the detector files.

### 5.2 Synthetic frames

The scanner evidence pack's `simulate.py` renders cards with known homographies, but it does not fit the card detector as it is (**Documented** in the file):

- It writes the outline with 0.6% random error on purpose, to imitate the detector (`test/scanner-evidence/simulated/simulate.py:173`). The true corners are not saved.
- The card fills 59% to 77% of the photo height on a smooth gradient background (`:93`, `:141`). There are no patterns, shadows, sleeves, pockets, hands, or empty frames.
- The photos are not 9:16, and their bytes are pinned by `photos.sha256`, so the recipe cannot change without breaking Gate 2.

A separate recipe for detector frames is better. It can reuse `simulate.py`'s pinned versions and image download. Section 3.2's renderer is the start. It needs:

- Camera tilt as a pose (tilt angle and focal length), not as corner jitter, so tilt can be bucketed.
- Patterned surfaces from procedural patterns and CC0 textures. [ambientCG](https://docs.ambientcg.com/license/) and [Poly Haven](https://polyhaven.com/license) license their textures as CC0. The [Describable Textures Dataset](https://www.robots.ox.ac.uk/~vgg/data/dtd/) is for research only, so leave it out.
- Shadows, sleeves, a hand over a corner, glare, and motion blur.
- Short sequences: a hand path (slow drift plus shake) over about 2 seconds at the analysis rate, and a photo frame about 400 ms after the outline holds still, at the photo's resolution.
- A black-bordered, white-bordered, and borderless split, from Scryfall's `border_color`.

Synthetic frames do not show what Vision does on real frames. In #421 the rectangle trial fitted worse offline and better on the phone. Section 3.2 shows more inner frames than the phone does. So synthetic results gate mechanisms and regressions, and a real-frame set confirms them.

### 5.3 Public datasets

| Dataset | Content | Licence | Fit |
| --- | --- | --- | --- |
| [SmartDoc 2015 challenge 1](http://smartdoc.univ-lr.fr/smartdoc-2015-challenge-1/smartdoc-2015-challenge-1-dataset/) | A4 pages filmed hand-held on a Nexus 7 at 1920 x 1080, about 24,000 frames with a quad per frame. 1.5 GB on [Zenodo](https://zenodo.org/records/1230218). | CC BY 4.0 ([Zenodo](https://zenodo.org/records/1230218)) | Real camera video. A4 (0.707) is inside the card aspect gate, but the strong tilt puts every frame outside it (section 3.6). Plain white pages with no border. |
| [MIDV-500](https://arxiv.org/abs/1807.05786) and [MIDV-2019](https://arxiv.org/abs/1910.04009) | 50 printed identity documents, 15,000 and 6,000 video frames with quads. Keyboard, clutter, hand, low light, strong tilt. | CC BY-SA 2.5 (`license.txt` on the Smart Engines FTP) | ID-1 cards are 0.631, outside the gate. |
| [MIDV-2020](https://arxiv.org/abs/2107.00396) | 1,000 clips at 2160 x 3840, 68,409 annotated frames, plus 1,000 photos. Textured cloth, keyboards, highlights, outdoors. | CC BY-SA 2.5 ([l3i page](https://l3i-share.univ-lr.fr/MIDV2020/midv2020.html)) | The best match for patterned surfaces. ID-1 aspect again, and its passports are about 0.70 (**Unverified**). |
| Roboflow card sets | 67 to 780 images of trading cards with corners or masks | CC BY 4.0 per search snippets only (**Unverified**) | Small, and their image sources are unknown. |

- CC BY and CC BY-SA allow internal evaluation with attribution. ShareAlike applies only when adapted data is distributed ([CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/)).
- No public dataset has real Magic cards with per-frame quads that we could find.
- To use these sets, the bench must take the target aspect as a parameter. That tests a variant of the detector. It is useful for patterns, blur, and steadiness, not for the card aspect.

### 5.4 Scoring training crops

- `bun run crops pull` downloads the training crops and their evidence records, with `saved_printing_id` as `scryfallId` (`README.md`, Training crops). The gallery build keeps Scryfall `normal` images in `~/Library/Caches/mtgscan/scryfall-images`.
- The scorer in section 3.1 gives each crop's size error and shift in mm. It can run over every pulled crop with no phone.
- **What it can show.** The shipped detector's real error, split by app build (`recognizer_version`), and every inside outline in the field. A crop with a positive size over about 1.5 mm is a candidate inner-frame outline.
- **What it cannot show.**
  - A new detector. A crop holds only the inside of the outline, so the detector cannot run on it again.
  - Outlines that never held still, such as on patterned surfaces (#421).
  - Size and shift apart from the physical card's cut. Scryfall's scan is another copy of the card (**Inference**). Reproduction agreed within 0.27 mm (section 3.1), but there is no true outline to compare with.
- It needs the operator's secret key through `crops pull`, so it is an owner-side or release check, not a PR check. The owner command reads `.env.hosted`. Agents should not.

### 5.5 Real card frames, recorded once

The hard-shadow and binder-pocket photos from #10 are gone. The decisive set is short real preview clips of known cards, recorded once and reused by every later change:

- The owner records clips from a development build: plain and patterned surfaces, hard shadow, sleeve, black-bordered and borderless cards, tilt, and hand movement. This needs the phone once, not for each change.
- Each frame is labelled with no hand work: register the Scryfall `normal` image of the known card printing into the frame with SIFT and RANSAC, then refine with ECC (homography). This is the section 3.1 method in the other direction (**Inference.** It should work where the art is visible; glare and heavy blur will fail and must be dropped by a correlation floor).
- The clips hold only the table, the cards, and the hand. They stay out of the repository, like the gallery, and live in Storage or on the owner's Mac.

### 5.6 Metrics and pass bars

Per frame set and condition:

| Metric | Definition | Proposed bar for a detector PR |
| --- | --- | --- |
| Inside outlines | Outlines with any side more than 1 mm inside the card edge | No new one against `main`, on any frame. Zero on black-bordered cards at tilts up to 15°. |
| Corner error | Largest corner distance in mm on the card, median and p90 of detected frames | Median not worse by more than 0.1 mm, p90 not worse by more than 0.5 mm. |
| Size error sign | Mean of opposite sides, inside positive (#421) | Report. Outside errors up to the sleeve margin are expected. |
| Detection rate | Detected frames over frames with a card | Not lower in any condition by more than 1 frame in 30. |
| False outlines | Outlines on empty plain and patterned surfaces | Zero. |
| Jitter | Standard deviation of each corner's error on a still sequence | Not worse than `main`. |
| Settle time | Time from the card's arrival until `observeSample` in `src/scan/capture.ts` asks for a photo | Not worse than `main`. Patterned sequences that settle: not fewer. |
| Photo outline | Corner error of the outline used to straighten the photo, on sequences with hand movement | For 4.1: median below 0.5 mm. |
| Mac timing | p95 of `detect`, same Mac, same build | At most 1.2 times `main`. It is a proxy only: the 20 ms bar is on the iPhone. |

Mac timing changes with the test program. Our p95 was 4 to 5 ms (section 3.2), while #421 measured 11 to 34 ms with another program. Only an A/B on the same machine means anything.

## 6. The detector replay to build first

A detector replay, like `recognizer:replay`:

1. **A macOS detector command** in `modules/card-detector/Package.swift`, an executable target beside the fixture tests that compiles `ios/Detector` unchanged. It reads PNG or JPEG frames, or a video file, and writes one detection sample record per frame with timing. A `refine` mode takes a proposal, for photo re-refinement.
2. **A pinned synthetic frame recipe** in the scanner evidence pack, with the conditions of 5.2, about 30 frames per condition and tilt bucket, 20 short sequences, and the true corners in `labels.json`. It downloads its Scryfall images like `simulate.py`.
3. **A scorer** that writes the metrics of 5.6 per condition, and replays each sequence through `observeSample` from `src/scan/capture.ts`.
4. **`bun run detector:replay`** renders the frames, builds the command on the branch and on the merge base, runs both, and prints the comparison. It exits 1 on a failed bar, like the recognizer replay.

How it gates a detector PR:

- The Detector workflow already runs Vision on a macOS runner. It can run the replay on the branch and the merge base in the same job, so Vision and the hardware are the same on both sides.
- The PR shows the comparison table under a "Detector replay" heading.
- A change that the synthetic set cannot judge, such as one that depends on Vision's real proposals, also needs the real-frame set of 5.5 once it exists.
- The training crop scorer (5.4) runs after each release with a detector change, and checks that inside outlines did not rise.

## 7. Ranked list

1. **Build the detector replay** (section 6). Proof that it works: on `main` it reproduces section 3.2's mechanisms (inside outlines under tilt, sleeve edges, no false outlines), and the same run twice gives the same numbers.
2. **Refine the outline again on the photo, with a size check and a motion check** (4.1). Highest gain per cost: it removes the shift that cut off a collector line, and it runs outside the frame budget. Proof: on replay sequences with hand movement, the photo outline's median corner error is below 0.5 mm and there is no new inside outline. Then on the device, training crop shifts above 1 mm become rare.
3. **Perspective-correct aspect gate** (4.2). Removes the inner-frame outlines under tilt at almost no cost. Proof: zero inside outlines on black-bordered replay frames up to 15° of tilt, a higher detection rate when tilted, and still zero false outlines.
4. **Record the real-frame set once** (5.5). It confirms 2 and 3 on Vision's real proposals, and it is the only way to judge 5 and 6. Proof: auto-labels agree with hand-checked corners on a sample within 0.3 mm.
5. **Hard-shadow handling** (4.3). Medium gain, medium cost. Proof: inside outlines on shadow frames fall from 11 of 25 to near zero with no loss on the other conditions, and Mac p95 grows by at most 1.2 times.
6. **Tracking on patterned surfaces** (4.4). Gain is large where it works, but section 3.5 shows it also adds wrong outlines. Proof: patterned sequences settle more often, with no new inside outline and no false outline on empty patterned sequences. Needs real clips.
7. **An open corner model as the proposal** (4.7). Only if 6 fails. DocAligner (Apache 2.0) or LDRNet (MIT), trained on card frames. Proof: same as 6, plus the device budget.

Not recommended: sub-pixel and rounded-corner models (4.5, no error left to remove), `RecognizeDocumentsRequest`, `CIDetector`, contours, and Vision's rectangle detector (4.6 and `.out-of-scope`), and binder pockets for now (4.8).

## Not verified

- Every gain on the iPhone. All new numbers here are from synthetic frames or the SmartDoc sample on a Mac.
- Whether zero shutter lag is active with the app's capture format.
- Whether the video frame and the photo get the same geometric distortion correction ([isGeometricDistortionCorrectionEnabled](https://developer.apple.com/documentation/avfoundation/avcapturedevice/isgeometricdistortioncorrectionenabled)). If they do not, an outline mapped from the frame to the photo has a small error near the frame edges.
- The time of any Vision request or open model on the iPhone 16e.
- The MIDV-2020 download form's terms, and the Roboflow licences.
- Whether a sleeve explains the #421 "too large" outlines. It is read from the crops only.
