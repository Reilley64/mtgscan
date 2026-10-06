import CoreGraphics
import Foundation
import Vision

enum MTGCardEmbedder {
  static let dimension = 768

  enum Failure: Error {
    case noObservation
    case unexpectedVector(Int)
  }

  static func featurePrint(of image: CGImage) throws -> [Float] {
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
