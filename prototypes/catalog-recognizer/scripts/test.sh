#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
temporary_directory="$(mktemp -d /tmp/mtgscan-catalog-recognizer.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT

cp "$project_root/test/RecognizerFixture.swift" "$temporary_directory/main.swift"
xcrun swiftc -O \
  -framework Accelerate -framework CoreImage -framework Vision \
  "$project_root"/native/*.swift \
  "$temporary_directory/main.swift" \
  -o "$temporary_directory/RecognizerFixture"
"$temporary_directory/RecognizerFixture"
