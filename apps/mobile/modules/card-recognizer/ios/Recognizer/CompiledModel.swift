import CoreGraphics
import CoreML
import Foundation

public final class CompiledModel: @unchecked Sendable {
  static let input = "pixels"
  static let output = "featurePrint"
  static let meanColor: Float16 = 0.5

  public enum Failure: Error {
    case unexpectedModel
    case unreadableImage
    case noFeaturePrint
    case notFinite
  }

  public let inputSize: FeaturePrintModel.InputSize
  public let vectorSize: Int
  private let model: MLModel
  private let lock = NSLock()

  public init(compiledAt url: URL) throws {
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    model = try MLModel(contentsOf: url, configuration: configuration)
    guard let input = model.modelDescription.inputDescriptionsByName[Self.input]?.multiArrayConstraint?.shape,
          input.count == 4,
          let output = model.modelDescription.outputDescriptionsByName[Self.output]?.multiArrayConstraint?.shape
    else { throw Failure.unexpectedModel }
    inputSize = .init(width: input[3].intValue, height: input[2].intValue)
    vectorSize = output.reduce(1) { $0 * $1.intValue }
  }

  public convenience init(at url: URL) throws {
    try self.init(compiledAt: url.pathExtension == "mlmodelc" ? url : MLModel.compileModel(at: url))
  }

  public func featurePrint(ofCardAt url: URL, inputSize: FeaturePrintModel.InputSize) throws -> [Float] {
    guard let card = CardRectifier.loadCard(at: url), let small = CardRecognizer.small(card) else {
      throw Failure.unreadableImage
    }
    return try featurePrint(of: small, inputSize: inputSize)
  }

  public func featurePrint(of card: CGImage, inputSize: FeaturePrintModel.InputSize) throws -> [Float] {
    let pixels = try Self.pixels(of: card, size: inputSize)
    let output = try lock.withLock {
      try model.prediction(from: MLDictionaryFeatureProvider(dictionary: [Self.input: pixels]))
    }
    guard let featurePrint = output.featureValue(for: Self.output)?.multiArrayValue, featurePrint.dataType == .float16 else {
      throw Failure.noFeaturePrint
    }
    let values = featurePrint.dataPointer.bindMemory(to: Float16.self, capacity: featurePrint.count)
    let stride = featurePrint.strides.last?.intValue ?? 1
    let vector = (0 ..< featurePrint.count).map { Float(values[$0 * stride]) }
    let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
    guard norm.isFinite, norm > 0 else { throw Failure.notFinite }
    return vector.map { $0 / norm }
  }

  static func pixels(of card: CGImage, size: FeaturePrintModel.InputSize) throws -> MLMultiArray {
    let scale = min(Double(size.width) / Double(card.width), Double(size.height) / Double(card.height))
    let width = max(1, Int((Double(card.width) * scale).rounded()))
    let height = max(1, Int((Double(card.height) * scale).rounded()))
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    let drawn = rgba.withUnsafeMutableBytes { buffer -> Bool in
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let context = CGContext(
              data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
              space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            )
      else { return false }
      context.interpolationQuality = .high
      context.draw(card, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { throw Failure.unreadableImage }
    let pixels = try MLMultiArray(
      shape: [1, 3, NSNumber(value: size.height), NSNumber(value: size.width)],
      dataType: .float16
    )
    let left = (size.width - width) / 2
    let top = (size.height - height) / 2
    let strides = pixels.strides.map(\.intValue)
    let values = pixels.dataPointer.bindMemory(to: Float16.self, capacity: strides[0])
    values.update(repeating: meanColor, count: strides[0])
    for y in 0 ..< height {
      for x in 0 ..< width {
        let source = (y * width + x) * 4
        let target = (top + y) * strides[2] + (left + x) * strides[3]
        for component in 0 ..< 3 {
          values[component * strides[1] + target] = Float16(Float(rgba[source + component]) / 255)
        }
      }
    }
    return pixels
  }
}
