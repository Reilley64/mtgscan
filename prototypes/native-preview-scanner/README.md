# Native preview scanner prototype

**Throwaway Wayfinder prototype.** This isolated Expo development-build app tests one detector design for the approved first-release scanning target. The target is one card lying flat on a surface, mostly visible, with moderate rotation and camera movement, and no precise alignment. The detector takes a coarse Apple Vision document proposal and moves each edge to straight luminance evidence in the camera frame.

Automatic capture is hard-disabled. The app observes detector output only. It does not recognize cards, measure recognition accuracy, solve duplicate capture, choose production architecture, or prove Android support. Earlier fixed-edge, Fast OpenCV, rectangle, document-segmentation, and contour trials remain decision history below and in [native-detector-research.md](./native-detector-research.md).

## Current design and boundaries

The detector uses only Apple system frameworks and the pinned free JavaScript dependencies. It has no commercial SDK, OpenCV, network client, license service, cloud call, or image egress. `vision-camera-resize-plugin` remains pinned as part of the fixed host, but the detector does not call it.

There is no guide, guide margin, or region of interest. The whole oriented frame is analyzed.

The native work runs in four project-owned files under `native/ios/`:

- `MTGCardQuadGeometry.swift` has the orientation transform, line fitting and intersection, corner ordering, convexity checks, and quad metrics.
- `MTGCardEdgeRefiner.swift` reads the luma plane and refines the four edges.
- `MTGCardQuadDetector.swift` runs the Vision proposal, locks the pixel buffer read-only, and calls the refiner.
- `MTGCardRectangleFrameProcessorPlugin.swift` is the thin VisionCamera `4.7.3` plugin. It maps the frame orientation, calls the detector, and returns the fixed scalar record. `MTGCardRectangleFrameProcessorPlugin.m` still registers it as `detectCardRectangle`.

The first three files have no UIKit or VisionCamera dependency, so the macOS fixture and the still-image evaluator compile them unchanged. `plugins/withAppleVisionRectangleDetector.js` copies all five files into the generated app and links `Vision.framework`.

### Orientation correction

VisionCamera `4.7.3` sets `frame.orientation` to the orientation the buffer is in. It is not the rotation needed to display the buffer upright. With the back camera in portrait, the buffer is `landscapeRight`, and VisionCamera reports `.left`. Its own snapshot code displays the same buffer with the inverse, `.right` (`Orientation.portrait.relativeTo(orientation:)` in `CameraView+TakeSnapshot.swift`).

Every earlier Apple Vision trial passed `frame.orientation` directly to `VNImageRequestHandler`. In portrait, Vision therefore saw the frame rotated by 180 degrees, and every returned quad was mirrored through the frame center. The symmetric guide and ROI looked correct, but a card slightly above center was drawn below center and moved against the phone. This matches the earlier "too low" and "slides with camera movement" observations. The plugin now passes the inverse orientation to Vision: `.left` becomes `.right`, `.right` becomes `.left`, and the other six cases are their own inverse. Physical confirmation is still needed.

### Coarse proposal

`VNDetectDocumentSegmentationRequest` runs once per sample on the full `CVPixelBuffer` with the corrected orientation. The detector reads only the first observation. It converts its four lower-left normalized corners to oriented upper-left pixels and orders them clockwise from the corner nearest the top-left. A proposal with a corner outside the frame is reported as status 2 and is not refined.

On the private photos, the proposal usually stopped at the silver inner frame of black-bordered cards. On the synthetic fixture it was 64 px inside the true card. The refiner exists to remove that inset with image evidence.

### Edge refinement

The refiner works in oriented pixel coordinates and samples the YUV luma plane in place through the orientation transform. It does not copy, resize, or convert the frame.

For each proposal edge:

1. Take 24 sample points between 12% and 88% of the edge, away from the rounded corners.
2. At each point, read a luminance profile along the outward normal, averaged across 5 px along the edge. The search reaches 15% of the proposal's short side in each direction, at least 6 px and at most 96 px.
3. Convert each profile to a step response: the mean of the next 4 px minus the mean of the previous 4 px. A soft, blurred card edge gives a strong response. A thin printed line gives a weak one. Steps below 8 luma levels are ignored.
4. Score every straight line within 8 degrees of the proposal edge, at 1 px offset and endpoint steps. A line counts a sample when that sample has a same-sign step on it. Lines with at least 70% of samples are kept, with the strongest slope for each offset.
5. From the outermost line inward, refine each kept line. Find the sub-pixel step peak within 3 px of the line in each sample, fit total least squares to points within 2 px, then fit again. Keep up to three lines whose refit still has at least 70% of samples.

The detector then tries every combination of the kept lines (at most 81). It intersects adjacent lines and accepts a combination only if all four corners are inside the frame, the quad is convex, its area is at least 2% of the frame, and its mean side-length aspect ratio is within 0.03 of 63:88. From the accepted combinations it picks the one whose edges are furthest out. No fixed offset, clamp, or artificial expansion moves an edge. Each edge moves only to a line that the image supports.

Failure statuses are explicit. Status 1 means no proposal. Status 3 means at least one edge had no line with 70% support. Status 4 means no line combination made a card-shaped quad.

### Native record

The plugin returns one flat record: `detected`, four refined corners, `proposalDetected`, four proposal corners, proposal `confidence`, refined `areaRatio`, pixel-correct `aspectRatio`, `centerOffset`, `edgeSupportMin`, signed `shiftTop`, `shiftRight`, `shiftBottom`, and `shiftLeft` (outward is positive, as a fraction of the proposal short side), `refinementStatus`, `proposalDurationMs`, `nativeDurationMs`, `orientationCode`, and `runtimeErrorCode`. Corners are normalized to the oriented frame with an upper-left origin. Runtime codes are 1 orientation, 2 missing pixel buffer, 3 invalid dimensions, 4 Vision failure, and 5 unsupported or unlockable luma plane. The JavaScript worklet rejects missing, extra, nonfinite, out-of-range, or inconsistent fields. A refined quad requires a proposal and status 0.

The worklet calls the plugin under `runAtTargetFps(5)`. A missing plugin, native runtime error, invalid record, orientation failure, diagnostics or timing failure, or camera error locks the detector until the app restarts. The first fatal code wins, and manual reset cannot clear it.

### Overlay and gates

The overlay maps both quads into the contained preview rectangle. The proposal is a thin cyan outline. The refined quad is magenta, and it turns green when every observation gate passes. The gates are refined detection, proposal confidence at least 0.5, area 0.08 to 0.9, aspect 0.686 to 0.746, and minimum edge support at least 0.7. They are observation-only.

## Timing and cadence evidence semantics

Each sample starts before the native call. The worklet publishes the main diagnostics record to JavaScript, then reads total duration. This means the measured total includes native Vision, validation, gate work, and the main Worklets-to-JavaScript diagnostics enqueue and serialization. A second bounded callback reports that post-main-publication total. The timing-report callback cannot include its own enqueue or execution. The total also does not claim JavaScript callback execution or React render time.

Only these post-main-publication totals feed the rolling nearest-rank p50, p95, and max. The window keeps the latest 300 samples. It also keeps sample wall timestamps and reports count, elapsed span, effective hertz, and maximum gap. The cadence field stays `WAIT` until the window contains all 300 samples, even when the partial-window rate is at least 4.5 Hz. Three hundred samples alone do not prove sustained 5 FPS. The bounded acceptance study requires at least `4.5` effective Hz.

The integration target remains p95 below 20 ms across 300 post-publication samples at target 5 FPS. Ten consecutive totals above 100 ms stop the session immediately. The tenth sample and its stop code are enqueued before the worklet lock is set. This safety stop does not relax the 20 ms acceptance target. `nativeDurationMs` is diagnostic only.

## Capture safety

`AUTOMATIC_CAPTURE_ENABLED` is exactly `false`, and the UI shows **Automatic capture: OFF** plus a disabled capture button. Detector gates are observational. The existing capture state machine, worklet lock, JavaScript in-flight guard, and reset guard remain in source and retain their deterministic tests, but no detector result can request a photo in this spike. A physical detector study must not change that constant.

This run makes no duplicate-capture claim. A later capture-enabled experiment still needs its own approval, departure tuning, interruption matrix, and physical exactly-one proof.

## Offline evidence

`npm run test:native-detector` compiles the three shared Swift files with a macOS fixture and runs it in `/tmp`. It writes no image. It checks:

- the orientation transform against Core Image's `oriented(_:)` for all eight EXIF orientations, pixel by pixel;
- the transform against Vision itself, by detecting an off-center rectangle in a `1280x720` buffer under all eight orientations and mapping its center back to the buffer within 4 px, so a 180-degree error would fail;
- refinement of a rendered, 7-degree-rotated, black-bordered card with an inner frame and a text box under `.right`, `.up`, and `.left`, starting from a proposal that is 6% low and 6% small, to under 1.5 px corner error with at least 90% support;
- weak-edge rejection on a blank noisy surface;
- the full detector on a synthetic card under `.right`, where document segmentation was 63.6 px off and the refined quad was 0.02 px off.

On this Mac the synthetic refinement measured about 0.7 ms p50 and 0.75 ms p95.

`npm run evaluate:stills -- <output-directory> <image>...` runs the same detector on still photos with orientation `.up` and writes overlay PNGs, cyan for the proposal and magenta for the refined quad, to the chosen directory. It reads local files only.

The private corpus from the earlier still-capture baseline has 24 photos. Six show the black-bordered card lying on a wood table, which is the approved target. Eighteen show a borderless card in a binder pocket, which is outside it. Results from visual review of each overlay:

| Set           | Refined | Outer card edge on all four sides | Wrong quad |
| ------------- | ------: | --------------------------------: | ---------: |
| Wood table    |     6/6 |                               5/6 |        1/6 |
| Binder pocket |   16/18 |                              2/18 |      14/18 |

The wood-table miss has its bottom edge in a hard shadow, where the outer edge reached only 14 of 24 samples. The detector combined that inner bottom line with outer side lines and reported a 0.741 aspect quad. In most binder photos, the proposal already matched the borderless card, but the refiner moved at least one edge to a pocket or neighbor edge because it is straight, further out, and still card-shaped. Total Mac time per photo was about 4 ms to 5 ms, with about 2.5 ms in document segmentation. These photos come from one card and two scenes. They tuned the thresholds, so they are not accuracy evidence.

## Rejected Fast OpenCV package admission

The free package-first spike installed unchanged `react-native-fast-opencv@0.4.8` on the fixed Expo `54.0.37`, React Native `0.81.5`, React `19.1.0`, VisionCamera `4.7.3`, Worklets Core `1.6.3`, and resize-plugin `3.2.0` stack. Its MIT npm package resolved the permissively licensed `FastOpenCV-iOS 1.0.4` Pod. Two clean Expo iOS prebuilds, Pod installation, and unsigned Xcode 26.3 simulator and device builds passed without patches or host-pin changes.

Code review rejected the candidate before device installation. Exact `0.4.8` cannot enforce the required contour bound through its public interface: `toJSValue(MatVector)` copies and creates JavaScript metadata for every contour before a 64-contour cap can apply, each polygon approximation materializes its point array, and `findContours` order makes taking the first 64 contours arbitrary. Keeping the code would either leave work unbounded or make the winning card contour unreliable. The dependency and detector code were removed.

The transient Pods directory grew by 56,908 KiB. The existing signed Debug device app was 81,696 KiB by `du`; the unsigned Fast OpenCV comparison app was 88,852 KiB, an approximate increase of 7,156 KiB. Signing differences make that app delta indicative rather than archival evidence. No physical runtime, memory, timing, overlay, accuracy, or cleanup claim was made. The integration target remains total preview analysis p95 below 20 ms across 300 samples at 5 FPS; repeated samples above 100 ms remain a safety stop, not an acceptance target. This bounded-interface rejection activates the previously researched last-resort custom Apple Vision plugin.

## Fixed dependency trial

| Package                       | Installed resolution |
| ----------------------------- | -------------------: |
| Expo SDK                      |            `54.0.37` |
| React Native                  |             `0.81.5` |
| React                         |             `19.1.0` |
| `react-native-vision-camera`  |              `4.7.3` |
| `react-native-worklets-core`  |              `1.6.3` |
| `vision-camera-resize-plugin` |              `3.2.0` |
| `expo-dev-client`             |             `6.0.21` |

The local plugin imports `expo/config-plugins`, the SDK 54 sub-export. No additional direct build dependency was needed. The package lock remains isolated to this prototype. VisionCamera frame processors are enabled. Microphone and location permissions are disabled. The camera uses YUV preview, enables still-photo capability for the preserved capture machine, and disables video and audio.

This is an Expo development build. Expo Go cannot load the native plugin.

## Automated build evidence

The 2026-10-06 run used Xcode 26.3 through `/Applications/Xcode.app/Contents/Developer`.

- Prettier, Expo ESLint, strict TypeScript, and Vitest passed with 20 tests. The new record tests cover the proposal and refined quads, refinement status, shifts, and runtime code 5. Native runtime was not mocked.
- `npm run test:native-detector` passed all checks listed under offline evidence.
- A clean iOS prebuild, `pod install`, and an unsigned generic iOS Simulator Debug build passed. The generated project had one file reference and one Sources build entry for each of the five project-owned native files, and linked `Vision.framework`. Each copied source was byte-identical to `native/ios/`.
- Generated `ios/` remains ignored and untracked.

The simulator build is compile evidence only. It does not exercise the camera or the Apple Vision runtime on a phone. Earlier runs measured package, archive, and app size for the previous detector. They were not repeated.

## Reproduce checks and iOS compile

From this directory:

```bash
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run test:native-detector  # macOS-only; compiles and runs in /tmp
npx expo-doctor
npx expo config --type public
npx expo export --platform ios --output-dir /tmp/native-preview-scanner-export

export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
npx expo prebuild --clean --platform ios
(
  cd ios
  pod install
)
xcodebuild \
  -workspace ios/MTGScanNativePreviewSpike.xcworkspace \
  -scheme MTGScanNativePreviewSpike \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Do not retain generated `ios/` edits. Re-run clean prebuild instead.

## Capture-disabled physical procedure

A human must do this on an iPhone. Automated checks must not use credentials or install a signed build.

1. Connect the iPhone, trust the computer, and enable Developer Mode if requested.
2. Open `ios/MTGScanNativePreviewSpike.xcworkspace` in Xcode 26.3. Select the app target, the tester's development team, and the connected phone. Let Xcode manage signing.
3. Run `npm start` in another shell. Build and run from Xcode, then grant camera permission.
4. Confirm the UI says **Automatic capture: OFF** and the capture button is disabled. Do not change `AUTOMATIC_CAPTURE_ENABLED`.
5. Keep the phone in portrait. First point it at an empty surface for 10 seconds.
6. Orientation check. Lay one card flat on a plain surface, then move the phone so the card sits near the top of the preview, then near the bottom, then left, then right. The cyan and magenta outlines must stay on the card and move with it. If either outline sits on the opposite side or moves against the card, stop. The orientation correction failed.
7. Lay one card flat on a surface and hold the phone roughly above it. Present a black-bordered card, a white-bordered or borderless card, a sleeved card, a foil card, the card rotated about 20 degrees, the card partly off-frame, and the card on a patterned surface. No row should take a photo.
8. For each row, compare the magenta edges with the physical outer card edge, and the cyan edges with the same edge. Record device, iOS, lighting, surface, card and sleeve state, refinement status, edge support, the four shifts, aspect, area, and gate states.
9. Keep a stationary presentation until the rolling window reaches 300 samples. Record p50, p95, max, proposal and native time, elapsed span, effective Hz, max gap, and slow streak. Acceptance needs p95 below 20 ms and effective cadence at least 4.5 Hz.
10. Stop on any fatal code, materially wrong mapping, preview or UI stall, serious thermal state, crash, or ten-sample slow kill. Restart the app to retry after a fatal detector lock.
11. Finish with a 15-minute observation soak if the earlier gates hold. Record cadence, timing, memory trend, thermal state, and errors once per minute. Do not claim accuracy or capture behavior from the soak.

Photos of cards flat on real surfaces can also go through `npm run evaluate:stills` before or after the device run.

## Physical observations and current status

The proposal-plus-refinement detector has not run on a phone yet. The paragraphs below record the earlier trials. Each Apple Vision trial below passed `frame.orientation` to Vision uncorrected, so its alignment observations were made on a 180-degree-rotated analysis frame. Their timing results still stand. Their alignment conclusions need a retest after the orientation correction.

The generic max-four `VNDetectRectanglesRequest` trial passed its narrow physical timing and cadence window with automatic capture off. Its 300 samples measured p50 `16.5442 ms`, p95 `17.5440 ms`, and max `19.9810 ms`, at `4.5602 Hz`, with a `235 ms` maximum gap, no slow streak, and no fatal code. This is timing evidence only.

The max-four generic fit failed alignment robustness. The selected area was `0.3036` against a guide-aligned outer area of `0.4073`, and its center was low. With the card still inside the ROI, moving the phone made the magenta quad slide relative to the card. It remained displaced after the phone stopped for two seconds. Selecting up to four centered, card-shaped candidates reduced switching but did not improve the inset fit.

The dotted blue ROI had an x/y-to-left/top UI bug. That fix is in place and a human physically confirmed the blue ROI is centered. The native 8%-per-edge margin remains active. Its reported ROI is x `0.0824`, y `0.1719`, width `0.8352`, and height `0.6562`, and static tests pass. A deterministic macOS Vision fixture with an off-center rectangle and ROI confirmed that `VNDetectRectanglesRequest` observations use full-image coordinates, not ROI-local coordinates. The failed generic fit is not a preview-transform or ROI-local-coordinate bug.

Code-20 follow-up validation accepts VisionCamera's bridge conversion of native `NSNull` empty corners to JavaScript `undefined` and normalizes them to `null`. The native detector also discards Vision candidates with corners outside the `0...1` contract.

A transformed `VNDetectDocumentSegmentationRequest` physical run passed the long rolling timing window (p95 `10.02 ms`, `4.56 Hz`, and no fatal code), but the human still found its quad too low. The trial is rejected for alignment; no ROI offset is added. The ROI-local coordinate behavior was proved first with a deterministic macOS fixture and then by the physical build.

The bounded contour trial is rejected by its first physical iPhone run. At sample 300 it had no surviving detection and measured p50 `36.7163 ms`, p95 `40.7959 ms`, max `105.8025 ms`, and `4.5588 Hz`, with no fatal runtime code. A later magenta result was a tiny false contour with area ratio `0.0002`, not the card. The yellow placement guide remained visible. The blue dashed ROI border was not visible during this run even though telemetry continued to report the expected ROI x `0.0824`, y `0.1719`, width `0.8352`, and height `0.6562`; that missing diagnostic border is a separate UI-display issue and is not evidence that the native ROI disappeared. The trial fails both the sub-20-ms p95 gate and usable-card-detection gate. No negative-matrix or soak run is justified.

`npm run test:native-geometry` remains a checked-in macOS-only Swift fixture. It programmatically draws a 1000×1000 dark outlined rectangle from full-image x `.30...70` and upper-image y `.20...80`, runs the production contour request configuration with ROI x/y `.1/.1` and width/height `.8/.8`, and invokes the same shared geometry that production uses. The observation has two contours. Epsilon `.02` produces five points each, with the last a near-closing duplicate; the first contour's unique four points match expected ROI-local x `.25...75` and lower y `.125...875`, while the second is inset. The fixture asserts that the outer candidate has more area, that its transformed and ordered corners match the full-image rectangle, that asymmetric local points prove the lower-left-to-upper-left transform and ordering, and that a closing fifth point is accepted while a nonclosing fifth point is rejected. It writes no image. This proves the local-coordinate transform and bounded candidate rule only; the physical run shows that deterministic geometry correctness does not make the detector viable.

## Acceptance and kill gates

Accept this detector only as a candidate for a later capture experiment if a physical iPhone run proves all of the following:

- the cyan and magenta quads stay on the card and move with it in every observed position, which confirms the orientation correction;
- the magenta quad follows the outer card edge for the supported black-bordered, borderless, sleeved, and foil rows on a plain surface;
- 300 post-main-publication samples sustain at least 4.5 effective Hz at target 5 FPS;
- total post-publication analysis has nearest-rank p95 below 20 ms;
- difficult rows fail visibly with status 3 or 4 rather than as a wrong green quad often enough to plan a tuned study;
- the 15-minute observation soak has no crash, serious thermal state, stuck preview, fatal detector error, image egress, or sustained memory growth.

Stop immediately on a missing native plugin, native runtime code, invalid record, serialization or timing error, camera runtime error, materially wrong mapping, crash, serious thermal state, visible stall, or ten consecutive totals above 100 ms. Do not rescue a failure with a host upgrade, generated native edit, OpenCV, commercial SDK, cloud service, fixed offset, clamp, or artificial expansion.

## Platform claims

This implementation is iOS-first and uses Apple Vision. There is no Kotlin detector and no Android build or viability claim. The macOS fixture, still-image evaluation, simulator build, and archive are compile and offline evidence only. No detector or recognition accuracy claim is made.
