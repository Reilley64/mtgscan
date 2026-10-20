// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "CardRecognizer",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "card-recognizer", targets: ["CardRecognizerCommand"]),
  ],
  dependencies: [
    .package(url: "https://github.com/SDWebImage/libwebp-Xcode.git", exact: "1.1.0"),
  ],
  targets: [
    .target(name: "CardRecognizer", dependencies: [.product(name: "libwebp", package: "libwebp-Xcode")], path: "ios/Recognizer"),
    .executableTarget(name: "CardRecognizerCommand", dependencies: ["CardRecognizer"], path: "macos/CardRecognizerCommand"),
    .testTarget(
      name: "CardRecognizerTests", dependencies: ["CardRecognizer"], path: "macos/CardRecognizerTests",
      resources: [.copy("Fixtures/fixture-model.mlpackage")]
    ),
  ]
)
