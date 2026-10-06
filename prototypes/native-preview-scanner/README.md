# Native preview scanner prototype

**Throwaway Wayfinder prototype.** This isolated Expo development-build app tests one detector design for the approved first-release scanning target. The target is one card lying flat on a surface, mostly visible, with moderate rotation and camera movement, and no precise alignment. The detector takes a coarse Apple Vision document proposal and moves each edge to straight luminance evidence in the camera frame.

Automatic capture is enabled for the approved exactly-one capture experiment. Photos stay on the phone. The app does not recognize cards, measure recognition accuracy, solve duplicate capture, choose production architecture, or prove Android support. Earlier fixed-edge, Fast OpenCV, rectangle, document-segmentation, and contour trials remain decision history below and in [native-detector-research.md](./native-detector-research.md).

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
5. From the outermost line inward, refine each kept line. Find the sub-pixel step peak within 3 px of the line in each sample, fit total least squares to points within 2 px, then fit again. Keep up to five lines whose refit still has at least 70% of samples.

The detector then tries every combination of the kept lines (at most 625). It intersects adjacent lines and accepts a combination only if all four corners are inside the frame, the quad is convex, its area is at least 2% of the frame, and its mean side-length aspect ratio is within 0.02 of 63:88, and all four lines have the same step polarity. From the accepted combinations it picks the one whose edges are furthest out. No fixed offset, clamp, or artificial expansion moves an edge. Each edge moves only to a line that the image supports.

Failure statuses are explicit. Status 1 means no proposal. Status 3 means at least one edge had no line with 70% support. Status 4 means no line combination made a card-shaped quad.

### Native record

The plugin returns one flat record: `detected`, four refined corners, `proposalDetected`, four proposal corners, proposal `confidence`, refined `areaRatio`, pixel-correct `aspectRatio`, `centerOffset`, `edgeSupportMin`, signed `shiftTop`, `shiftRight`, `shiftBottom`, and `shiftLeft` (outward is positive, as a fraction of the proposal short side), `refinementStatus`, `proposalDurationMs`, `nativeDurationMs`, `orientationCode`, and `runtimeErrorCode`. Corners are normalized to the oriented frame with an upper-left origin. Runtime codes are 1 orientation, 2 missing pixel buffer, 3 invalid dimensions, 4 Vision failure, and 5 unsupported or unlockable luma plane. The JavaScript worklet rejects missing, extra, nonfinite, out-of-range, or inconsistent fields. A refined quad requires a proposal and status 0.

The worklet calls the plugin under `runAtTargetFps(5)`. A missing plugin, native runtime error, invalid record, orientation failure, diagnostics or timing failure, or camera error locks the detector until the app restarts. The first fatal code wins, and manual reset cannot clear it.

### Overlay and gates

A **Light** button turns the phone's torch on or off when the camera has one. Each change is logged as `torch-changed`, so a run shows which samples and photos used the light. The torch can add glare on foil cards and sleeves. The overlay maps both quads into the contained preview rectangle. The proposal is a thin cyan outline. The refined quad is always magenta. The status panel shows the gates. The gates are refined detection, proposal confidence at least 0.5, area 0.08 to 0.9, aspect 0.696 to 0.736, and minimum edge support at least 0.7. Together they decide whether a card is present for the capture gates below.

## Timing and cadence evidence semantics

The config plugin sets `SWIFT_OPTIMIZATION_LEVEL` to `-O` for the app target's Debug configuration. Physical runs use a Debug build so that logs reach Metro. Without this setting, Xcode compiles the detector with `-Onone`. On this Mac that made the same refinement take 72 ms instead of 0.8 ms. Pods keep their normal Debug settings.

Each sample starts before the native call. The worklet publishes the main diagnostics record to JavaScript, then reads total duration. This means the measured total includes native Vision, validation, gate work, and the main Worklets-to-JavaScript diagnostics enqueue and serialization. A second bounded callback reports that post-main-publication total. The timing-report callback cannot include its own enqueue or execution. The total also does not claim JavaScript callback execution or React render time.

Only these post-main-publication totals feed the rolling nearest-rank p50, p95, and max. The window keeps the latest 300 samples. It also keeps sample wall timestamps and reports count, elapsed span, effective hertz, and maximum gap. The cadence field stays `WAIT` until the window contains all 300 samples, even when the partial-window rate is at least 4.5 Hz. Three hundred samples alone do not prove sustained 5 FPS. The bounded acceptance study requires at least `4.5` effective Hz.

The integration target remains p95 below 20 ms across 300 post-publication samples at target 5 FPS. Ten consecutive totals above 100 ms stop the session immediately. The tenth sample and its stop code are enqueued before the worklet lock is set. This safety stop does not relax the 20 ms acceptance target. `nativeDurationMs` is diagnostic only.

## Capture safety

The owner approved a capture-enabled experiment on 2026-10-06. `AUTOMATIC_CAPTURE_ENABLED` is now `true`, and the UI shows **Automatic capture: ON** with a photo count. Photos stay in VisionCamera's temporary files. They leave the phone only when the recognition settings below are present.

`src/capture/quadCaptureGates.ts` turns each detector sample into capture gates for the existing state machine:

- A card is present when every detector gate passes.
- The card is stable when no refined corner moved more than 4% of the card's short side since the previous sample, 200 ms earlier at 5 Hz.
- There is card evidence while the card is present, or while the proposal has confidence of at least 0.6 and covers at most 60% of the frame. On the recorded device runs, refined frames had proposal confidence of at least 0.90 and area 0.12 to 0.29. Empty frames had confidence 0 or about 0.6 and usually covered most of the frame. Frames where a card was present but refinement failed kept confidence near 1.0 and a card-sized area. A refinement flicker therefore does not count as departure.

The state machine requests one photo after the card is present and stable for 400 ms. It then stays in cooldown until card evidence is absent for 1 second. The worklet lock, the JavaScript in-flight guard, and the reset guard still apply. Unit tests replay sample sequences through the real gates and state machine. They check one photo per presentation, no photo for a moving card or an empty surface, no re-arm from a refinement flicker, no re-arm from a departure shorter than 1 second, and no re-arm while a partly hidden card keeps a confident card-sized proposal.

`npm run physical-run:capture` counts `capture-success` events from the app log for an empty surface, ten separate presentations, a 20-second still hold, a 20-second handheld hold, and a patterned surface. The exactly-one gate passes when the empty surface gives no photo, no presentation gives two or more photos, each hold gives exactly one photo for a card laid down after the count starts, and the patterned surface gives at most one. Missed presentations are reported separately. An interruption matrix, such as backgrounding the app during a capture, is not covered yet.

The first capture run, with commit `428cfe7`, took one photo for the first card and none after it until the tester tapped Reset study. Two bugs caused this. The worklet capture guard was set on every photo request and cleared only by Reset study, so it dropped every later request. The state machine's cooldown step also spread the previous state with `{ ...state }`. The state lives in a worklets-core shared value, and the log showed the cooldown state losing its `phase` and `captureLocked` fields one sample after the photo, while the card was still in view. Without the stuck guard, that would have re-armed capture on the same card. The guard is now released whenever the machine is unlocked, through `nextCaptureGuard`, and the state machine builds every state field explicitly. The replay tests use the same guard function. A new test passes state objects whose fields are not enumerable, like a host object, and fails with the old spread.

The second capture run, with commit `e81df02`, gave no photo on the empty surface, exactly one photo for each of ten presentations, one for the 20-second still hold, and one on the patterned surface. The tester judged the capture timing good. The handheld hold gave two photos. The first came when the tester put the card back after starting the count. About 13 seconds later, with the card still down, the outline dropped out and the proposal covered only 10% of the frame at confidence 0.76. That failed the 0.8 card-evidence threshold for at least 600 ms, so capture re-armed and took a second photo of the same card. Across all device runs, frames without a refined outline but with proposal confidence 0.65 to 0.9 always had a card-sized proposal area of 0.07 to 0.36, while empty frames had confidence 0 to 0.6 and covered most of the frame. The card-evidence threshold is now 0.6 and the departure time is now 1 second. The wizard's handheld stage now asks for the card swap before the count starts.

The third capture run, with commit `80b2880`, took 13 photos for 13 card placements: ten presentations, the still hold, the handheld hold, and the patterned surface. There were no duplicates, no misses, no capture failures, and no photo on the empty surface. During the still hold the refined outline dropped out for two telemetry lines, but the proposal kept confidence 0.98 at card size, so capture did not re-arm. During about 30 seconds of handheld cooldown, corner motion reached 15% of the short side between samples without a second photo. The wizard flagged the handheld hold because the re-placed card's photo landed just after the count started. Both hold stages now start with the card out of view and expect exactly one photo. With capture on, the worst full-window p95 was 15.7 ms, the lowest cadence was 4.55 Hz, and there was no slow streak. The longest single sample was 856 ms, which did not start a slow streak. This is one phone, one tester, and one set of cards. Interruptions such as backgrounding the app during a photo are still untested.

### Interruption recovery

VisionCamera `4.7.3` does not report an error when iOS pauses the camera for backgrounding, a locked screen, or a call. Frames stop and later resume. For a real `AVCaptureSession` runtime error, it calls `onError` and restarts the session itself. The app now handles these cases:

- A gap of more than 1 second between detector samples resets a hold, so the next photo needs a fresh 400 ms steady view. It keeps a cooldown locked and clears any departure that began before the gap, so dark frames while the camera restarts cannot complete an old departure. The app logs `capture-resumed-after-gap`.
- A failed photo returns capture to seeking, so the same card can be captured after a fresh hold. Three failures in a row stop capture until Reset study.
- A camera runtime error is logged as `camera-error` and handled like a gap. Three camera errors within 30 seconds stop the detector with code 40, as before.

Replay tests cover a pause that starts during departure and resumes on dark frames, a pause during a hold, the cooldown lock across a pause, and repeated photo failures. Without the gap rule, the first test takes a duplicate photo. `npm run physical-run:interruptions` checks backgrounding, the lock screen, and Control Center during cooldown, a card swapped while the app is away, and capture after returning. The first interruptions run, on the same phone with commit `ff1ca18`, passed every stage. Going to the home screen for 5.1 seconds and locking the screen for 6.4 seconds during cooldown each kept the single photo, with a logged resume in cooldown. Control Center did not pause the camera and kept the single photo. Removing card A while the app was away for 3.3 seconds and then laying card B down gave one photo for each card. After a 5.0-second absence with no card, capture worked normally. The run had six photos for six cards, no capture failures, no camera errors, and no fatal stop. Phone calls were not tested.

## Recognition experiment

When `EXPO_PUBLIC_RECOGNITION_URL` and `EXPO_PUBLIC_RECOGNITION_TOKEN` are set in the ignored `.env` file, each automatic photo is uploaded once to the rectified recognition service in `../scanner-accuracy`. The upload carries the refined outline that triggered the photo, in the photo's displayed orientation. Uploads run one at a time with a 10-second timeout. The service straightens the card, keeps only the straightened crop, and returns the top candidates and an accept or abstain decision. The app shows the result in the status panel and logs `recognition-result` or `recognition-failure` with the end-to-end time from the photo request to the parsed result. Without the settings, the app does not upload anything. The image egress policy for issue #10 allows one captured card image per scan. This experiment sends it to a service on the tester's own Mac over the local network, so it does not choose a production backend.

`npm run physical-run:recognition` runs the experiment. It starts the service with a new token for the run, writes `.env` with this Mac's Wi-Fi address, starts Metro, and deletes `.env` when it finishes. It then names the cards from the 40-card owned test list one at a time, scores each result against the exact printing, and runs a timed 10-card speed pass. `scripts/recognition-score.mjs` does the scoring from the app log. The issue #10 gates are identity top-1 of at least 99%, exact printing of at least 97%, end-to-end p95 below 1.5 seconds, and at least 30 correct cards per minute. A 40-card run is far too small to estimate a false-accept rate.

A shell check on this Mac sent a stored wood-table photo and its detector outline over the local network with the app's headers. The service accepted the correct DSC printing in 518 ms cold and 313 ms warm, and the app's response parser read the reply. No phone run has been made yet.

The first phone recognition run, with commit `1c1c935`, presented 33 named cards. It made no false accepts, but identity top-1 was 18 of 33, exact printing top-1 was 15 of 33, and only 7 were accepted. End-to-end p95 was 1,488 ms. Two problems caused most misses. Foil Secret Lair cards and sleeve glare inverted the tones of the art, so the appearance shortlist ranked the true printing around 1,230th of 1,339 and the ORB check never saw it. A gradient descriptor ranked two of those cards first in an offline check. When the tester switched to a phone holder over a bin, the cards lay sideways relative to the phone, so the service squashed a landscape card into a portrait crop. In that part of the run, each new card slid onto the last one, so the card never departed. Extra photos and the card-by-card prompts drifted out of step.

### Stacked cards

For the holder and bin workflow, a new card that covers the last one must count as a change. After refinement, the native detector samples an 8 by 6 grid of luminance over the art area, from 10% to 90% of the card width and 12% to 55% of its height, and returns it as `signature`. When a photo is requested, the capture step keeps that signature. During cooldown, a refined card whose signature correlates below 0.6 with the kept one counts as departure, so the usual 1-second rule re-arms capture for the new card. A hand covering the card hides the refined outline, so it cannot count as a change. Two copies of the same printing in a row still need a real departure. The first version sampled a 6 by 8 grid over the whole card with a 0.8 threshold. In the first bin round, the same card often scored only 0.82 to 0.89 because the frame and text box dominate that grid, and cards from one set share them. Over 1,339 Scryfall references, the whole-card grid gave different cards in the same set a median correlation of 0.59, with 8% above 0.8. The art-area grid gave a median of 0.09 and a 95th percentile of 0.49. With simulated jitter, a lighting gradient, and blur, the same card kept a 5th percentile of 0.82 with the art grid. The macOS fixture measures 0.93 for the same card after a small shift and about 0 for different art. The app logs `capture-rearmed` with the reason, `card-changed` or `card-absent`, so each new photo can be traced.

The first bin round, with commit `c87be3d`, used 20 white cards. Every card got the exact printing as its first result, and 15 were accepted with no accepted result outside the batch. It took 56 photos. Most were whole extra passes through the stack, and a few came right after Reset study. Charming Prince was photographed twice about 5 seconds apart with no reset, which matches a false change with the old signature. In stretches of steady sliding, each card took about 4 to 4.5 seconds, about 14 cards per minute, against the gate of 30. End-to-end p95 was 1,499 ms. The batch score now counts a repeat photo of a batch card as a duplicate, not a false accept. `src/capture/quadCaptureStep.ts` holds the whole per-sample capture step, and the hook and the replay tests both call it.

`npm run physical-run:bin` runs batches from the collection export. It skips printings already scanned in an earlier run, as listed in the ignored `.physical-runs/scanned-scryfall-ids.txt`. It groups cards by the rightmost coloured symbol in the mana cost, and each round picks one group with cards left at random. Each round shows the next cards as a checklist. The tester ticks each card by number as it is found, then slides the ticked cards into the bin in any order. Unticked cards move to the back of the list for that run and come back when the rest of the list is used up. `scripts/recognition-score.mjs bin-score` matches each result to the batch by exact printing first and then by name. It reports identity and printing top-1, accepts, false accepts, missed cards, extra results, latency, and correct cards per minute.

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

The wood-table miss has its bottom edge in a hard shadow, where the outer edge reached only 14 of 24 samples. With the current polarity and aspect rules it falls back to the inner silver frame. The binder counts come from the earlier rules and were not reviewed again. In most binder photos, the proposal already matched the borderless card, but the refiner moved at least one edge to a pocket or neighbor edge because it is straight, further out, and still card-shaped. Total Mac time per photo was about 4 ms to 5 ms, with about 2.5 ms in document segmentation. These photos come from one card and two scenes. They tuned the thresholds, so they are not accuracy evidence.

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

## Physical procedure

A human must do this on an iPhone. Automated checks must not use credentials or install a signed build.

Run `npm run physical-run` to be guided through these steps. The wizard starts Metro, opens Xcode, checks each gate, reads timing from the app log, and saves the results to an ignored `.physical-runs/<timestamp>/` folder with a `summary.md`. Set `PHYSICAL_RUN_DIR` to an earlier run folder to reuse its answers as defaults. Run `npm run physical-run:capture` for the exactly-one capture check. Run `npm run physical-run:quick` after a detector change to rebuild and check one still card for 60 seconds in 6 stages instead of 17. The wizard finds the Apple team ID from the last device build, saves it under `.physical-runs/`, and passes it to prebuild as `MTGSCAN_APPLE_TEAM_ID`, so regenerated projects keep signing. The steps below are the same procedure in manual form.

1. Connect the iPhone, trust the computer, and enable Developer Mode if requested.
2. Open `ios/MTGScanNativePreviewSpike.xcworkspace` in Xcode 26.3. Select the app target, the tester's development team, and the connected phone. Let Xcode manage signing.
3. Run `npm start` in another shell. Build and run from Xcode, then grant camera permission.
4. Confirm the UI shows the expected automatic capture state. It is **ON** in the current build.
5. Keep the phone in portrait. First point it at an empty surface for 10 seconds.
6. Orientation check. Lay one card flat on a plain surface, then move the phone so the card sits near the top of the preview, then near the bottom, then left, then right. The cyan and magenta outlines must stay on the card and move with it. If either outline sits on the opposite side or moves against the card, stop. The orientation correction failed.
7. Lay one card flat on a surface and hold the phone roughly above it. Present a black-bordered card, a white-bordered or borderless card, a sleeved card, a foil card, the card rotated about 20 degrees, the card partly off-frame, and the card on a patterned surface. Photos may be taken when automatic capture is on.
8. For each row, compare the magenta edges with the physical outer card edge, and the cyan edges with the same edge. Record device, iOS, lighting, surface, card and sleeve state, refinement status, edge support, the four shifts, aspect, area, and gate states.
9. Keep a stationary presentation until the rolling window reaches 300 samples. Record p50, p95, max, proposal and native time, elapsed span, effective Hz, max gap, and slow streak. Acceptance needs p95 below 20 ms and effective cadence at least 4.5 Hz.
10. Stop on any fatal code, materially wrong mapping, preview or UI stall, serious thermal state, crash, or ten-sample slow kill. Restart the app to retry after a fatal detector lock.
11. Finish with a 15-minute observation soak if the earlier gates hold. Record cadence, timing, memory trend, thermal state, and errors once per minute. Do not claim accuracy or capture behavior from the soak.

Photos of cards flat on real surfaces can also go through `npm run evaluate:stills` before or after the device run.

## Physical observations and current status

The first proposal-plus-refinement run on an iPhone 16e with iOS 26.6.1, on 2026-10-06, stopped with fatal code 50 at the orientation stage. The detector was built with `-Onone`, so total native time was 57 ms to 94 ms against a Vision proposal of 4 ms to 10 ms. The 300-sample window measured p50 81.5 ms and p95 102 ms. This run is not timing evidence for the optimized detector. In the same run, an empty surface produced no refined outline, and the frame orientation code was 2. One card presentation refined with every gate passing: aspect 0.724, edge support 0.875, and all four edges moved outward from the proposal. The run did not reach the orientation check, so the orientation correction is still unconfirmed.

The second run used the same phone with the Debug configuration built with `-O` (commit `0b81376`). It completed every stage.

- Both outlines followed the card near the top, bottom, left, and right of the preview, which confirms the orientation correction on a device.
- The empty surface produced no refined outline.
- The 300-sample stationary window measured p50 13.29 ms, p95 14.13 ms, max 16.52 ms, native 10.98 ms, and proposal 7.30 ms, at 4.56 Hz with a 238 ms maximum gap and no slow streak. This passes the timing gate.
- The 15-minute soak kept p95 between 13.9 ms and 14.1 ms and cadence between 4.53 Hz and 4.58 Hz each minute, with no fatal code, crash, stall, or temperature warning. Xcode memory went from 137.3 MB to 148.8 MB. Two readings cannot show whether memory was still growing.
- In the app, the refined outline turned mint when every gate passed. The tester read that as light blue and answered "no magenta" for every row, so the per-row fit answers are not usable. The wizard also saved row telemetry after the answers, not during the observation.
- During the stationary timing window and soak, the refined quad alternated between two results for the same card. In 54 of 185 telemetry lines it was the outer card edge, with aspect 0.715. In 131 lines the top and left edges sat on inner lines, while right and bottom stayed on the outer edge, with aspect 0.745. In those frames the proposal's top edge was 56 px inside the card, beyond the 15% search reach, and the mixed quad passed the ±0.03 aspect tolerance.

After this run, the aspect tolerance became ±0.02, all four selected edges must share one step polarity, each edge keeps up to five lines, and the refined outline stays magenta. Offline, widening the search to 20% or 25% moved edges onto a neighboring card and onto wood grain, so the reach stays at 15%. With these rules, the shadowed wood-table photo now falls back to the inner frame instead of a mixed quad. That is still a wrong quad. The next physical run should show whether stationary frames now alternate between the outer edge and a visible failure instead of a wrong quad.

The third run was a quick still-card check on the same phone with commit `cd7aa8f`. A black-bordered card lay flat on a plain surface for 60 seconds with the phone resting still. All 10 telemetry lines in that window refined with every gate passing, and every line reported aspect 0.714, area about 0.187, and edge support 1.00. The tester saw magenta on the outer card edge on all four sides with no jumping. The full rolling window measured p95 14.2 ms at 4.55 Hz, with native time 7 ms to 13 ms and proposal time 5 ms to 8 ms. This is one card, one surface, and one lighting setup. It does not cover the other card rows, handheld movement, or a second device.

The fourth run repeated the full procedure with commit `7d2c05b` and skipped the soak. Orientation, the empty surface, and the safety gate passed again. For each row the tester held the phone over the card for about 10 seconds. The telemetry window for each row also includes the setup time before the card was in view, so it starts with weak-edge lines.

| Row                      | Tester saw magenta on the outer edge | Refined lines in the row window | Refined aspects |
| ------------------------ | ------------------------------------ | ------------------------------: | --------------- |
| Black-bordered           | yes, no jumping                      |                          2 of 6 | 0.719, 0.721    |
| Borderless               | yes, no jumping                      |                          2 of 7 | 0.727, 0.727    |
| Sleeved                  | yes, no jumping                      |                          2 of 6 | 0.723, 0.720    |
| Foil                     | yes, no jumping                      |                          2 of 6 | 0.713, 0.714    |
| Rotated about 20 degrees | yes, no jumping                      |                          2 of 7 | 0.723, 0.722    |
| Partly off-frame         | none shown                           |                          0 of 7 | none            |
| Patterned surface        | partial, no jumping                  |                          1 of 5 | 0.704           |

Every refined line passed every gate. The partly off-frame card was refused rather than fitted. The patterned surface is the weakest row. The wizard saved the 300-sample window that ended just before the reset tap, so its timing, p95 14.51 ms and max 16.18 ms at 4.56 Hz with no slow streak, covers handheld row presentations rather than a still card. The wizard now waits for the reset and for 300 samples after it.

On an empty surface, document segmentation often returned a quad covering almost the whole frame, with confidence between 0 and 0.57. Refinement then searched the largest window and returned a weak-edge status. The paragraphs below record the earlier trials. Each Apple Vision trial below passed `frame.orientation` to Vision uncorrected, so its alignment observations were made on a 180-degree-rotated analysis frame. Their timing results still stand. Their alignment conclusions need a retest after the orientation correction.

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
