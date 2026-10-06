# Native preview scanner prototype

**Throwaway Wayfinder prototype.** This isolated Expo development-build app now preserves a rejected iOS trial of Apple's `VNDetectContoursRequest`. The trial tested whether an app-owned VisionCamera V4 frame processor could publish one bounded card quadrilateral for a later scanner experiment.

Automatic capture is hard-disabled. The app observes detector gates only. It does not recognize cards, measure recognition or detector accuracy, solve duplicate capture, choose production architecture, or prove Android support. The earlier fixed-edge and rejected Fast OpenCV work remains evidence and decision history. See [native-detector-research.md](./native-detector-research.md).

## Current design and boundaries

The active detector uses only Apple system frameworks and the pinned free JavaScript dependencies. It has no commercial SDK, OpenCV, detector network client, license service, cloud call, or image egress. `vision-camera-resize-plugin` remains pinned as part of the fixed host, but the active detector does not call it or create a resized buffer.

`native/ios/MTGCardRectangleFrameProcessorPlugin.swift` is a VisionCamera `4.7.3` `FrameProcessorPlugin`. Its callback runs synchronously inside one `autoreleasepool`. It reads the `CVPixelBuffer` directly from `frame.buffer`, maps every current `frame.orientation` case to `CGImagePropertyOrientation`, and creates one `VNDetectContoursRequest` plus one `VNImageRequestHandler` per call. It does not create or retain `CIImage`, `CGImage`, `UIImage`, RGB arrays, frames, sample buffers, pixel buffers, handlers, requests, or observations. It does not create a JavaScript point array or export contour paths.

`native/ios/MTGCardRectangleGeometry.swift` contains the pure Foundation/CoreGraphics/simd geometry shared by the plugin and the macOS fixture: four-or-closing-five normalization, ROI-local lower-left to full-image upper-left conversion, corner ordering, convexity/degeneracy checks, and scalar filters. It has no VisionCamera dependency.

The request uses the central guide-plus-margin region of interest, based on a 72% guide width, an 8% margin on each edge, and the 63:88 card ratio. It sets `maximumImageDimension` to `256`, contrast adjustment to `2.0`, and dark-on-light detection to `true`. The callback reads only `request.results?.first`, then inspects at most the first 32 contours by index. It approximates each contour once with epsilon `0.02`; shared geometry accepts four points, or five only when the final point closes to the first within an explicit `0.01` local-coordinate tolerance. It rejects nonfinite, out-of-unit, non-quadrilateral, degenerate, non-convex, off-center, or wrong-aspect candidates. It chooses the largest valid area. It returns the existing empty scalar record with runtime error code `0` when no candidate survives. A request-handler failure remains runtime error code `4`.

`VNDetectContoursRequest` contour points are ROI-local and use a lower-left origin. Shared geometry converts every accepted point through the current ROI transform into full-image upper-left coordinates before ordering it as top-left, top-right, bottom-right, bottom-left. Aspect ratio uses oriented pixel dimensions when measuring quad edges, so unequal normalized axes do not distort it. The fixed native record has only `detected`, four nullable corner objects, `confidence`, `areaRatio`, pixel-correct `aspectRatio`, `centerOffset`, `centerScore`, `nativeDurationMs`, normalized ROI x/y/width/height, `orientationCode`, and numeric `runtimeErrorCode`.

`native/ios/MTGCardRectangleFrameProcessorPlugin.m` imports the generated app header `MTGScanNativePreviewSpike-Swift.h` and registers `detectCardRectangle` with `VISION_EXPORT_SWIFT_FRAME_PROCESSOR`. `plugins/withAppleVisionRectangleDetector.js` uses Expo's `withBuildSourceFile` and Xcode mod APIs. It copies both project-owned files into the generated app directory, adds each to the app Sources phase, and links the system `Vision.framework`. `app.json` lists the local plugin. Clean prebuild needs no manual generated-iOS edit.

The worklet calls a thin `VisionCameraProxy` adapter under `runAtTargetFps(5)`. It rejects missing, extra, nonfinite, out-of-range, or structurally inconsistent native fields. It never receives a resized buffer. A missing plugin, native runtime error, invalid native record, orientation failure, diagnostics serialization failure, timing failure, or camera runtime error locks detector admission until the app restarts. The first fatal code wins. Queued diagnostics and timing records are ignored after that latch, so they cannot unlock the detector or replace the code. Manual reset cannot clear a fatal detector lock.

The overlay calculates the actual contained-preview rectangle from the reported oriented frame dimensions. It draws the returned quad with four bounded `View` edges. The guide and the blue guide-plus-margin ROI use the same contained-preview coordinates. Displayed and structured telemetry includes rounded ROI x/y/width/height, raw and oriented frame dimensions, and the explicit orientation code. It contains no photo path or image data.

## Timing and cadence evidence semantics

Each sample starts before the native call. The worklet publishes the main diagnostics record to JavaScript, then reads total duration. This means the measured total includes native Vision, validation, gate work, and the main Worklets-to-JavaScript diagnostics enqueue and serialization. A second bounded callback reports that post-main-publication total. The timing-report callback cannot include its own enqueue or execution. The total also does not claim JavaScript callback execution or React render time.

Only these post-main-publication totals feed the rolling nearest-rank p50, p95, and max. The window keeps the latest 300 samples. It also keeps sample wall timestamps and reports count, elapsed span, effective hertz, and maximum gap. The cadence field stays `WAIT` until the window contains all 300 samples, even when the partial-window rate is at least 4.5 Hz. Three hundred samples alone do not prove sustained 5 FPS. The bounded acceptance study requires at least `4.5` effective Hz.

The integration target remains p95 below 20 ms across 300 post-publication samples at target 5 FPS. Ten consecutive totals above 100 ms stop the session immediately. The tenth sample and its stop code are enqueued before the worklet lock is set. This safety stop does not relax the 20 ms acceptance target. `nativeDurationMs` is diagnostic only.

## Capture safety

`AUTOMATIC_CAPTURE_ENABLED` is exactly `false`, and the UI shows **Automatic capture: OFF** plus a disabled capture button. Detector gates are observational. The existing capture state machine, worklet lock, JavaScript in-flight guard, and reset guard remain in source and retain their deterministic tests, but no detector result can request a photo in this spike. A physical detector study must not change that constant.

This run makes no duplicate-capture claim. A later capture-enabled experiment still needs its own approval, departure tuning, interruption matrix, and physical exactly-one proof.

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

The final automated run used Xcode 26.3, build `17C529`, through `/Applications/Xcode.app/Contents/Developer`.

- `npm ci` installed 888 packages and reported 19 transitive audit findings, 10 moderate and 9 high. No forced audit update was applied.
- Prettier, Expo ESLint, strict TypeScript, and Vitest passed. All 11 prior state-machine and timing tests remain. Seven pure validation and cadence tests were added, for 18 passing tests total. Native runtime was not mocked.
- Expo Doctor passed 18 of 18 checks. Public config showed SDK `54.0.0`, the expected bundle ID, the VisionCamera plugin settings, and `./plugins/withAppleVisionRectangleDetector`.
- The Hermes iOS export passed and produced a 1.85 MB bundle.
- Two final clean iOS prebuilds completed in 23.01 and 21.61 seconds. After each run, each Swift/Objective-C build-file entry, file reference, Sources entry, Vision build-file entry, Vision file reference, and Frameworks entry appeared exactly once. Both copied sources were byte-identical to `native/ios/`.
- Explicit `pod install` passed with 85 dependency declarations and 84 Pods. The system Vision link added no Pod. A same-commit baseline and this build both measured 447,044 apparent KiB for generated Pods with `du -skA`, a 0 KiB delta.
- A clean unsigned generic iOS Simulator Debug build passed in 158.47 seconds. It compiled the exact V4 Swift initializer/callback and Objective-C registration without host changes.
- An unsigned generic iOS Release archive passed in 107.20 seconds. The archive measured 47,610 apparent KiB. Its app measured 21,162 apparent KiB. A same-command archive from the retained pre-detector commit measured 46,503 KiB and 21,152 KiB, so the comparable deltas were +1,107 KiB for the archive and +10 KiB for the app. The archive delta includes generated debug-symbol and archive metadata, not an embedded Vision binary.
- Project-owned native source is limited to the 7,507-byte frame-processor Swift file, 5,962-byte shared geometry Swift file, and 241-byte Objective-C registration file. Generated `ios/` remains ignored and untracked.

The simulator build and unsigned archive are compile and size evidence only. They do not exercise the camera or Apple Vision runtime.

## Reproduce checks and iOS compile

From this directory:

```bash
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run test:native-geometry  # macOS-only; compiles and runs in /tmp
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
5. Keep the phone in portrait. First leave the guide empty for 10 seconds. Then present centered, off-center, moving, partial, blurred, sleeved, foil, borderless, and low-contrast cards. This is observation only. No row should take a photo.
6. For each presentation, compare the blue ROI with the visible guide-plus-margin area. Compare all four magenta quad edges with the physical outer card border. Record device, iOS, lighting, card/sleeve/foil state, orientation code, raw/oriented frame dimensions, ROI x/y/width/height, detector scalars, and gate states.
7. Keep a stationary presentation until the rolling window reaches 300 samples. Record p50, p95, max, elapsed span, effective Hz, max gap, and slow streak. Acceptance needs p95 below 20 ms and effective cadence at least 4.5 Hz. A result from fewer samples or lower cadence is not accepted.
8. Stop on any fatal code, materially wrong ROI/quad mapping, preview or UI stall, serious thermal state, crash, or ten-sample slow kill. Restart the app to retry after a fatal detector lock. Manual reset must remain unable to clear it.
9. Finish with a 15-minute observation soak if the earlier gates hold. Record cadence, timing, memory trend, thermal state, and errors once per minute. Do not claim accuracy or capture behavior from the soak.

## Physical observations and current status

The generic max-four `VNDetectRectanglesRequest` trial passed its narrow physical timing and cadence window with automatic capture off. Its 300 samples measured p50 `16.5442 ms`, p95 `17.5440 ms`, and max `19.9810 ms`, at `4.5602 Hz`, with a `235 ms` maximum gap, no slow streak, and no fatal code. This is timing evidence only.

The max-four generic fit failed alignment robustness. The selected area was `0.3036` against a guide-aligned outer area of `0.4073`, and its center was low. With the card still inside the ROI, moving the phone made the magenta quad slide relative to the card. It remained displaced after the phone stopped for two seconds. Selecting up to four centered, card-shaped candidates reduced switching but did not improve the inset fit.

The dotted blue ROI had an x/y-to-left/top UI bug. That fix is in place and a human physically confirmed the blue ROI is centered. The native 8%-per-edge margin remains active. Its reported ROI is x `0.0824`, y `0.1719`, width `0.8352`, and height `0.6562`, and static tests pass. A deterministic macOS Vision fixture with an off-center rectangle and ROI confirmed that `VNDetectRectanglesRequest` observations use full-image coordinates, not ROI-local coordinates. The failed generic fit is not a preview-transform or ROI-local-coordinate bug.

Code-20 follow-up validation accepts VisionCamera's bridge conversion of native `NSNull` empty corners to JavaScript `undefined` and normalizes them to `null`. The native detector also discards Vision candidates with corners outside the `0...1` contract.

A transformed `VNDetectDocumentSegmentationRequest` physical run passed the long rolling timing window (p95 `10.02 ms`, `4.56 Hz`, and no fatal code), but the human still found its quad too low. The trial is rejected for alignment; no ROI offset is added. The ROI-local coordinate behavior was proved first with a deterministic macOS fixture and then by the physical build.

The bounded contour trial is rejected by its first physical iPhone run. At sample 300 it had no surviving detection and measured p50 `36.7163 ms`, p95 `40.7959 ms`, max `105.8025 ms`, and `4.5588 Hz`, with no fatal runtime code. A later magenta result was a tiny false contour with area ratio `0.0002`, not the card. The yellow placement guide remained visible. The blue dashed ROI border was not visible during this run even though telemetry continued to report the expected ROI x `0.0824`, y `0.1719`, width `0.8352`, and height `0.6562`; that missing diagnostic border is a separate UI-display issue and is not evidence that the native ROI disappeared. The trial fails both the sub-20-ms p95 gate and usable-card-detection gate. No negative-matrix or soak run is justified.

`npm run test:native-geometry` remains a checked-in macOS-only Swift fixture. It programmatically draws a 1000×1000 dark outlined rectangle from full-image x `.30...70` and upper-image y `.20...80`, runs the production contour request configuration with ROI x/y `.1/.1` and width/height `.8/.8`, and invokes the same shared geometry that production uses. The observation has two contours. Epsilon `.02` produces five points each, with the last a near-closing duplicate; the first contour's unique four points match expected ROI-local x `.25...75` and lower y `.125...875`, while the second is inset. The fixture asserts that the outer candidate has more area, that its transformed and ordered corners match the full-image rectangle, that asymmetric local points prove the lower-left-to-upper-left transform and ordering, and that a closing fifth point is accepted while a nonclosing fifth point is rejected. It writes no image. This proves the local-coordinate transform and bounded candidate rule only; the physical run shows that deterministic geometry correctness does not make the detector viable.

## Acceptance and kill gates

Accept this detector only as a candidate for a later experiment if a physical iPhone run proves all of the following:

- the contained-preview guide, ROI, and returned quad map correctly in every observed orientation;
- 300 post-main-publication samples sustain at least 4.5 effective Hz at target 5 FPS;
- total post-publication analysis has nearest-rank p95 below 20 ms;
- negative and difficult presentations have credible bounded behavior for a future tuned study;
- the 15-minute observation soak has no crash, serious thermal state, stuck preview, fatal detector error, image egress, or sustained memory growth.

Stop immediately on a missing native plugin, native runtime code, invalid record, serialization/timing error, camera runtime error, materially wrong mapping, crash, serious thermal state, visible stall, or ten consecutive totals above 100 ms. Do not rescue a failure with a host upgrade, generated native edit, OpenCV, commercial SDK, or cloud service.

## Platform claims

This implementation is iOS-first and uses Apple Vision. There is no Kotlin detector and no Android build or viability claim. The simulator and archive are compile evidence. The recorded physical runs are narrow timing and alignment evidence only; no detector or recognition accuracy claim is made.
