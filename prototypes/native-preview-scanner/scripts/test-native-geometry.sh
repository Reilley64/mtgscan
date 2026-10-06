#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
temporary_directory="$(mktemp -d /tmp/mtgscan-native-geometry.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT

cp "$project_root/test/native/MTGCardRectangleGeometryFixture.swift" "$temporary_directory/main.swift"
xcrun swiftc -framework CoreGraphics -framework Vision \
  "$project_root/native/ios/MTGCardRectangleGeometry.swift" \
  "$temporary_directory/main.swift" \
  -o "$temporary_directory/MTGCardRectangleGeometryFixture"
"$temporary_directory/MTGCardRectangleGeometryFixture"
