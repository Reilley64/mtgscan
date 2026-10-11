import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd
import Vision

enum DetectorFailure: String, Sendable {
  case cameraFailed = "camera_failed"
  case unreadableFrame = "unreadable_frame"
  case unsupportedFrame = "unsupported_frame"
  case visionFailed = "vision_failed"
}

enum CardQuadDetector {
  enum RefinementStatus: Int {
    case refined = 0
    case noProposal = 1
    case proposalOutsideFrame = 2
    case weakEdge = 3
    case invalidQuad = 4
  }

  struct Output {
    var proposal: [SIMD2<Double>]?
    var refined: [SIMD2<Double>]?
    var confidence = 0.0
    var areaRatio = 0.0
    var aspectRatio = 0.0
    var centerOffset = 1.0
    var edgeSupportMin = 0.0
    var shifts = [0.0, 0.0, 0.0, 0.0]
    var signature: [Double] = []
    var edgeSupports: [Double] = []
    var fallbackEdges = 0
    var refinementStatus = RefinementStatus.noProposal
    var proposalDurationMs = 0.0
    var failure: DetectorFailure?
  }

  private static let supportedPixelFormats: Set<OSType> = [
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ]

  static func detect(
    pixelBuffer: CVPixelBuffer,
    displayOrientation: CGImagePropertyOrientation
  ) -> Output {
    var output = Output()
    guard let transform = OrientationTransform(
      displayOrientation: displayOrientation,
      bufferWidth: Double(CVPixelBufferGetWidth(pixelBuffer)),
      bufferHeight: Double(CVPixelBufferGetHeight(pixelBuffer))
    ) else {
      output.failure = .unsupportedFrame
      return output
    }
    guard supportedPixelFormats.contains(CVPixelBufferGetPixelFormatType(pixelBuffer)),
          CVPixelBufferGetPlaneCount(pixelBuffer) >= 1
    else {
      output.failure = .unreadableFrame
      return output
    }

    let proposalStartedAt = ProcessInfo.processInfo.systemUptime
    let request = VNDetectDocumentSegmentationRequest()
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: displayOrientation,
      options: [:]
    )
    do {
      try handler.perform([request])
    } catch {
      output.proposalDurationMs = elapsedMilliseconds(since: proposalStartedAt)
      output.failure = .visionFailed
      return output
    }
    output.proposalDurationMs = elapsedMilliseconds(since: proposalStartedAt)

    guard let observation = request.results?.first,
          observation.confidence.isFinite,
          (0.0 ... 1.0).contains(Double(observation.confidence))
    else {
      return output
    }
    output.confidence = Double(observation.confidence)

    let visionPoints = [
      observation.topLeft,
      observation.topRight,
      observation.bottomRight,
      observation.bottomLeft,
    ]
    guard visionPoints.allSatisfy({
      $0.x.isFinite && $0.y.isFinite
        && (0.0 ... 1.0).contains($0.x) && (0.0 ... 1.0).contains($0.y)
    }) else {
      output.refinementStatus = .proposalOutsideFrame
      return output
    }
    let orientedPoints = visionPoints.map {
      SIMD2(Double($0.x) * transform.orientedWidth, (1.0 - Double($0.y)) * transform.orientedHeight)
    }
    guard let proposal = CardQuadGeometry.orderedClockwise(orientedPoints),
          CardQuadGeometry.isNondegenerateConvex(proposal, minimumEdge: 1.0)
    else {
      output.refinementStatus = .invalidQuad
      return output
    }
    output.proposal = proposal.map { normalized($0, transform) }

    guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
      output.failure = .unreadableFrame
      return output
    }
    defer {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
    }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else {
      output.failure = .unreadableFrame
      return output
    }
    let plane = LumaPlane(
      base: UnsafePointer(base.assumingMemoryBound(to: UInt8.self)),
      width: CVPixelBufferGetWidthOfPlane(pixelBuffer, 0),
      height: CVPixelBufferGetHeightOfPlane(pixelBuffer, 0),
      bytesPerRow: CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    )

    switch CardEdgeRefiner.refine(proposal: proposal, plane: plane, transform: transform) {
    case let .refined(corners, supportMin, shifts, supports, fallbackEdges):
      output.edgeSupports = supports
      guard fallbackEdges == 0 || output.confidence >= minimumFallbackConfidence else {
        output.edgeSupportMin = supportMin
        output.fallbackEdges = fallbackEdges
        output.refinementStatus = .weakEdge
        break
      }
      output.fallbackEdges = fallbackEdges
      let metrics = CardQuadGeometry.metrics(
        corners,
        width: transform.orientedWidth,
        height: transform.orientedHeight
      )
      output.refined = corners.map { normalized($0, transform) }
      output.areaRatio = metrics.areaRatio
      output.aspectRatio = metrics.aspectRatio
      output.centerOffset = metrics.centerOffset
      output.edgeSupportMin = supportMin
      output.shifts = shifts
      output.signature = cardSignature(corners: corners, plane: plane, transform: transform)
      output.refinementStatus = .refined
    case let .weakEdge(supportMin, supports):
      output.edgeSupports = supports
      output.edgeSupportMin = supportMin
      output.refinementStatus = .weakEdge
    case let .invalidQuad(supportMin, supports):
      output.edgeSupports = supports
      output.edgeSupportMin = supportMin
      output.refinementStatus = .invalidQuad
    }
    return output
  }

  static let minimumFallbackConfidence = 0.9
  static let signatureColumns = 8
  static let signatureRows = 6
  static let signatureLeft = 0.1
  static let signatureRight = 0.9
  static let signatureTop = 0.12
  static let signatureBottom = 0.55

  static func cardSignature(
    corners: [SIMD2<Double>],
    plane: LumaPlane,
    transform: OrientationTransform
  ) -> [Double] {
    var signature: [Double] = []
    signature.reserveCapacity(signatureColumns * signatureRows)
    for row in 0 ..< signatureRows {
      for column in 0 ..< signatureColumns {
        let u = signatureLeft
          + (signatureRight - signatureLeft) * (Double(column) + 0.5) / Double(signatureColumns)
        let v = signatureTop
          + (signatureBottom - signatureTop) * (Double(row) + 0.5) / Double(signatureRows)
        var sum = 0.0
        var count = 0.0
        for offset in [SIMD2(0.0, 0.0), SIMD2(-0.02, -0.02), SIMD2(0.02, -0.02), SIMD2(-0.02, 0.02), SIMD2(0.02, 0.02)] {
          let su = u + offset.x
          let sv = v + offset.y
          let top = corners[0] * (1.0 - su) + corners[1] * su
          let bottom = corners[3] * (1.0 - su) + corners[2] * su
          let point = top * (1.0 - sv) + bottom * sv
          if let value = plane.value(at: transform.bufferPoint(point)) {
            sum += value
            count += 1.0
          }
        }
        signature.append(count > 0.0 ? sum / count : 0.0)
      }
    }
    return signature
  }

  static func normalized(
    _ point: SIMD2<Double>,
    _ transform: OrientationTransform
  ) -> SIMD2<Double> {
    SIMD2(point.x / transform.orientedWidth, point.y / transform.orientedHeight)
  }

  static func elapsedMilliseconds(since startedAt: TimeInterval) -> Double {
    max(0.0, (ProcessInfo.processInfo.systemUptime - startedAt) * 1_000.0)
  }
}
