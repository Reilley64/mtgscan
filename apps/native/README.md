# Native account, collection and deck presentation

Part of [MTGSCAN-275](https://app.plane.so/reilley/browse/MTGSCAN-275/) and [MTGSCAN-276](https://app.plane.so/reilley/browse/MTGSCAN-276/).
The signed-in shell opens collection browse and the read-only copy page. MTGSCAN-288 adds Decks navigation, deck contents, creation, renaming and advisory priority. It is not the scanner replacement.
[Deck API and limits](../../docs/deck-api.md) describe this bounded slice and its pending native and SQL gates.
[Collection API and limits](../../docs/collection-api.md) describe the new read path and the later slices.
MTGSCAN-274 passed under separate owner acceptance. Its historical stop reports do not re-block this slice.

```text
GPUI window and Atomic Design page
  native authentication organism
    Apple AuthenticationServices / GoogleSignIn 9.0.0
    Supabase Auth ID-token exchange
    isolated keychain session, rotation, foreground refresh and sign-out
    GET /api/v1/account
      API presentation -> application current_account -> domain caller policy
        identity infrastructure -> trusted Supabase Auth /auth/v1/user
```

Mobile never links the backend application. Collection presentation calls the versioned API with the existing secure session.
The backend uses Axum, a narrow Reqwest Auth adapter, and a direct SQLx Postgres read adapter under the dedicated collection reader role.
Database credentials remain server-side. Deck presentation calls the same backend application through its versioned API. No MCP framework is initialized here.

## Checks

Run from the repository root. Mise is the only project tool-version source.
Read `docs/agents/local-development.md` before native builds or device use.

```sh
mise install
mise run rust-components
mise exec -- bun install --frozen-lockfile
mise run rust-check
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer mise run native-unit
```

The Swift unit executable includes real session, collection and deck controllers with fake external provider, keychain, Auth, API and clock capabilities.
It also generates symbols, labels, sheen stops and aspect ratio from the existing mobile sources.
The collection checks include copy metadata, account changes, sign-out, late replies, refusal, failure, empty state and retry.
The Rust tests run real API mapping, application and domain behavior. Identity tests substitute the trusted remote Auth capability.
They make no network requests. They cannot establish real provider configuration, keychain behavior, session revocation or native bridge behavior.
CI retains all legacy checks and adds scoped Rust and native session unit checks.

## Build the isolated app

Hold `/tmp/mtgscan-device.lock` for the entire build and device session.
Discover the owner's existing selected iPhone 17 with the T3 device tools. Do not create or erase a Simulator.
The actual local Xcode 27.1 is `/Applications/Xcode.app`. Use its explicit `DEVELOPER_DIR`; do not change `xcode-select`.

`prepare.py` fetches GPUI at the revision and checksum in `gpui.json`.
It keeps source in `~/Library/Caches/mtgscan/gpui`, not a previous agent's `/tmp` checkout.
The upstream lockfile is retained. Rust still comes from root Mise.
Generated native tokens come from the existing app theme, not a second palette.
The Mana font is embedded. `scripts/native-presentation-data.ts` generates symbol meanings, glyphs and copy labels from the existing mobile definitions.
GoogleSignIn uses an exact SPM version and the checked-in transitive resolution.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
BUILD=/tmp/mtgscan-native-build
mise run native-prepare -- --build "$BUILD" --simulator
UPSTREAM=$(python3 -c 'import pathlib,sys; print((pathlib.Path(sys.argv[1]) / "upstream-path").read_text())' "$BUILD")
mise exec -- rustup target add aarch64-apple-ios-sim
IPHONEOS_DEPLOYMENT_TARGET=17.0 CARGO_TARGET_DIR="$BUILD/rust" CARGO_PROFILE_DEV_DEBUG=0 \
  mise exec -- cargo build --locked --manifest-path "$UPSTREAM/Cargo.toml" \
  -p gpui_ios --example mtgscan_mobile --target aarch64-apple-ios-sim --features runtime_shaders
mise exec -- xcodebuild -onlyUsePackageVersionsFromResolvedFile -project "$BUILD/MTGScanNative.xcodeproj" -scheme MTGScanNative \
  -destination 'platform=iOS Simulator,id=<discovered-owner-selected-id>' \
  -derivedDataPath "$BUILD/derived" CODE_SIGNING_ALLOWED=NO build
```

The bundle is always `dev.reilley.mtgscan.test`. Never replace the production app.
Only this isolated test shell disables the idle timer while active in the foreground.
It restores normal idle behavior when it resigns active or enters the background.
It does not change the device Auto-Lock setting or affect the production bundle.
For an approved physical test, omit `--simulator`, use target `aarch64-apple-ios` and the matching device destination with development signing.
There is no export, upload, distribution or deployment step.
After device work, restore changed settings, close the device with shutdown, remove generated build folders and release only your device lock.
The downloaded upstream dependency cache may remain for later reproducible builds.

## Configure native providers

Without a public configuration resource the shell shows both native provider controls disabled and explains the missing configuration.
It does not substitute a password form or silently call production endpoints.

Copy `PublicConfiguration.example.json` to an ignored local `PublicConfiguration.json`, or supply an external file.
Use `--config /absolute/path/PublicConfiguration.json` with `native-prepare`.
Only the five documented public fields are packaged.
Use HTTPS origins and a modern `sb_publishable_` key. No password, signing secret, service key or database URL belongs here.
The API origin must actually serve the versioned Rust route. This ticket does not deploy it.

The isolated app needs its own Google iOS OAuth client for `dev.reilley.mtgscan.test`.
Set its ID as `googleIOSClientID` and the existing approved server/web client as `googleServerClientID`.
The generated Info.plist registers the reversed iOS client ID.
The Google callback reaches the SDK through GPUI's open-URL callback.
Supabase must allow that native client ID for ID-token exchange.
Apple uses a secure random raw nonce and passes its SHA-256 to AuthenticationServices. Supabase receives the raw nonce.
Enable Sign in with Apple for the isolated App ID and include that bundle ID in the approved Supabase Apple audience configuration before physical provider acceptance.

Only the owner completes real Apple/Google provider consent and credentials.
Do not reuse owner sessions or reset hosted data.
Manual acceptance must check both providers, cancellation, current-account success, restart, expiry/refresh, foreground recovery, sign-out, text scaling and VoiceOver.
The prior feasibility gate is not proof of this slice's native-provider behavior.

## Session policy

The app uses an ephemeral, no-redirect URLSession. Tokens never enter logs or UserDefaults.
The isolated keychain item is non-synchronizing and `WhenUnlockedThisDeviceOnly`.
A successful exchange or refresh is persisted before showing an account.
Refresh tokens rotate in that same item. Refresh occurs within 60 seconds of expiry, on foreground and while active.
A transient failure retains the saved session for retry but hides account output. The user must retry or sign out before starting another provider sign-in.
An invalid session removes the local credential. Sign-out clears account state immediately and deletes the keychain item before best-effort local-session server revocation.
If deletion fails, the shell blocks another sign-in and offers sign-out retry.
Generation checks prevent a late request from restoring a signed-out account.

## Primary documentation

- [Supabase native ID-token exchange](https://supabase.com/docs/reference/swift/auth-signinwithidtoken)
- [Supabase trusted getUser verification](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Auth signature and session verification](https://github.com/supabase/auth/blob/master/internal/api/auth.go)
- [Auth user endpoint and audience check](https://github.com/supabase/auth/blob/master/internal/api/user.go)
- [Google native sign-in and callbacks](https://developers.google.com/identity/sign-in/ios/sign-in)
- [Apple request and nonce](https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidrequest)
- [Device-only keychain access](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)
- [Pinned GPUI iOS platform](https://github.com/zed-industries/zed/tree/42fa909546bf85d92f3ddeac0690e4ca69776cc7/crates/gpui_ios)
