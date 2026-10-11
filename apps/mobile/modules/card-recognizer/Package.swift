// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "CardRecognizer",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "card-recognizer", targets: ["CardRecognizerCommand"]),
  ],
  targets: [
    .target(name: "CardRecognizer", path: "ios/Recognizer"),
    .executableTarget(name: "CardRecognizerCommand", dependencies: ["CardRecognizer"], path: "macos/CardRecognizerCommand"),
    .testTarget(name: "CardRecognizerTests", dependencies: ["CardRecognizer"], path: "macos/CardRecognizerTests"),
  ]
)
