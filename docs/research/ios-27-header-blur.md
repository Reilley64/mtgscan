# The header blur on iOS 27

Research notes for the header blur on Decks, Collection, the deck screen, and the copy page. Date: 2026-10-20.

The question: on the owner's iPhone (iOS 27.0.1), Decks shows a solid shelf behind its header when scrolled, Collection does not, and a test build that set the top scroll edge effect to `soft` showed no blur at all. Our builds use Xcode 26.3 (iOS 26 SDK), Expo SDK 56, and react-native-screens 4.26.2.

## Findings

### 1. iOS 27 makes the hard edge the default, for every app

- The default scroll edge effect changed from the soft gradient blur of iOS 26 to a "hard" blur with a bottom border, like iOS 18. Setting `.soft` makes it look more like iOS 26 again. Source: https://designfornative.com/what-designers-need-to-know-about-ios-27/
- The change applies system-wide, including apps built with earlier SDKs. Source: Ryan Ashcraft, https://mastodon.social/@ryanashcraft/116882397551356135 (summary in search results; the page needs JavaScript).
- react-native-screens defines the styles the same way: `hard` is "a scroll edge effect with a hard cutoff and dividing line", `soft` is "a soft-edged scroll edge effect", and every edge defaults to `automatic`. Source: react-native-screens `guides/GUIDE_FOR_LIBRARY_AUTHORS.md` (via Context7, `/software-mansion/react-native-screens`).

Our tab headers (Recent, Collection, Decks, Sets) leave the top edge at `automatic`. On iOS 27 that is the hard edge: the shelf on Decks. We did not find why Collection does not show it; its header holds a stacked search bar, which is the only difference in its header setup (see `tab-screen.tsx`).

### 2. `soft` only covers the status bar when the app is built with the iOS 26 SDK

- react-native-screens issue #4776, "[iOS 27] Transparent native-stack header: scroll edge effect only covers the status bar". The maintainer closed it as not a react-native-screens bug: a build with Xcode 27 and the iOS 27 SDK gets "the full soft edge under the whole header on iOS 27", while a build with Xcode 26.6 and the iOS 26.5 SDK "on the iOS 27 runtime … gets the reduced soft edge; on iOS 26.5 it's fine. So the difference comes from the SDK the app is linked against, and building with the iOS 27 SDK … is the fix." A commenter saw the same: the automatic hard edge covered the whole header, and forcing `soft` covered only the status bar. Source: https://github.com/software-mansion/react-native-screens/issues/4776

This matches both builds on the owner's phone:

- The test build set the tab headers to `soft`, so on iOS 27 the blur shrank to the status bar, which reads as "no blur at all".
- The deck screen and the copy page already set `top: 'soft'` (`app/_layout.tsx`), so on iOS 27 they also blur only the status bar, whatever #455 does. #455 still fixes the iOS 26 case, where an adjusted top inset of exactly 0 drops the header part of the effect.

### 3. Building with the iOS 27 SDK needs Xcode 27, macOS Tahoe 26.6, and a newer Expo SDK

- Xcode 27 requires macOS Tahoe 26.6 or later. Source: https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes and https://developer.apple.com/xcode/system-requirements/
- "Apps built with the latest SDK must adopt the scene-based life cycle or they fail to launch." Source: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes (Deprecations)
- An unmodified Expo SDK 56 app built with Xcode 27 fails at launch with "UIScene life cycle is required for apps built with this SDK". Expo closed the issue with an opt-in for SDK 57 (`expo-build-properties` `ios.enableSceneSupport: true`, needs `expo@57.0.23` or newer); SDK 58 has scene support by default. Sources: https://github.com/expo/expo/issues/46664 and https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md
- Our Mac runs macOS 15.7.3 and Xcode 26.3. The app is now on Expo SDK 58 (`expo` 58.0.16), whose `expo prebuild` generates `SceneDelegate.swift` and a `UIApplicationSceneManifest` entry. A Release build of it succeeds on Xcode 26.3.

### 4. Related react-native-screens changes

- 4.30.0 (2026-10-13) "focuses on iOS 27 and iPhone Duo support in Stack v4". It recommends transparent headers on iOS 26+ and makes `useHeaderHeight` report the minimized header height on iOS 27. Source: https://swmansion.com/changelog/react-native-screens-4-30-0/
- Issue #4369: Stack v4 applies `scrollEdgeEffects` only to a scroll view on the first-subview chain; the maintainers point to the experimental `ScrollViewMarker` for other cases. Source: https://github.com/software-mansion/react-native-screens/issues/4369
- Open PR #4849, "Use UIKit's scroll edge appearance when no header background is set". Source: https://github.com/software-mansion/react-native-screens/pull/4849

## What this means for the app

| Goal on iOS 27 | What it takes |
|---|---|
| Keep Apple's new default (hard edge with a line) on every header | Set the top edge to `hard` on the deck screen, the copy page, and the user tag picker, or leave it `automatic` there. Works with the current Xcode 26.3 build. Collection may still look different. |
| The iOS 26 soft blur under every header | Set the top edge to `soft` everywhere **and** build with the iOS 27 SDK: macOS Tahoe 26.6+ and Xcode 27. The app's Expo SDK 58 already has the scene life cycle. |

Not verified here: how a `soft` build with the iOS 27 SDK looks on the owner's phone, and why Collection shows no shelf. Both need an iOS 27 device or Simulator with Xcode 27.

## Why the app was on Expo SDK 56

- `README.md` (Versions) and PR #36 pinned SDK 56 because SDK 57 did not build on Xcode 26.3 (Swift 6.2): `expo-modules-jsi` 57.0.5 and later failed to compile. Issue: https://github.com/expo/expo/issues/50067
- `expo-modules-jsi` 57.1.2 (2026-10-12) fixed both failures in source. SDK 58 ships `expo-modules-core` 58.0.23 as a prebuilt xcframework.
- The app moved straight to SDK 58 (`expo` 58.0.16, React Native 0.88.0). Its Release build succeeds on Xcode 26.3.
