#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
output="${1:-$project_root/.build/mtg-catalog-recognizer}"
mkdir -p "$(dirname "$output")"
xcrun swiftc -O \
  -framework Accelerate -framework CoreImage -framework Vision \
  "$project_root"/native/*.swift \
  "$project_root/cli/main.swift" \
  -o "$output"
echo "$output"
