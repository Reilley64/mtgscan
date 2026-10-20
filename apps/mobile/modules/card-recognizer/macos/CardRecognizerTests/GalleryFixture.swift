@testable import CardRecognizer
import CoreGraphics
import Foundation
import Testing

func fixtureGallery(
  printings: [[String: Any]],
  vectors: [Float16],
  version: String? = nil,
  thresholds: RecognizerThresholds = FeaturePrint.thresholds,
  vectorSize: Int = FeaturePrint.dimension
) throws -> Gallery {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try JSONSerialization.data(withJSONObject: printings).write(to: directory.appendingPathComponent(GalleryFile.printingList))
  let model = FeaturePrintModel(
    name: FeaturePrint.model.name, sha256: nil, inputSize: FeaturePrint.model.inputSize, vectorSize: vectorSize
  )
  try JSONEncoder().encode(
    GalleryHeader(count: printings.count, model: model, thresholds: thresholds, createdAt: "", encoding: nil, version: version)
  ).write(to: directory.appendingPathComponent(GalleryFile.header))
  try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: directory.appendingPathComponent(GalleryFile.float16Vectors))
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
  try FeaturePrint.vector(of: #require(FeaturePrint.input(of: image))).map { Float16($0) }
}
