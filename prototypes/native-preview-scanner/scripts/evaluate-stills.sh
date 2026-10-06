#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <output-directory> <image>..." >&2
  exit 2
fi

project_root="$(cd "$(dirname "$0")/.." && pwd)"
temporary_directory="$(mktemp -d /tmp/mtgscan-evaluate-stills.XXXXXX)"
trap 'rm -rf "$temporary_directory"' EXIT

cp "$project_root/test/native/EvaluateStills.swift" "$temporary_directory/main.swift"
xcrun swiftc -O \
  -framework CoreVideo -framework Vision -framework UniformTypeIdentifiers \
  "$project_root/native/ios/MTGCardQuadGeometry.swift" \
  "$project_root/native/ios/MTGCardEdgeRefiner.swift" \
  "$project_root/native/ios/MTGCardQuadDetector.swift" \
  "$temporary_directory/main.swift" \
  -o "$temporary_directory/evaluate-stills"
"$temporary_directory/evaluate-stills" "$@"
