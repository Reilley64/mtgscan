// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "CardDetector",
  platforms: [.macOS(.v14)],
  targets: [
    .target(name: "CardDetector", path: "ios/Detector"),
    .testTarget(name: "CardDetectorTests", dependencies: ["CardDetector"], path: "macos/CardDetectorTests"),
  ]
)
