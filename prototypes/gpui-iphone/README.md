# iPhone GPUI proof

Part of [MTGSCAN-274](https://app.plane.so/reilley/browse/MTGSCAN-274/).
This is a bounded feasibility proof. It is not the replacement app.
The gate remains unmet until all manual checks pass. Do not start conversion work from an installation, launch, or accessibility-tree snapshot alone.

## Scope

```text
Swift main
  GPUI application and camera toggle
    CameraProof presentation state
    proof-specific accessibility element for that same toggle
  native scroll view
    existing CameraSession and card detector
    existing CardRecognizer and gallery reader
    native text field and recognition/request controls
```

`prepare.py` references the existing Swift sources directly. It does not copy or rewrite scanner algorithms.
It takes the libwebp revision from the recognizer's existing `Package.resolved`.
A captured test photo is removed after recognition. Training crops stay in the isolated test app cache. Nothing uploads them.
The proof does not modify or reset a gallery.

The accessibility element represents the actual GPUI camera button. GPUI supplies its bounds and label. Activation enters the same controller action as a touch. It reports running/stopped state. This is one proof-specific element, not a general GPUI accessibility backend.
The native content has a declared focus order. Disabled recognition stays disabled until the real detector finds a card. A visible camera status shares the preview's accessibility value. A device without a back camera reports **Camera unavailable** and never enables recognition. This still needs a spoken VoiceOver and double-tap acceptance check.

## Build locally

Read `docs/agents/local-development.md` first. Hold `/tmp/mtgscan-device.lock` for every build and device command. Never replace the production bundle.
Use the existing Xcode whose actual version is 27.1. On the tested Mac it is `/Applications/Xcode.app/Contents/Developer`. The documented versioned alternate path is absent. Do not change `xcode-select`.

Rust comes only from the root `mise.toml`. Run `mise install` and `mise run rust-components` from the repository root. Do not copy upstream's toolchain file into this project. The proof has no container consumer or separate Rust version pin.

Use upstream Zed revision `42fa909546bf85d92f3ddeac0690e4ca69776cc7` in an external source directory, not in this repo. Keep its lockfile. `prepare.py` adds only a static-library example to that external source. The upstream source must be intact apart from this example. `$UPSTREAM` and `$BUILD` below are absolute external paths.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
python3 prototypes/gpui-iphone/prepare.py "$UPSTREAM" "$BUILD"
IPHONEOS_DEPLOYMENT_TARGET=17.0 CARGO_TARGET_DIR="$BUILD/rust" CARGO_PROFILE_DEV_DEBUG=0 \
  mise exec -- cargo build --locked --manifest-path "$UPSTREAM/Cargo.toml" \
  -p gpui_ios --example mtgscan_gate --target aarch64-apple-ios --features runtime_shaders
xcodebuild -project "$BUILD/GPUIProof.xcodeproj" -scheme GPUIProof \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD/derived" build
```

To build the same proof for an existing selected Simulator, use `--simulator` with `prepare.py`, the Rust target `aarch64-apple-ios-sim`, and the Xcode destination `platform=iOS Simulator,id=<selected-udid>`. Pass `CODE_SIGNING_ALLOWED=NO` for the Simulator build. Do not create or erase a Simulator. Camera capture and recognition are unavailable there. Text, scrolling, keyboard handling and the bounded GPUI action remain testable.

The iOS Rust standard library must be installed for the version selected by Mise. The supported `runtime_shaders` feature avoids the missing local Metal compiler component. It compiles bundled shader source, not downloaded executable code.

The generated project has only `dev.reilley.mtgscan.test`. It uses the existing development team and test-app profile. It has no credential resource or production signing target. Verify the bundle identifier and signature before installing with `devicectl`.
This development path does not prove App Store distribution. A local archive is not an upload or a TestFlight release. Do not export or publish without the required approval.

## Test session

The native **Check test session** control reads `Documents/gpui-proof-session.json` once, removes the file, and sends an HTTPS authenticated `/auth/v1/user` request. It accepts only the existing hosted test-user account. The request uses an ephemeral URLSession. The token is not retained or logged. No password, refresh token, or server key enters the app.

Use the existing hosted test-app configuration outside the repo to obtain a short-lived test-user session. Never use owner credentials or seed/reset hosted data. Write only the URL, publishable key, and access token into a mode-0600 temporary file with these JSON keys: `url`, `publishableKey`, `accessToken`. Copy it into that exact file in the isolated test app's data container. Delete the host file immediately. Do not put its contents in command arguments, logs, source, or a PR. Tap the control promptly. If it is not consumed, remove the test session file before ending the device session.

## Checks and evidence limits

```sh
mise exec -- rustfmt --edition 2024 --check prototypes/gpui-iphone/gate.rs prototypes/gpui-iphone/camera_proof.rs
mise exec -- rustc --edition 2024 --deny warnings --test prototypes/gpui-iphone/camera_proof.rs -o /tmp/camera-proof-unit
/tmp/camera-proof-unit
xcrun swift-format lint --strict prototypes/gpui-iphone/*.swift
xcrun swiftc prototypes/gpui-iphone/camera_status.swift prototypes/gpui-iphone/camera_status_test.swift -o /tmp/camera-status-unit
/tmp/camera-status-unit
```

The unit seams check foreground intent, running-state output, and unavailable/failed/detected camera presentation. They do not prove an AVCaptureSession or a native bridge. CI reads Rust from Mise and checks its unit seam and formatting. The native presentation unit checks use the same Xcode selection as the existing recognizer workflow. It adds no integration or E2E suite. Swift compilation, linking, signing, and the physical checks are local evidence. Legacy checks remain unchanged.

Record each manual result separately:

- Signed physical run and tested GPUI/device/Xcode revisions.
- Native preview with GPUI touch control, safe areas, text entry, and keyboard avoidance.
- Background/foreground recovery with live camera frames and retained text.
- Authenticated test-user request with no server credential in the app.
- Real-card recognition using the existing gallery and crop encoder.
- VoiceOver focus order, labels, running/disabled states, and activation of the actual proof actions and content.
- Larger system text, readable content, scrolling, and touch targets of at least 44 pt.
- Intended distribution path, with archive/export/validation limits stated explicitly.

A missing owner check or platform capability is an unmet requirement. Report it and stop conversion. Never treat source support or an accessibility-tree entry as spoken VoiceOver acceptance.
