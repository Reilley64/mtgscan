// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "CardDetector",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "card-detector", targets: ["CardDetectorCommand"]),
  ],
  targets: [
    .target(name: "CardDetector", path: "ios/Detector"),
    .executableTarget(name: "CardDetectorCommand", dependencies: ["CardDetector"], path: "macos/CardDetectorCommand"),
    .testTarget(
      name: "CardDetectorTests",
      dependencies: ["CardDetector"],
      path: "macos/CardDetectorTests",
      resources: [.copy("Fixtures")]
    ),
  ]
)
