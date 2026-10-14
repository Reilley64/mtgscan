import CoreGraphics
import Foundation
import Vision

public enum FeaturePrint {
  public static let dimension = 768
  public static let revision = 2
  static let inputWidth = 488
  static let inputHeight = 680

  public enum Failure: Error {
    case noObservation
    case unexpectedVector(Int)
    case unsupportedRevision
  }

  public static func input(of card: CGImage) -> CGImage? {
    CardRectifier.resized(card, width: inputWidth, height: inputHeight)
  }

  public static func vector(ofCardAt url: URL) -> [Float]? {
    guard let card = CardRectifier.loadCard(at: url), let small = input(of: card) else { return nil }
    return try? vector(of: small)
  }

  public static func vector(of image: CGImage) throws -> [Float] {
    guard #available(iOS 17.0, macOS 14.0, *) else { throw Failure.unsupportedRevision }
    let request = VNGenerateImageFeaturePrintRequest()
    request.revision = VNGenerateImageFeaturePrintRequestRevision2
    request.imageCropAndScaleOption = .scaleFill
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    guard let observation = request.results?.first else { throw Failure.noObservation }
    guard observation.elementType == .float, observation.elementCount == dimension else {
      throw Failure.unexpectedVector(observation.elementCount)
    }
    var vector = observation.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
    if norm > 0 { vector = vector.map { $0 / norm } }
    return vector
  }
}
