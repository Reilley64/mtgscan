# Native preview scanner prototype

**Throwaway Wayfinder prototype.** This isolated Expo development-build app asks one question: can a VisionCamera V4 frame processor detect a centered, sharp, stable card and take exactly one high-resolution still without duplicate captures?

It validates automatic capture only. It does not recognize a card, change a collection, choose production architecture, or test guided tilt. Delete or replace this prototype after the trial.

## Trial boundary

The app uses a centered guide at 72% of preview width and the Magic card ratio, 63:88. Its analysis crop includes an 8% outside margin. At 5 fps, the frame processor converts that crop from the camera's YUV stream to a 96-pixel-short-edge ARGB `Uint8Array`. It computes bounded scalar metrics for expected-border energy and continuity, centering, interior variance, sharpness, motion, and processing time.

All gates must pass for 400 ms. A worklet shared value locks capture before `Worklets.createRunOnJS` asks JavaScript to call `takePhoto()`. A second JavaScript guard protects the camera call. Cooldown stays locked until a conservative departure gate sees both low border continuity and low crop variance for 400 ms, or the tester taps **Manual reset**. Moving the card off-center does not unlock capture by itself. No `Frame` leaves the frame processor.

The thresholds in `src/capture/config.ts` are guesses for the physical trial. Do not treat them as production settings.

## Exact dependency trial

| Package                       | Requested range or version | Installed resolution |
| ----------------------------- | -------------------------: | -------------------: |
| Expo SDK                      |                 `~54.0.37` |            `54.0.37` |
| React Native                  |                   `0.81.5` |             `0.81.5` |
| React                         |                   `19.1.0` |             `19.1.0` |
| `react-native-vision-camera`  |                    `4.7.3` |              `4.7.3` |
| `react-native-worklets-core`  |                    `1.6.3` |              `1.6.3` |
| `vision-camera-resize-plugin` |                    `3.2.0` |              `3.2.0` |
| `expo-dev-client`             |                  `~6.0.21` |             `6.0.21` |

`package.json` and `package-lock.json` belong only to this directory. The iOS bundle ID is `com.reilley.mtgscan.nativepreviewspike`.

`app.json` uses the VisionCamera V4 config plugin with microphone and location disabled and frame processors enabled. VisionCamera V4.7.3 has no config-plugin option for video. The `<Camera>` disables both `video` and `audio` and enables `photo`. The app never asks for microphone permission.

This app requires a native development build. It does not run in Expo Go because Expo Go does not contain these native packages.

## Install and static checks

Use Node.js 22 or later. From this directory:

```bash
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npx expo-doctor
npx expo config --type public
npx expo export --platform ios --output-dir /tmp/native-preview-scanner-export
```

The install currently reports transitive npm audit findings in the Expo and React Native development dependency tree. Do not run `npm audit fix --force`; that would change the fixed trial.

`react-native-worklets-core@1.6.3` calls three Babel 7 plugins from its own Babel plugin but does not declare them. The first bundle attempt failed on `@babel/plugin-proposal-optional-chaining`; checking all internal plugin names also found the nullish-coalescing and template-literal plugins missing. The exact Babel 7 compatibility packages are pinned in `devDependencies`. No camera package or Expo version changed.

## Generate and compile iOS locally

Keep an existing `DEVELOPER_DIR`. If it is unset, use the active Xcode path:

```bash
if [ -z "${DEVELOPER_DIR:-}" ]; then
  if [ -d /Applications/Xcode.app/Contents/Developer ]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  else
    export DEVELOPER_DIR="$(xcode-select -p)"
  fi
fi

npx expo prebuild --platform ios
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

The simulator build is only a compile gate. A simulator cannot validate the camera, YUV frame delivery, crop alignment, automatic focus, still resolution, timing, or thermal behavior. Generated `ios/`, `android/`, `.expo/`, `build/`, and related output are ignored. This prototype has no hand-written Swift or Kotlin.

## Physical iPhone procedure

Do not use credentials or install a device build as part of the automated checks. A human tester performs these steps:

1. Connect an iPhone by cable. Trust the computer and enable Developer Mode if iOS requests it.
2. Open `ios/MTGScanNativePreviewSpike.xcworkspace` in the Xcode selected by `DEVELOPER_DIR`.
3. Select the app target. Choose the tester's development team and the connected iPhone. Let Xcode manage signing for the unique bundle ID.
4. Build and run from Xcode. Start Metro in a separate shell with the same `DEVELOPER_DIR` and `npm start`.
5. Grant camera permission. Confirm that the format line shows a YUV preview resolution and a high photo resolution. Compare it with the `Selected native preview format` console log.
6. Keep the phone in portrait. Fill the guide with one card. Do not tilt the card as a guided action.
7. After each capture, record the status, metrics, timing, photo dimensions, and path before removing the card.

The phone must prove the central crop matches the guide. A consistent offset or scale error kills this approach even if synthetic tests pass.

## Telemetry record

For every presentation, record:

- device and iOS version;
- selected preview resolution, photo resolution, and camera fps;
- lighting, card, sleeve, and foil state;
- final values for border energy, border continuity, interior variance, center score, sharpness, motion, and processing time;
- phase order and time from the first all-pass sample to capture;
- number of stills, photo dimensions, and whether departure returned the app to seeking;
- any dropped preview, frame-processor error, camera error, thermal warning, or UI stall.

Use an external counter or Xcode log to confirm the still count. A displayed last path alone does not prove there was no second camera call.

## Ten-presentation matrix

Run each row once. Remove the card until the app returns to seeking before the next positive row.

|   # | Presentation                                                           | Expected result     |
| --: | ---------------------------------------------------------------------- | ------------------- |
|   1 | Empty guide for 10 seconds                                             | No capture          |
|   2 | Card held at least 15% guide-width left of center for 10 seconds       | No capture          |
|   3 | Centered card moving continuously for 10 seconds                       | No capture          |
|   4 | Centered card held closer than the camera can focus for 10 seconds     | No capture          |
|   5 | Centered card with more than one edge outside the guide for 10 seconds | No capture          |
|   6 | Unsleeved nonfoil card, diffuse light, centered and still              | Exactly one capture |
|   7 | A different unsleeved card after full departure reset                  | Exactly one capture |
|   8 | Clear-sleeved card, diffuse light, centered and still                  | Exactly one capture |
|   9 | Foil card, diffuse light, centered and still                           | Exactly one capture |
|  10 | Nonfoil card, normal warm indoor light, centered and still             | Exactly one capture |

For positive rows, leave the card in place for another 10 seconds after capture. The count must remain one. For negative rows, note which gate prevented capture.

## Fifteen-minute soak

Run on the physical iPhone with the Xcode console visible:

1. Present a valid card for 20 seconds, then remove it for 5 seconds.
2. Repeat with at least three cards, one clear sleeve, and one foil until 15 minutes pass.
3. Keep each card in place long enough to test cooldown. Confirm one still per presentation.
4. Every minute, note processing-time p50 and worst observed value, preview responsiveness, thermal state or warning, error count, capture count, and reset count.
5. End with an empty guide. Confirm the app is seeking and still responds to **Manual reset**.

## Acceptance and kill gates

Accept this capture technique for a later experiment only if all of these hold:

- install, static checks, prebuild, Pods, and the unsigned simulator compile gate pass on the fixed versions;
- the guide and analysis crop align on the physical phone;
- all five negative rows produce zero stills;
- every positive row produces exactly one still, at least 400 ms after all gates first pass;
- each positive row stays at one still while the card remains present;
- departure restores seeking and allows exactly one still for the next card;
- the selected photo output is the logged high or maximum resolution supported by the negotiated format;
- preview analysis stays below 20 ms p95 at 5 fps, with no visible preview stall;
- the 15-minute soak has no crash, stuck state, duplicate still, or thermal warning.

Kill this technique or stop the trial if the fixed V4 packages cannot compile together, the resize plugin cannot process the YUV crop, guide alignment is materially wrong, any negative row captures, any presentation produces a duplicate, processing exceeds 100 ms repeatedly, the app crashes, or the camera session enters a state that manual reset cannot recover. Report the exact V4 API, Pod, or Xcode blocker. Do not switch to VisionCamera V5 or another Expo SDK inside this trial.

## Local validation result

The automated run on 2026-08-31 used Xcode 26.3 with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` because the shell did not already define `DEVELOPER_DIR`.

- A clean `npm ci` added 888 packages and audited 889. It reported 19 transitive findings, 10 moderate and 9 high.
- Prettier, Expo ESLint, strict TypeScript, and all 8 deterministic Vitest cases passed.
- `expo-doctor` passed 18 of 18 checks.
- Expo public config reported SDK `54.0.0`, only camera permission, frame processors enabled, and the expected unique bundle ID.
- `expo prebuild --platform ios` passed. `pod install` installed 84 Pods from 85 dependency declarations and confirmed VisionCamera frame processors plus Worklets Core.
- The iOS Expo export produced a 1.83 MB Hermes bundle after the Babel compatibility dependencies were added.
- Unsigned `xcodebuild` for generic iOS Simulator completed with `** BUILD SUCCEEDED **`. Dependency headers emitted warnings, but no compile error occurred.

No credentials, device installation, or physical camera run was attempted.

## Platform claims

Only an iPhone physical run can validate the experiment. The generated iOS simulator build is a compile check. Android is not built, run, or claimed. Recognition accuracy is not measured here.
