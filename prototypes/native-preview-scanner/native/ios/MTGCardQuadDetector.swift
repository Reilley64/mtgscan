import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd
import Vision

enum MTGCardQuadDetector {
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
    var refinementStatus = RefinementStatus.noProposal
    var proposalDurationMs = 0.0
    var runtimeErrorCode = 0
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
    guard let transform = MTGOrientationTransform(
      displayOrientation: displayOrientation,
      bufferWidth: Double(CVPixelBufferGetWidth(pixelBuffer)),
      bufferHeight: Double(CVPixelBufferGetHeight(pixelBuffer))
    ) else {
      output.runtimeErrorCode = 3
      return output
    }
    guard supportedPixelFormats.contains(CVPixelBufferGetPixelFormatType(pixelBuffer)),
          CVPixelBufferGetPlaneCount(pixelBuffer) >= 1
    else {
      output.runtimeErrorCode = 5
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
      output.runtimeErrorCode = 4
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
    guard let proposal = MTGCardQuadGeometry.orderedClockwise(orientedPoints),
          MTGCardQuadGeometry.isNondegenerateConvex(proposal, minimumEdge: 1.0)
    else {
      output.refinementStatus = .invalidQuad
      return output
    }
    output.proposal = proposal.map { normalized($0, transform) }

    guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
      output.runtimeErrorCode = 5
      return output
    }
    defer {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
    }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else {
      output.runtimeErrorCode = 5
      return output
    }
    let plane = MTGLumaPlane(
      base: UnsafePointer(base.assumingMemoryBound(to: UInt8.self)),
      width: CVPixelBufferGetWidthOfPlane(pixelBuffer, 0),
      height: CVPixelBufferGetHeightOfPlane(pixelBuffer, 0),
      bytesPerRow: CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    )

    switch MTGCardEdgeRefiner.refine(proposal: proposal, plane: plane, transform: transform) {
    case let .refined(corners, supportMin, shifts):
      let metrics = MTGCardQuadGeometry.metrics(
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
      output.refinementStatus = .refined
    case let .weakEdge(supportMin):
      output.edgeSupportMin = supportMin
      output.refinementStatus = .weakEdge
    case let .invalidQuad(supportMin):
      output.edgeSupportMin = supportMin
      output.refinementStatus = .invalidQuad
    }
    return output
  }

  static func normalized(
    _ point: SIMD2<Double>,
    _ transform: MTGOrientationTransform
  ) -> SIMD2<Double> {
    SIMD2(point.x / transform.orientedWidth, point.y / transform.orientedHeight)
  }

  static func elapsedMilliseconds(since startedAt: TimeInterval) -> Double {
    max(0.0, (ProcessInfo.processInfo.systemUptime - startedAt) * 1_000.0)
  }
}
