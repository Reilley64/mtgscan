#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
temporary_directory="$(mktemp -d /tmp/mtgscan-native-detector.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT

cp "$project_root/test/native/MTGCardQuadDetectorFixture.swift" "$temporary_directory/main.swift"
xcrun swiftc -O \
  -framework CoreImage -framework CoreVideo -framework Vision \
  "$project_root/native/ios/MTGCardQuadGeometry.swift" \
  "$project_root/native/ios/MTGCardEdgeRefiner.swift" \
  "$project_root/native/ios/MTGCardQuadDetector.swift" \
  "$temporary_directory/main.swift" \
  -o "$temporary_directory/MTGCardQuadDetectorFixture"
"$temporary_directory/MTGCardQuadDetectorFixture"
