# Native detector research

_Date checked: 2026-09-01. This is research for the throwaway native preview scanner. It is not an architecture decision._

## Update: orientation correction and edge refinement

_Date checked: 2026-10-06._

VisionCamera `4.7.3` reports `frame.orientation` as the orientation of the buffer, not the rotation that displays it. In `CameraView.swift`, frames get `connection.orientation.imageOrientation`. The video data output connection stays at the sensor's `landscapeRight`, which maps to `.left`. VisionCamera's own snapshot path displays the same buffer with `Orientation.portrait.relativeTo(orientation: snapshot.orientation)`, which is `.right`. The two are inverses. Every earlier Apple Vision trial passed `.left` to Vision in portrait, so Vision analyzed a frame rotated by 180 degrees. That can explain the earlier quad that was "too low" and slid against camera movement. The rejected rectangle and document-segmentation alignment results need a retest with the corrected orientation. Their timing results still stand.

The new prototype corrects the orientation, uses `VNDetectDocumentSegmentationRequest` as a coarse full-frame proposal, and refines each edge against straight luminance steps in the YUV luma plane. See [README.md](./README.md#edge-refinement). A macOS fixture checks the orientation mapping against Core Image and Vision for all eight orientations. Offline, on six private photos of a card on a wood table, the refined quad followed the outer card edge on all four sides in five photos. In binder pockets it often chose the pocket edge. No physical iPhone run has been made.

## Answer

The free-package admission is complete and rejected. Unchanged [`react-native-fast-opencv@0.4.8`](https://github.com/lukaszkurantdev/react-native-fast-opencv/releases/tag/v0.4.8) installed and compiled on the fixed Expo `54.0.37`, React Native `0.81.5`, React `19.1.0`, VisionCamera `4.7.3`, Worklets Core `1.6.3`, and resize-plugin `3.2.0` stack. Its MIT npm package resolved the permissively licensed `FastOpenCV-iOS 1.0.4` Pod. Two clean prebuilds, Pod installation, and unsigned Xcode 26.3 simulator and device builds passed without patches or host changes. This is compile evidence only.

Bounded-interface review found a decisive limitation in exact `0.4.8`. Its public `toJSValue(MatVector)` path copies and creates JavaScript metadata for every contour before mtgscan can apply a 64-contour cap. Each `approxPolyDP` candidate then requires a point array to be materialized in JavaScript. Processing only the first 64 contours does not fix this because OpenCV does not promise `findContours` order, so the physical card contour could be skipped. The candidate therefore cannot provide both bounded work and reliable selection through its public TypeScript API. It was rejected before device installation, and the dependency and unsafe detector code were removed.

No Fast OpenCV runtime, cleanup, memory, timing, overlay, or accuracy claim is made. Integration would still require total preview analysis p95 below 20 ms across 300 samples at 5 FPS. Repeated samples above 100 ms remain the immediate safety stop, not an alternate acceptance target.

[`vision-camera-dynamsoft-document-normalizer@4.1.0`](https://www.npmjs.com/package/vision-camera-dynamsoft-document-normalizer/v/4.1.0) remains rejected because it embeds a proprietary SDK, requires a trial or paid key, and uses online licensing. The user has rejected commercial, proprietary, paid, trial-key, and online-licensed detector dependencies.

The Fast OpenCV admission failure activated the previously defined last-resort candidate: a small app-owned iOS VisionCamera V4 plugin around Apple's `VNDetectRectanglesRequest`. Apple documents credit cards and business cards as intended rectangle inputs, the API accepts a `CVPixelBuffer` directly, and it can return only four normalized points plus confidence. The custom spike was later approved and implemented. Two clean prebuilds, explicit Pod installation, a clean unsigned Xcode 26.3 simulator build, and an unsigned generic iOS archive passed on the fixed stack. This is compile evidence only. No Apple Vision device runtime, overlay, timing, cadence, thermal, memory, or accuracy claim exists yet.

## Fixed host stack

Expo SDK 54 maps to React Native 0.81 and iOS 15.1 or later in Expo's [SDK version table](https://github.com/expo/expo/blob/sdk-54/docs/ui/components/SDKTables/sdk-versions.json). The existing experiment fixes the more exact versions below and has already run VisionCamera frames and still capture on a physical iPhone 16e. See the [prototype result](./README.md).

| Dependency                    | Exact version to retain |
| ----------------------------- | ----------------------: |
| `expo`                        |               `54.0.37` |
| `react-native`                |                `0.81.5` |
| `react`                       |                `19.1.0` |
| `react-native-vision-camera`  |                 `4.7.3` |
| `react-native-worklets-core`  |                 `1.6.3` |
| `vision-camera-resize-plugin` |                 `3.2.0` |
| `expo-dev-client`             |                `6.0.21` |

VisionCamera's V4 docs say native frame processor plugins install through CocoaPods and return JS-representable primitives, objects, or arrays. Frame processors run synchronously unless the caller uses `runAsync`; `runAsync` serializes its jobs rather than running them in parallel. VisionCamera recommends native plugins, YUV input, and reduced invocation frequency for expensive work. It warns that RGB conversion adds memory and time. Sources: [V4.7.3 iOS plugin guide](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSOR_CREATE_PLUGIN_IOS.mdx), [frame processor guide](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSORS.mdx), [performance tips](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSORS_TIPS.mdx), and [interaction guide](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSORS_INTERACTING.mdx).

Expo Go cannot load any option in this report. Expo documents that a [development build includes project native code](https://github.com/expo/expo/blob/sdk-54/docs/pages/workflow/using-libraries.mdx), while config plugins apply native configuration during prebuild. A clean prebuild is part of every compile proof.

## Candidate findings

### Rejected after compile: `react-native-fast-opencv@0.4.8`

**Status and terms.** Version `0.4.8` is MIT licensed and was released on 2026-02-23. Its podspec pins [`FastOpenCV-iOS` `1.0.4`](https://github.com/lukaszkurantdev/fastopencv-ios/tree/1.0.4), which uses a permissive BSD-style OpenCV license and embeds OpenCV `4.9.0`. Both dependencies are free. The visible package source contains no network client or cloud service. The current [`1.0.1`](https://github.com/lukaszkurantdev/react-native-fast-opencv/releases/tag/v1.0.1) remains out of scope because its README says V1 supports only the New Architecture and was tested on React Native 0.85 and later.

**Compile evidence.** Unchanged `0.4.8` installed with the fixed host pins. Two clean Expo iOS prebuilds and Pod installs passed. Unsigned Xcode 26.3 simulator and device builds passed. The package therefore cleared the exact-stack compile gate without package patches, host changes, extra native dependencies, or project-owned Swift or Kotlin. Compile success did not exercise its detector API on a device.

**Bounded-interface rejection.** The package supplies Canny, `findContours`, `arcLength`, `approxPolyDP`, contour area, and object conversion through JSI. Its [VisionCamera example](https://github.com/lukaszkurantdev/react-native-fast-opencv/blob/v0.4.8/docs/pages/examples/realtimedetection.md) converts a resized typed array into a Mat and then calls `OpenCV.toJSValue(contours)` to discover the contour count. Exact `0.4.8` implements that conversion in [`FOCV_Object.cpp`](https://github.com/lukaszkurantdev/react-native-fast-opencv/blob/v0.4.8/cpp/FOCV_Object.cpp) by copying the native Mat vector and creating one JavaScript metadata object for every contour. That unbounded transfer happens before application code can cap contour examination at 64.

Each four-point candidate also has to cross the interface as a JavaScript point array after `approxPolyDP`. Limiting those conversions to the first 64 contours would bound candidate materialization, but OpenCV does not promise a useful `findContours` order. The physical card contour could fall outside the arbitrary prefix. Exact `0.4.8` therefore cannot provide both bounded application-visible work and a reliable winning-contour selection. Adding a native selector, patching the package, or using an exhaustive rectangle search would violate this spike's scope.

**Cost evidence.** The transient Pods directory grew from 942,300 KiB to 999,208 KiB, an increase of 56,908 KiB. The existing signed Debug device app was 81,696 KiB by `du`; the unsigned Fast OpenCV comparison app was 88,852 KiB, an approximate increase of 7,156 KiB. The signing difference prevents treating that app delta as archive evidence. The package's [usage guide](https://github.com/lukaszkurantdev/react-native-fast-opencv/blob/v0.4.8/docs/pages/usage.md) also requires `OpenCV.clearBuffers()` to release native objects, but cleanup behavior was not claimed because the candidate stopped at interface review.

**Decision.** Reject and remove the dependency and TypeScript detector before device installation. No physical performance, memory, cleanup, overlay, traffic, or accuracy claim exists. The acceptance threshold would have remained total preview analysis p95 below 20 ms across 300 samples at 5 FPS. Repeated samples above 100 ms would have stopped a run for safety; they would not have relaxed acceptance.

### Rejected: `vision-camera-dynamsoft-document-normalizer@4.1.0`

This package is maintained enough to be technically credible and is the only dedicated VisionCamera V4 document plugin found that returns four points, `confidenceAsDocumentBoundary`, and area from preview frames. Its README maps versions `>=3.0.0` to VisionCamera V4. Version `4.1.0` was published on 2025-10-14, and the repository received source changes through 2025-12-22. Its development matrix uses older React Native `0.74.3`, VisionCamera `^4.4.0`, and Worklets Core `^1.3.3`, so the exact stack was never proven.

The wrapper is MIT, but its podspec pins proprietary `DynamsoftCaptureVisionBundle` `3.0.5200`. A trial or paid key is required. Dynamsoft's [license-server docs](https://www.dynamsoft.com/license-server/docs/about/index.html) describe License 2.0 keys as online licenses and activation as required. This violates the free-dependency decision. Do not install, compile, request a key, or run an admission test.

There are technical concerns too. Its [iOS callback](https://github.com/tony-xlh/vision-camera-dynamsoft-document-normalizer/blob/4.1.0/ios/DetectionFrameProcessorPlugin.swift) creates `CIImage`, a new `CIContext`, `CGImage`, and `UIImage` for every processed frame and may allocate another rotated image. It handles `.left` and `.down` but not `.right` or mirrored orientation. The visible wrapper has no image-upload call, but online license traffic is definite and the processing SDK is an opaque binary. None of those details override the licensing rejection.

### Capture-UI packages

These packages detect documents inside their own camera screen. They do not expose quadrilaterals for mtgscan's VisionCamera preview.

- [`react-native-document-scanner-plugin@2.0.4`](https://github.com/WebsiteBeaver/react-native-document-scanner-plugin/tree/2.0.4) is MIT, published 2026-01-02, developed against React Native `0.81.0`, and includes an Expo config plugin for camera permission. On iOS it opens a package-owned scanner UI and resolves cropped image paths or base64. It does not return live corners. Its Android source launches Google Play services' ML Kit Document Scanner.
- [`@dariyd/react-native-document-scanner@2.0.19`](https://github.com/dariyd/react-native-document-scanner/tree/2.0.19) was published 2026-04-02 and declares React Native `>=0.77.3`. Its iOS source presents `VNDocumentCameraViewController`; its response contains captured image files and optional base64, not frame observations.
- [`react-native-scanbot-sdk@9.0.2`](https://www.npmjs.com/package/react-native-scanbot-sdk/v/9.0.2) is a maintained commercial SDK with RN `>=0.73` and an Expo config plugin. The vendor says processing is offline. Its documented React Native integration launches a Ready-To-Use scanning flow and returns a scanned document. It does not document a VisionCamera frame plugin or a live quadrilateral callback. It is a different UX, not a detector swap.

Apple's [`VNDocumentCameraViewController`](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller) and these wrappers may be valid if the product chooses a system or vendor scan screen. They cannot preserve the current contained VisionCamera preview, centered Magic-card guide, capture state machine, or scalar timing experiment. The smallest proof for that different UX is a clean Expo development build, one launch, one canceled scan, and one accepted scan returned as a file path. Avoid base64 because it adds another full encoded image in JS memory. Check the package-owned screen's privacy and offline behavior, output dimensions, cache cleanup, and device memory. That proof says nothing about real-time quad output, so it is not part of the detector admission plan.

### ML Kit Document Scanner is not a frame processor

Google's official [ML Kit Document Scanner documentation](https://developers.google.com/ml-kit/vision/doc-scanner) labels this API Android-only. An app requests a Google Play services scan flow, the user controls that UI, and the result returns selected JPEG or PDF pages. Google says the flow and processing are on-device and that its models and large resources arrive through Google Play services. It does not expose per-frame contours or quadrilaterals to React Native.

[`@infinitered/react-native-mlkit-document-scanner@5.0.0`](https://www.npmjs.com/package/@infinitered/react-native-mlkit-document-scanner/v/5.0.0) is therefore not an iOS option and not a VisionCamera detector. Its package manifest registers only Android. Do not infer iOS support from the broader ML Kit brand.

No other maintained npm package found under the obvious VisionCamera document-scanner or OpenCV names supplied a better exact match. Old packages whose names match but whose releases predate VisionCamera V4 were not promoted as candidates.

## Last-resort custom iOS plugin

The approved custom spike uses the existing VisionCamera `4.7.3` native plugin contract with Apple's system Vision framework. It does not add OpenCV.

### Why this API

Apple's [`VNDetectRectanglesRequest`](https://developer.apple.com/documentation/vision/vndetectrectanglesrequest) has existed since iOS 11. Apple says it detects projected rectangles such as credit cards, business cards, documents, and signs, and returns [`VNRectangleObservation`](https://developer.apple.com/documentation/vision/vnrectangleobservation) corner coordinates and confidence. It supports minimum and maximum aspect ratio, minimum size, minimum confidence, maximum observations, and quadrature tolerance. Magic's physical short-to-long ratio is `63 / 88`, about `0.716`, which fits the API's shorter-dimension-over-longer-dimension definition. Start with a broader range; do not treat `0.716` as an observed-image invariant under perspective.

Apple also has the Swift `DetectRectanglesRequest`, but it requires iOS 18. The older `VNDetectRectanglesRequest` keeps Expo SDK 54's iOS 15.1 deployment floor and is the smallest compatibility proof. [`VNImageRequestHandler`](https://developer.apple.com/documentation/vision/vnimagerequesthandler) accepts a `CVPixelBuffer` plus `CGImagePropertyOrientation`, so no `CGImage`, `UIImage`, RGB array, or file is needed.

### Smallest interface

Initialize once with fixed experiment options and expose one worklet method:

```ts
type RectangleResult = null | {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
  confidence: number
  areaRatio: number
  aspectRatio: number
  nativeDurationMs: number
}

detectCardRectangle(frame): RectangleResult
```

Return one rectangle because `maximumObservations = 1`. Return normalized coordinates in the upright, oriented image with an upper-left origin. Vision's inherited [`boundingBox`](https://developer.apple.com/documentation/vision/vndetectedobjectobservation/boundingbox) uses normalized coordinates with a lower-left origin, so the plugin must convert the coordinate convention before returning. Keep all configuration fixed at plugin initialization. Do not return frames, pixel buffers, images, contours, base64, file paths, or unbounded arrays.

### Buffer, orientation, lifetime, and threads

The callback gets `frame.buffer` and `frame.orientation` from VisionCamera. Extract `CVPixelBuffer` with `CMSampleBufferGetImageBuffer`. Map every `UIImage.Orientation` case explicitly to `CGImagePropertyOrientation`; the raw enum values are not interchangeable. Construct `VNImageRequestHandler(cvPixelBuffer:orientation:options:)`, perform one request synchronously, copy only scalar results, and release all request objects inside an `autoreleasepool` before returning.

VisionCamera streams sensor-oriented buffers and tells plugins to interpret `frame.orientation` rather than rotate pixels. See its [orientation guide](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/ORIENTATION.mdx). Do not retain `Frame`, `CMSampleBuffer`, `CVPixelBuffer`, a request handler, or an observation beyond the callback. Create a request per call and keep the plugin stateless. This avoids undocumented shared-request thread safety. Invoke it synchronously inside `runAtTargetFps(5)` for the first proof. If later moved to `runAsync`, remember that VisionCamera serializes those jobs and may finish an in-flight job after the camera component unmounts. The callback still must finish before using its buffer.

Set the request's central `regionOfInterest` to the guide plus its outside margin, use a broad aspect range around the card ratio, and derive area and aspect from the returned quad. Exact request thresholds remain experiment values. Busy playmats, card art frames, sleeves, foil glare, borderless cards, occlusion, and low contrast are unproven.

### Persistence and build impact

VisionCamera's Swift setup requires a Swift subclass plus a small Objective-C registration file using `VISION_EXPORT_SWIFT_FRAME_PROCESSOR`. Both source files now live in `native/ios/`, outside generated `ios/`. The local Expo config plugin copies them into the generated app target and adds them to the Xcode project through Xcode mods. `app.json` lists the plugin. Two clean prebuilds proved idempotence. Never rely on hand edits inside generated `ios/`, because `expo prebuild --clean` deletes them. Expo's [config plugin guide](https://github.com/expo/expo/blob/sdk-54/docs/pages/config-plugins/plugins.mdx) documents mods and clean prebuild.

The implementation keeps the host pins in the fixed-stack table. It imports `expo/config-plugins`, so it did not need a new direct JavaScript build dependency. There is no new native binary or runtime package. Link the system `Vision` framework. `VNDetectRectanglesRequest` is available below the app's existing iOS floor, so no deployment-target increase is needed. The app gains two small native source files and the config plugin. It still requires an Expo development build.

The detector has no network call and returns no image data. Under the implemented interface, frame data remains inside the app process and no image leaves the frame callback. Apple Vision may allocate internal working memory; that cost needs measurement. Direct `CVPixelBuffer` input removes the wrapper-visible full-frame copies used by Dynamsoft and Fast OpenCV, but it is not a performance result.

## Android is separate

Do not infer Android parity from an iOS result.

VisionCamera `4.7.3` documents a Kotlin frame processor API and registration package in its [Android plugin guide](https://github.com/mrousavy/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSOR_CREATE_PLUGIN_ANDROID.mdx). A credible later Android experiment could wrap official OpenCV contour operations in Kotlin or JNI. OpenCV's current official release is [`5.0.0`](https://github.com/opencv/opencv/releases/tag/5.0.0), with an Android SDK and an `org.opencv:opencv:5.0.0` Maven artifact. That path would need independent YUV conversion, ABI-size, 16 KB page-size, orientation, memory, performance, and device testing. It is not evidence that the iOS algorithm or thresholds transfer.

Google ML Kit Document Scanner is the other credible Android option, but only as its own UI flow. It cannot feed quadrilaterals into the existing preview. No Android viability claim is made for the Dynamsoft wrapper, Fast OpenCV `0.4.8`, or the proposed Apple Vision behavior without an Android build and physical test.

## Admission result and next proof

### Completed free-package admission

The spike installed exact `react-native-fast-opencv@0.4.8` without changing the fixed host stack. Two clean prebuilds, Pod installation, and unsigned simulator and device builds passed. The compile gate is complete.

The package then failed bounded-interface review before device runtime. `toJSValue(MatVector)` materializes metadata for every contour before application code can cap work, four-point approximations cross as JavaScript point arrays, and selecting the first 64 contours is arbitrary. Do not reinstall, patch, or rescue `0.4.8`. Do not try the 1.x line, change host versions, or add another detector package.

No physical Fast OpenCV matrix was run. The following gates remain requirements for any later detector. They are not Fast OpenCV results:

- stop immediately if any ten consecutive total-analysis samples exceed 100 ms, effective analysis cadence cannot sustain the requested 5 Hz while the camera is healthy, the preview or UI stalls, native cleanup fails, memory grows through the soak, or the app crashes;
- require total preview analysis p95 **below 20 ms** across 300 samples at 5 FPS for integration; p95 from 20 ms through 100 ms is rejection even when bounded diagnostics remain safe;
- require all four overlay corners within 3% of the physical outer border in at least 9 of 10 stationary samples, plus empty, moving, partial, blurred, foil, sleeve, borderless, and low-contrast checks;
- require exactly one still through hand shake and preview interruption only after capture is explicitly enabled and tuned;
- require a 15-minute soak without duplicates, serious thermal state, camera errors, traffic carrying detector or image data, or sustained memory growth.

### Activated Apple Vision proof

The custom Apple Vision candidate is now implemented under the separate approval that followed the Fast OpenCV rejection. It retains every runtime host pin and uses the system `Vision.framework`. The local config plugin imports `expo/config-plugins`, so no extra direct build dependency was needed.

The app-owned Swift class matches VisionCamera `4.7.3`'s `FrameProcessorPlugin` initializer and callback, reads `frame.buffer`, maps every current `frame.orientation` case explicitly, and registers through `VISION_EXPORT_SWIFT_FRAME_PROCESSOR` with `MTGScanNativePreviewSpike-Swift.h`. It gives `VNImageRequestHandler` the `CVPixelBuffer` directly. The synchronous callback creates one request and handler inside one `autoreleasepool`, limits results to one observation in a central guide-plus-margin ROI, and returns only the fixed corner/scalar record. It creates no Core Image, Core Graphics image, UIKit image, RGB array, file, network request, or retained frame object.

`plugins/withAppleVisionRectangleDetector.js` copies the Swift and Objective-C sources from `native/ios/`, adds them once to the app Sources phase, and links Vision once. Two final clean prebuilds completed in 23.01 and 21.61 seconds. Each generated file reference, build-file entry, Sources entry, and Vision Frameworks entry appeared exactly once after both runs, and both copies matched their project-owned source byte for byte. Explicit `pod install` retained 84 Pods from 85 declarations.

A clean unsigned generic iOS Simulator Debug build passed in 158.47 seconds on Xcode 26.3. An unsigned generic iOS Release archive passed in 107.20 seconds. With `du -skA`, the archive was 47,610 KiB and its app was 21,162 KiB. A same-command pre-detector archive from the retained commit was 46,503 KiB with a 21,152 KiB app, for deltas of +1,107 KiB and +10 KiB. Generated Pods were 447,044 apparent KiB in both baseline and candidate builds.

The worklet calls the plugin at target 5 FPS and validates the exact record. Its total timing is read only after the main diagnostics handoff returns, so rolling p50/p95/max includes native Vision, validation, gates, and the main diagnostics enqueue/serialization. A second bounded callback reports that total and cannot include itself, JavaScript callback execution, or React rendering. Sample wall timestamps report elapsed span, effective hertz, and maximum gap. Acceptance still requires 300 post-publication samples, p95 below 20 ms, and at least 4.5 effective Hz. Ten consecutive totals above 100 ms publish the tenth stop record and then lock the session.

Automatic capture remains visibly disabled. The capture machine and exactly-one/in-flight/reset guards remain, but detector gates are observation-only. Missing plugin, native, record, serialization, timing, and camera failures lock the detector until restart. The physical overlay, negative presentations, timing/cadence window, and 15-minute soak remain unrun. Do not infer accuracy, duplicate prevention, Android support, or production readiness from compile success.

## Decision table

| Option                                              | Real-time quad in mtgscan preview                         | Exact-stack evidence                                                       | Native code owned by app                                      | Data and terms                                                     | Cost/risk                                                                                  | Decision                                |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `react-native-fast-opencv@0.4.8`                    | Package exposes contours, but not a safely bounded winner | Exact Expo 54 / RN 0.81 compile passed; no device runtime                  | No Swift or Kotlin; rejected TypeScript recipe was removed    | MIT plus permissive FastOpenCV-iOS/OpenCV terms; local processing  | Unbounded all-contour metadata conversion; arbitrary capped contour prefix; binary size    | **Reject at bounded-interface review**  |
| `react-native-fast-opencv@1.0.1`                    | Primitives only                                           | Tested RN 0.85+, not target RN 0.81                                        | No native app code, but app would own detector logic          | MIT; local processing                                              | Host-version mismatch                                                                      | Reject for this stack                   |
| `vision-camera-dynamsoft-document-normalizer@4.1.0` | Yes, four points, confidence, area                        | VC V4 declared; exact stack unproven                                       | No                                                            | Wrapper MIT, proprietary SDK, trial or paid key, online activation | Licensing violates the user's free-only decision                                           | **Reject without admission**            |
| `react-native-document-scanner-plugin@2.0.4`        | No, package-owned capture UI                              | Developed on RN 0.81 and has Expo plugin                                   | No                                                            | MIT; iOS system UI                                                 | Returns captured files, not preview observations                                           | UX alternative only                     |
| `react-native-scanbot-sdk@9.0.2`                    | No documented VisionCamera callback                       | RN `>=0.73`, Expo plugin                                                   | No                                                            | Commercial                                                         | Ready-To-Use UI and native SDK size                                                        | Reject under free-only policy           |
| ML Kit Document Scanner wrappers                    | No, Google Play services UI                               | Android only                                                               | No                                                            | On-device flow; Google Play services delivery                      | Returns selected pages                                                                     | Not iOS and not frame processing        |
| Custom VisionCamera + `VNDetectRectanglesRequest`   | Yes, exactly one bounded record                           | Exact-stack simulator build and unsigned archive passed; no device runtime | Yes, Swift plus Objective-C registration and JS config plugin | No extra SDK license; no detector network path                     | Small app-owned module, direct pixel-buffer input, performance and accuracy still unproven | **Implemented; physical proof pending** |

**Decision:** reject and remove Fast OpenCV after its compile pass and bounded-interface failure. Do not run it physically. The separately approved Apple Vision plugin now clears the exact-stack compile, persistence, and unsigned-archive gates. Physical privacy, total-timing, cadence, overlay, detector behavior, and soak gates remain. This is still an experiment, not a production architecture decision.
