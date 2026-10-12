import Foundation
import simd

struct DetectionSample: Sendable {
  static let confidenceMin = 0.5
  static let areaRatios = 0.08 ... 0.9
  static let edgeSupportMin = 0.7

  let detected: Bool
  let corners: [SIMD2<Double>]?
  let proposalCorners: [SIMD2<Double>]?
  let confidence: Double
  let areaRatio: Double
  let aspectRatio: Double
  let edgeSupportMin: Double
  let signature: [Double]
  let captureDevicePoints: [SIMD2<Double>]?
  let frameWidth: Double
  let frameHeight: Double
  let nativeDurationMs: Double
  let sampledAtMs: Double
  let failure: DetectorFailure?

  init(
    output: CardQuadDetector.Output,
    transform: OrientationTransform?,
    nativeDurationMs: Double,
    sampledAtMs: Double
  ) {
    let detected = transform != nil && Self.cardIsPresent(output)
    let corners = detected ? output.refined : nil
    self.detected = detected
    self.corners = corners
    proposalCorners = output.proposal
    confidence = output.confidence
    areaRatio = output.areaRatio
    aspectRatio = output.aspectRatio
    edgeSupportMin = output.edgeSupportMin
    signature = detected ? output.signature : []
    captureDevicePoints = transform.flatMap { transform in
      corners?.map { corner in
        let point = transform.bufferPoint(
          SIMD2(corner.x * transform.orientedWidth, corner.y * transform.orientedHeight)
        )
        return SIMD2(point.x / transform.bufferWidth, point.y / transform.bufferHeight)
      }
    }
    frameWidth = transform?.orientedWidth ?? 0
    frameHeight = transform?.orientedHeight ?? 0
    self.nativeDurationMs = nativeDurationMs
    self.sampledAtMs = sampledAtMs
    failure = output.failure
  }

  init(failure: DetectorFailure, sampledAtMs: Double) {
    var output = CardQuadDetector.Output()
    output.failure = failure
    self.init(output: output, transform: nil, nativeDurationMs: 0, sampledAtMs: sampledAtMs)
  }

  static func cardIsPresent(_ output: CardQuadDetector.Output) -> Bool {
    output.failure == nil
      && output.refined != nil
      && output.confidence >= confidenceMin
      && areaRatios.contains(output.areaRatio)
      && output.edgeSupportMin >= edgeSupportMin
  }

  var record: [String: Any] {
    [
      "detected": detected,
      "corners": Self.quadRecord(corners),
      "proposalDetected": proposalCorners != nil,
      "proposalCorners": Self.quadRecord(proposalCorners),
      "confidence": confidence,
      "areaRatio": areaRatio,
      "aspectRatio": aspectRatio,
      "edgeSupportMin": edgeSupportMin,
      "signature": signature,
      "frameWidth": frameWidth,
      "frameHeight": frameHeight,
      "nativeDurationMs": nativeDurationMs,
      "sampledAtMs": sampledAtMs,
      "runtimeErrorCode": failure?.rawValue ?? NSNull(),
    ]
  }

  private static func quadRecord(_ corners: [SIMD2<Double>]?) -> Any {
    guard let corners else { return NSNull() }
    return corners.map { ["x": $0.x, "y": $0.y] }
  }
}
