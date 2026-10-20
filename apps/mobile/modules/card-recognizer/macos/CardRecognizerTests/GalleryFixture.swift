@testable import CardRecognizer
import CoreGraphics
import CoreML
import Foundation
import Testing

let fixturePackage = Bundle.module.url(forResource: "fixture-model", withExtension: "mlpackage")!
let compiledFixtureModel = try! MLModel.compileModel(at: fixturePackage)
let fixtureCompiledModel = try! CompiledModel(compiledAt: compiledFixtureModel)
let fixtureModel = FeaturePrintModel(
  name: "fixture-model",
  sha256: try! ModelPackage.sha256(of: fixturePackage),
  inputSize: fixtureCompiledModel.inputSize,
  vectorSize: fixtureCompiledModel.vectorSize
)
let fixtureThresholds = RecognizerThresholds(notACard: 0.689, orientationMargin: 0.03, artMargin: 0.025)

func fixtureGallery(
  printings: [[String: Any]],
  vectors: [Float16],
  version: String? = nil,
  thresholds: RecognizerThresholds = fixtureThresholds,
  inputSize: FeaturePrintModel.InputSize = fixtureModel.inputSize,
  vectorSize: Int = fixtureModel.vectorSize
) throws -> Gallery {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try JSONSerialization.data(withJSONObject: printings).write(to: directory.appendingPathComponent(GalleryFile.printingList))
  let model = FeaturePrintModel(name: fixtureModel.name, sha256: fixtureModel.sha256, inputSize: inputSize, vectorSize: vectorSize)
  try JSONEncoder().encode(
    GalleryHeader(count: printings.count, model: model, thresholds: thresholds, createdAt: "", encoding: nil, version: version)
  ).write(to: directory.appendingPathComponent(GalleryFile.header))
  try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: directory.appendingPathComponent(GalleryFile.float16Vectors))
  try FileManager.default.copyItem(at: compiledFixtureModel, to: directory.appendingPathComponent(GalleryFile.compiledModel))
  return try Gallery(directory: directory)
}

func card(seed: Int) throws -> CGImage {
  let width = CardRecognizer.readWidth
  let height = CardRecognizer.readHeight
  let context = try #require(CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ))
  var value = UInt64(seed)
  func next() -> CGFloat {
    value = value &* 6364136223846793005 &+ 1442695040888963407
    return CGFloat(value >> 40) / CGFloat(1 << 24)
  }
  for _ in 0 ..< 40 {
    context.setFillColor(red: next(), green: next(), blue: next(), alpha: 1)
    context.fill(CGRect(x: next() * CGFloat(width), y: next() * CGFloat(height), width: next() * 600, height: next() * 600))
  }
  return try #require(context.makeImage())
}

func featurePrint(of image: CGImage) throws -> [Float16] {
  try fixtureCompiledModel.featurePrint(of: #require(CardRecognizer.small(image)), inputSize: fixtureModel.inputSize)
    .map { Float16($0) }
}
