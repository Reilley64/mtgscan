import CoreImage
import CoreVideo
import Foundation
import ImageIO
import simd
import Testing
import Vision

@testable import CardDetector

private let allOrientations: [CGImagePropertyOrientation] = [
  .up, .upMirrored, .down, .downMirrored, .leftMirrored, .right, .rightMirrored, .left,
]

struct GrayImage {
  let width: Int
  let height: Int
  var pixels: [UInt8]

  init(width: Int, height: Int, fill: UInt8) {
    self.width = width
    self.height = height
    pixels = [UInt8](repeating: fill, count: width * height)
  }
}

func makeBuffer(oriented: GrayImage, orientation: CGImagePropertyOrientation) -> CVPixelBuffer {
  let swaps = [.leftMirrored, .right, .rightMirrored, .left].contains(orientation)
  let bufferWidth = swaps ? oriented.height : oriented.width
  let bufferHeight = swaps ? oriented.width : oriented.height
  var created: CVPixelBuffer?
  let status = CVPixelBufferCreate(
    kCFAllocatorDefault,
    bufferWidth,
    bufferHeight,
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary,
    &created
  )
  guard status == kCVReturnSuccess, let buffer = created else {
    fatalError("could not create pixel buffer")
  }
  let transform = OrientationTransform(
    displayOrientation: orientation,
    bufferWidth: Double(bufferWidth),
    bufferHeight: Double(bufferHeight)
  )!
  CVPixelBufferLockBaseAddress(buffer, [])
  let luma = CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!.assumingMemoryBound(to: UInt8.self)
  let lumaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
  for y in 0 ..< oriented.height {
    for x in 0 ..< oriented.width {
      let target = transform.bufferPoint(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
      luma[Int(target.y) * lumaStride + Int(target.x)] = oriented.pixels[y * oriented.width + x]
    }
  }
  let chroma = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)!.assumingMemoryBound(to: UInt8.self)
  let chromaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
  for row in 0 ..< CVPixelBufferGetHeightOfPlane(buffer, 1) {
    memset(chroma + row * chromaStride, 128, chromaStride)
  }
  CVPixelBufferUnlockBaseAddress(buffer, [])
  return buffer
}

@Test("maps every display orientation the same way as Core Image")
func transformMatchesCoreImage() {
  let width = 7
  let height = 4
  var source = [UInt8](repeating: 255, count: width * height * 4)
  for y in 0 ..< height {
    for x in 0 ..< width {
      source[(y * width + x) * 4] = UInt8(y * width + x + 1)
    }
  }
  let provider = CGDataProvider(data: Data(source) as CFData)!
  let image = CGImage(
    width: width,
    height: height,
    bitsPerComponent: 8,
    bitsPerPixel: 32,
    bytesPerRow: width * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
    provider: provider,
    decode: nil,
    shouldInterpolate: false,
    intent: .defaultIntent
  )!
  let context = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])

  for orientation in allOrientations {
    let oriented = CIImage(cgImage: image).oriented(orientation)
    let extent = oriented.extent.integral
    let orientedWidth = Int(extent.width)
    let orientedHeight = Int(extent.height)
    var rendered = [UInt8](repeating: 0, count: orientedWidth * orientedHeight * 4)
    context.render(
      oriented,
      toBitmap: &rendered,
      rowBytes: orientedWidth * 4,
      bounds: extent,
      format: .RGBA8,
      colorSpace: nil
    )
    let transform = OrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(width),
      bufferHeight: Double(height)
    )!
    #expect(
      Int(transform.orientedWidth) == orientedWidth && Int(transform.orientedHeight) == orientedHeight,
      "oriented size for \(orientation.rawValue)"
    )
    for y in 0 ..< orientedHeight {
      for x in 0 ..< orientedWidth {
        let target = transform.bufferPoint(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
        let expected = source[(Int(target.y) * width + Int(target.x)) * 4]
        let actual = rendered[(y * orientedWidth + x) * 4]
        #expect(
          expected == actual,
          "Core Image orientation \(orientation.rawValue) at \(x),\(y): \(actual) != \(expected)"
        )
      }
    }
  }
}

@Test("maps Vision results back to the camera buffer in every orientation")
func transformMatchesVision() {
  let bufferWidth = 1280
  let bufferHeight = 720
  var buffer = GrayImage(width: bufferWidth, height: bufferHeight, fill: 20)
  let rectangle = (x: 700, y: 120, width: 360, height: 260)
  for y in rectangle.y ..< rectangle.y + rectangle.height {
    for x in rectangle.x ..< rectangle.x + rectangle.width {
      buffer.pixels[y * bufferWidth + x] = 235
    }
  }
  let expectedCenter = SIMD2(
    Double(rectangle.x) + Double(rectangle.width) / 2.0,
    Double(rectangle.y) + Double(rectangle.height) / 2.0
  )
  let pixelBuffer = makeBuffer(oriented: buffer, orientation: .up)

  for orientation in allOrientations {
    let request = VNDetectRectanglesRequest()
    request.minimumAspectRatio = 0.1
    request.maximumAspectRatio = 1.0
    request.minimumSize = 0.1
    request.maximumObservations = 1
    do {
      try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
        .perform([request])
    } catch {
      Issue.record("Vision failed for \(orientation.rawValue): \(error)")
    }
    guard let observation = request.results?.first else {
      Issue.record("Vision found no rectangle for \(orientation.rawValue)")
      return
    }
    let transform = OrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(bufferWidth),
      bufferHeight: Double(bufferHeight)
    )!
    let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
    let orientedCenter = corners.reduce(SIMD2<Double>(0, 0)) {
      $0 + SIMD2(Double($1.x) * transform.orientedWidth, (1.0 - Double($1.y)) * transform.orientedHeight)
    } / 4.0
    let mapped = transform.bufferPoint(orientedCenter)
    #expect(
      simd_length(mapped - expectedCenter) < 4.0,
      "Vision orientation \(orientation.rawValue) mapped center \(mapped), expected \(expectedCenter)"
    )
  }
}

protocol RenderableCard {
  var width: Double { get }
  var height: Double { get }
  func local(_ point: SIMD2<Double>) -> SIMD2<Double>
}

struct SyntheticCard: RenderableCard {
  let center: SIMD2<Double>
  let width: Double
  let angle: Double

  var height: Double { width * 88.0 / 63.0 }

  var corners: [SIMD2<Double>] {
    let halfWidth = width / 2.0
    let halfHeight = height / 2.0
    return [
      SIMD2(-halfWidth, -halfHeight),
      SIMD2(halfWidth, -halfHeight),
      SIMD2(halfWidth, halfHeight),
      SIMD2(-halfWidth, halfHeight),
    ].map { rotate($0) + center }
  }

  func rotate(_ point: SIMD2<Double>) -> SIMD2<Double> {
    SIMD2(
      point.x * cos(angle) - point.y * sin(angle),
      point.x * sin(angle) + point.y * cos(angle)
    )
  }

  func local(_ point: SIMD2<Double>) -> SIMD2<Double> {
    let offset = point - center
    return SIMD2(
      offset.x * cos(angle) + offset.y * sin(angle),
      -offset.x * sin(angle) + offset.y * cos(angle)
    )
  }
}

private func roundedRectangleDistance(
  _ point: SIMD2<Double>,
  halfWidth: Double,
  halfHeight: Double,
  radius: Double
) -> Double {
  let q = SIMD2(abs(point.x) - (halfWidth - radius), abs(point.y) - (halfHeight - radius))
  let outside = simd_length(SIMD2(max(q.x, 0.0), max(q.y, 0.0)))
  return outside + min(max(q.x, q.y), 0.0) - radius
}

func renderCard(_ card: (any RenderableCard)?, width: Int, height: Int, background: Double) -> GrayImage {
  var image = GrayImage(width: width, height: height, fill: 0)
  var seed: UInt64 = 0x9E37_79B9_7F4A_7C15
  for y in 0 ..< height {
    for x in 0 ..< width {
      seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
      let noise = Double(Int(seed >> 59)) - 16.0
      var value = background + noise * 0.4
      if let card {
        let local = card.local(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
        let halfWidth = card.width / 2.0
        let halfHeight = card.height / 2.0
        let outer = roundedRectangleDistance(
          local, halfWidth: halfWidth, halfHeight: halfHeight, radius: card.width * 0.05
        )
        let borderInset = card.width * 0.045
        let frame = roundedRectangleDistance(
          local, halfWidth: halfWidth - borderInset, halfHeight: halfHeight - borderInset, radius: 2.0
        )
        let textBox = roundedRectangleDistance(
          local - SIMD2(0.0, halfHeight * 0.45),
          halfWidth: halfWidth - borderInset * 2.0,
          halfHeight: halfHeight * 0.38,
          radius: 2.0
        )
        let outerCoverage = max(0.0, min(1.0, 0.5 - outer))
        let frameCoverage = max(0.0, min(1.0, 0.5 - frame))
        let textCoverage = max(0.0, min(1.0, 0.5 - textBox))
        var cardValue = 28.0
        cardValue = cardValue * (1.0 - frameCoverage) + 120.0 * frameCoverage
        cardValue = cardValue * (1.0 - textCoverage) + 205.0 * textCoverage
        value = value * (1.0 - outerCoverage) + (cardValue + noise * 0.4) * outerCoverage
      }
      image.pixels[y * width + x] = UInt8(max(0.0, min(255.0, value.rounded())))
    }
  }
  return image
}

private func lumaPlane<T>(_ buffer: CVPixelBuffer, _ body: (LumaPlane) -> T) -> T {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  let plane = LumaPlane(
    base: UnsafePointer(CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!.assumingMemoryBound(to: UInt8.self)),
    width: CVPixelBufferGetWidthOfPlane(buffer, 0),
    height: CVPixelBufferGetHeightOfPlane(buffer, 0),
    bytesPerRow: CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
  )
  return body(plane)
}

func maximumCornerError(_ actual: [SIMD2<Double>], _ expected: [SIMD2<Double>]) -> Double {
  zip(actual, expected).map { simd_length($0 - $1) }.max() ?? .infinity
}

@Test("moves an inset proposal out to the card's outer edges")
func refinementRecoversOuterEdges() {
  let card = SyntheticCard(center: SIMD2(372, 610), width: 400, angle: 7.0 * Double.pi / 180.0)
  let truth = CardQuadGeometry.orderedClockwise(card.corners)!
  let oriented = renderCard(card, width: 720, height: 1280, background: 190)

  for orientation in [CGImagePropertyOrientation.right, .up, .left] {
    let buffer = makeBuffer(oriented: oriented, orientation: orientation)
    let transform = OrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
      bufferHeight: Double(CVPixelBufferGetHeight(buffer))
    )!
    let centroid = truth.reduce(SIMD2<Double>(0, 0), +) / 4.0
    let lowered = truth.map { centroid + ($0 - centroid) * 0.94 + SIMD2(0.0, card.height * 0.02) }
    let outcome = lumaPlane(buffer) {
      CardEdgeRefiner.refine(proposal: lowered, plane: $0, transform: transform)
    }
    guard case let .refined(corners, supportMin, shifts, _, _) = outcome else {
      Issue.record("refinement failed for orientation \(orientation.rawValue): \(outcome)")
      return
    }
    let error = maximumCornerError(corners, truth)
    #expect(error < 1.5, "orientation \(orientation.rawValue) corner error \(error) px")
    #expect(supportMin >= 0.9, "orientation \(orientation.rawValue) support \(supportMin)")
    #expect(shifts[0] > 0.05 && shifts[2] > 0.0 && shifts[0] > shifts[2], "orientation \(orientation.rawValue) shifts \(shifts)")
  }
}

@Test("keeps the card's edges when a line outside one edge and a line inside the opposite edge would shift the outline")
func refinementRefusesAnOutlineShiftedAcrossTheCard() {
  let card = SyntheticCard(center: SIMD2(360, 640), width: 400, angle: 4.0 * Double.pi / 180.0)
  let truth = CardQuadGeometry.orderedClockwise(card.corners)!
  var oriented = renderCard(card, width: 720, height: 1280, background: 190)
  for y in 0 ..< oriented.height {
    for x in 0 ..< oriented.width {
      let local = card.local(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
      let outsideTheTop = (-card.height / 2.0 - 28.0 ... -card.height / 2.0 - 24.0).contains(local.y)
        && abs(local.x) < card.width / 2.0 + 40.0
      let insideTheBottom = (card.height / 2.0 - 26.0 ... card.height / 2.0 - 22.0).contains(local.y)
        && abs(local.x) < card.width / 2.0 - 30.0
      if outsideTheTop || insideTheBottom {
        oriented.pixels[y * oriented.width + x] = 28
      }
    }
  }
  let buffer = makeBuffer(oriented: oriented, orientation: .right)
  let transform = OrientationTransform(
    displayOrientation: .right,
    bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
    bufferHeight: Double(CVPixelBufferGetHeight(buffer))
  )!

  let outcome = lumaPlane(buffer) {
    CardEdgeRefiner.refine(proposal: truth, plane: $0, transform: transform)
  }

  guard case let .refined(corners, _, _, _, _) = outcome else {
    Issue.record("refinement failed: \(outcome)")
    return
  }
  let error = maximumCornerError(corners, truth)
  #expect(error < 1.5, "corner error \(error) px")
}

@Test("finds no card edges on a blank surface")
func refinementRejectsBlankSurface() {
  let oriented = renderCard(nil, width: 720, height: 1280, background: 150)
  let buffer = makeBuffer(oriented: oriented, orientation: .right)
  let transform = OrientationTransform(
    displayOrientation: .right,
    bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
    bufferHeight: Double(CVPixelBufferGetHeight(buffer))
  )!
  let proposal = [SIMD2(200.0, 350.0), SIMD2(520.0, 350.0), SIMD2(520.0, 800.0), SIMD2(200.0, 800.0)]
  let outcome = lumaPlane(buffer) {
    CardEdgeRefiner.refine(proposal: proposal, plane: $0, transform: transform)
  }
  guard case .weakEdge = outcome else {
    Issue.record("blank surface should have weak edges, got \(outcome)")
    return
  }
}

@Test("finds a slightly turned card in a portrait frame")
func detectorEndToEnd() {
  let card = SyntheticCard(center: SIMD2(350, 590), width: 420, angle: -5.0 * Double.pi / 180.0)
  let truth = CardQuadGeometry.orderedClockwise(card.corners)!
    .map { SIMD2($0.x / 720.0, $0.y / 1280.0) }
  let buffer = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 185), orientation: .right)
  let output = CardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: .right, intrinsicMatrix: nil)
  #expect(output.failure == nil)
  #expect(output.proposal != nil, "document segmentation produced no proposal")
  #expect(output.refined != nil, "end-to-end card was not refined")
  let error = maximumCornerError(
    output.refined!.map { SIMD2($0.x * 720.0, $0.y * 1280.0) },
    truth.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }
  )
  #expect(error < 1.5, "end-to-end corner error \(error) px")
}

private func correlation(_ first: [Double], _ second: [Double]) -> Double {
  let meanFirst = first.reduce(0, +) / Double(first.count)
  let meanSecond = second.reduce(0, +) / Double(second.count)
  var product = 0.0
  var firstSquares = 0.0
  var secondSquares = 0.0
  for index in first.indices {
    let a = first[index] - meanFirst
    let b = second[index] - meanSecond
    product += a * b
    firstSquares += a * a
    secondSquares += b * b
  }
  return product / max(0.000_001, (firstSquares * secondSquares).squareRoot())
}

@Test("gives a shifted card a matching signature and different art a different one")
func cardSignature() {
  func signature(for card: SyntheticCard, artOffset: Double) -> [Double] {
    var image = renderCard(card, width: 720, height: 1280, background: 185)
    let box = card.corners
    let left = Int(box.map(\.x).min()! + card.width * (0.15 + artOffset))
    let top = Int(box.map(\.y).min()! + card.height * 0.2)
    for y in top ..< top + Int(card.height * 0.12) {
      for x in left ..< left + Int(card.width * 0.4) {
        image.pixels[y * 720 + x] = 60
      }
    }
    let buffer = makeBuffer(oriented: image, orientation: .right)
    let output = CardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: .right, intrinsicMatrix: nil)
    #expect(output.refined != nil, "signature card was not refined")
    #expect(output.signature.count == 48, "signature has \(output.signature.count) cells")
    return output.signature
  }
  let base = SyntheticCard(center: SIMD2(350, 600), width: 420, angle: 0.0)
  let shifted = SyntheticCard(center: SIMD2(356, 606), width: 420, angle: 1.0 * Double.pi / 180.0)
  let same = correlation(signature(for: base, artOffset: 0.0), signature(for: shifted, artOffset: 0.0))
  let different = correlation(signature(for: base, artOffset: 0.0), signature(for: base, artOffset: 0.4))
  #expect(same > 0.9, "same card signature correlation \(same)")
  #expect(different < 0.6, "different card signature correlation \(different)")
}

@Test("uses the proposal line for one edge that shows no step")
func oneEdgeFallback() {
  let card = SyntheticCard(center: SIMD2(360, 620), width: 400, angle: 0.0)
  let truth = CardQuadGeometry.orderedClockwise(card.corners)!
  var oriented = renderCard(card, width: 720, height: 1280, background: 190)
  let flatFrom = Int(truth.map(\.x).max()! - card.width * 0.2)
  for y in 0 ..< 1280 {
    for x in flatFrom ..< 720 {
      oriented.pixels[y * 720 + x] = 28
    }
  }
  let buffer = makeBuffer(oriented: oriented, orientation: .right)
  let transform = OrientationTransform(displayOrientation: .right, bufferWidth: 1280, bufferHeight: 720)!
  let outcome = lumaPlane(buffer) {
    CardEdgeRefiner.refine(proposal: truth, plane: $0, transform: transform)
  }
  guard case let .refined(corners, supportMin, _, supports, fallbackEdges) = outcome else {
    Issue.record("one-edge fallback did not refine: \(outcome)")
    return
  }
  #expect(fallbackEdges == 1, "expected one fallback edge, got \(fallbackEdges)")
  #expect(supports[1] < 0.7, "right edge support \(supports[1]) should be weak")
  #expect(supportMin >= 0.9, "measured edges support \(supportMin)")
  let error = maximumCornerError(corners, truth)
  #expect(error < 2.0, "fallback corner error \(error) px")
}

private func refinedOutput(
  confidence: Double = 0.9,
  areaRatio: Double = 0.3,
  edgeSupportMin: Double = 0.8
) -> CardQuadDetector.Output {
  var output = CardQuadDetector.Output()
  output.proposal = [SIMD2(0.2, 0.2), SIMD2(0.8, 0.2), SIMD2(0.8, 0.8), SIMD2(0.2, 0.8)]
  output.refined = [SIMD2(0.25, 0.1), SIMD2(0.75, 0.1), SIMD2(0.75, 0.9), SIMD2(0.25, 0.9)]
  output.confidence = confidence
  output.areaRatio = areaRatio
  output.aspectRatio = 63.0 / 88.0
  output.edgeSupportMin = edgeSupportMin
  output.signature = [Double](repeating: 128, count: 48)
  return output
}

private let portraitFrame = OrientationTransform(displayOrientation: .right, bufferWidth: 1280, bufferHeight: 720)

private func sample(_ output: CardQuadDetector.Output) -> DetectionSample {
  DetectionSample(output: output, transform: portraitFrame, nativeDurationMs: 14, sampledAtMs: 1_000)
}

@Test("detects a card whose refined outline passes every detector gate")
func detectsACardThatPassesEveryGate() {
  let detection = sample(refinedOutput())
  #expect(detection.detected)
  #expect(detection.corners?.count == 4)
  #expect(detection.signature.count == 48)
}

@Test(
  "does not detect a card that fails a detector gate",
  arguments: [
    refinedOutput(confidence: 0.49),
    refinedOutput(areaRatio: 0.079),
    refinedOutput(areaRatio: 0.91),
    refinedOutput(edgeSupportMin: 0.69),
  ]
)
func doesNotDetectACardThatFailsAGate(output: CardQuadDetector.Output) {
  let detection = sample(output)
  #expect(!detection.detected)
  #expect(detection.corners == nil)
  #expect(detection.captureDevicePoints == nil)
  #expect(detection.signature.isEmpty)
  #expect(detection.proposalCorners != nil)
}

@Test("detects a card at the edge of every detector gate")
func detectsACardAtTheEdgeOfEveryGate() {
  #expect(sample(refinedOutput(confidence: 0.5, areaRatio: 0.08, edgeSupportMin: 0.7)).detected)
  #expect(sample(refinedOutput(areaRatio: 0.9)).detected)
}

@Test("maps the outline in the upright frame to camera sensor points")
func mapsTheOutlineToCameraSensorPoints() throws {
  let points = try #require(sample(refinedOutput()).captureDevicePoints)
  #expect(points[0] == SIMD2(0.1, 0.75))
  #expect(points[2] == SIMD2(0.9, 0.25))
}

@Test("reports a portrait frame for a landscape camera buffer")
func reportsAPortraitFrame() {
  let detection = sample(refinedOutput())
  #expect(detection.frameWidth == 720)
  #expect(detection.frameHeight == 1280)
}

@Test("sends a detection failure as a runtime error code")
func sendsADetectionFailureAsARuntimeErrorCode() {
  let failure = DetectionSample(failure: .visionFailed, sampledAtMs: 1_000)
  #expect(!failure.detected)
  #expect(failure.record["runtimeErrorCode"] as? String == "vision_failed")
}

@Test("refuses an outline whose sides are not in the card aspect")
func refusesAnOutlineThatIsNotCardShaped() {
  var image = GrayImage(width: 720, height: 1280, fill: 190)
  for y in 440 ..< 840 {
    for x in 160 ..< 560 {
      image.pixels[y * 720 + x] = 30
    }
  }
  let buffer = makeBuffer(oriented: image, orientation: .right)
  let transform = OrientationTransform(displayOrientation: .right, bufferWidth: 1280, bufferHeight: 720)!
  let square = [SIMD2(170.0, 450.0), SIMD2(550.0, 450.0), SIMD2(550.0, 830.0), SIMD2(170.0, 830.0)]
  let outcome = lumaPlane(buffer) {
    CardEdgeRefiner.refine(proposal: square, plane: $0, transform: transform)
  }
  guard case .invalidQuad = outcome else {
    Issue.record("a square should not refine into a card, got \(outcome)")
    return
  }
}


struct CameraPose {
  let tiltDegrees: Double
  let tiltAxisDegrees: Double
  let turnDegrees: Double
  let distanceMm: Double
  let centerMm: SIMD2<Double>

  static let portraitMatrix = simd_double3x3(rows: [
    SIMD3(940, 0, 350),
    SIMD3(0, 940, 660),
    SIMD3(0, 0, 1),
  ])
  static let portraitFrame = OrientationTransform(
    displayOrientation: .up,
    bufferWidth: 720,
    bufferHeight: 1280,
    bufferIntrinsicMatrix: portraitMatrix
  )!
  static let landscapeCameraMatrix = simd_float3x3(rows: [
    SIMD3(940, 0, 660),
    SIMD3(0, 940, 370),
    SIMD3(0, 0, 1),
  ])

  var homography: simd_double3x3 {
    let turn = turnDegrees * Double.pi / 180.0
    let tilt = simd_quatd(
      angle: tiltDegrees * Double.pi / 180.0,
      axis: SIMD3(cos(tiltAxisDegrees * Double.pi / 180.0), sin(tiltAxisDegrees * Double.pi / 180.0), 0)
    )
    return Self.portraitMatrix * simd_double3x3(columns: (
      tilt.act(SIMD3(cos(turn), sin(turn), 0)),
      tilt.act(SIMD3(-sin(turn), cos(turn), 0)),
      SIMD3(centerMm.x, centerMm.y, distanceMm)
    ))
  }

  func project(_ pointsMm: [SIMD2<Double>]) -> [SIMD2<Double>] {
    let homography = homography
    return pointsMm.map { point in
      let pixel = homography * SIMD3(point.x, point.y, 1)
      return SIMD2(pixel.x / pixel.z, pixel.y / pixel.z)
    }
  }

  func card(insetMm: Double = 0) -> [SIMD2<Double>] {
    let halfWidth = 31.5 - insetMm
    let halfHeight = 44.0 - insetMm
    return project([
      SIMD2(-halfWidth, -halfHeight),
      SIMD2(halfWidth, -halfHeight),
      SIMD2(halfWidth, halfHeight),
      SIMD2(-halfWidth, halfHeight),
    ])
  }
}

private let tiltedPoses = [
  CameraPose(tiltDegrees: 7, tiltAxisDegrees: 20, turnDegrees: -12, distanceMm: 150, centerMm: SIMD2(-8, 10)),
  CameraPose(tiltDegrees: 12, tiltAxisDegrees: 135, turnDegrees: 5, distanceMm: 140, centerMm: SIMD2(6, -12)),
  CameraPose(tiltDegrees: 15, tiltAxisDegrees: 260, turnDegrees: 18, distanceMm: 160, centerMm: SIMD2(0, 4)),
  CameraPose(tiltDegrees: 24, tiltAxisDegrees: 300, turnDegrees: -3, distanceMm: 130, centerMm: SIMD2(10, 0)),
]

@Test("measures the card aspect on the card from the intrinsic matrix at known camera poses", arguments: tiltedPoses)
private func measuresTheAspectOnTheCard(pose: CameraPose) {
  let aspect = CardQuadGeometry.aspectRatioOnCard(pose.card(), intrinsicMatrix: CameraPose.portraitMatrix)
  #expect(abs(aspect - 63.0 / 88.0) < 0.000_001, "aspect on the card \(aspect)")
}


@Test("measures a flat card's aspect as today's check in the frame does")
func measuresAFlatCardAsTheFrameCheck() {
  let flat = CameraPose(tiltDegrees: 0, tiltAxisDegrees: 0, turnDegrees: 14, distanceMm: 150, centerMm: SIMD2(-12, 9))
  let rectangle = flat.project([SIMD2(-30, -45), SIMD2(30, -45), SIMD2(30, 45), SIMD2(-30, 45)])
  let onCard = CardQuadGeometry.metrics(rectangle, in: CameraPose.portraitFrame)
  let inFrame = CardQuadGeometry.metrics(rectangle, in: portraitFrame!)
  #expect(abs(onCard.aspectRatio - 60.0 / 90.0) < 0.000_001, "aspect on the card \(onCard.aspectRatio)")
  #expect(abs(inFrame.aspectRatio - 60.0 / 90.0) < 0.000_001, "aspect in the frame \(inFrame.aspectRatio)")
}

@Test(
  "passes the outer edge and refuses the inner frame of a tilted black-bordered card",
  arguments: tiltedPoses.filter { $0.tiltDegrees <= 15 }
)
private func refusesTheInnerFrameOfATiltedCard(pose: CameraPose) {
  func isCardShaped(_ corners: [SIMD2<Double>]) -> Bool {
    CardQuadGeometry.isCardShaped(
      CardQuadGeometry.metrics(CardQuadGeometry.orderedClockwise(corners)!, in: CameraPose.portraitFrame)
    )
  }
  #expect(isCardShaped(pose.card()))
  #expect(!isCardShaped(pose.card(insetMm: 2.4)))
}


@Test("maps the landscape camera's intrinsic matrix to the portrait frame", arguments: tiltedPoses)
private func mapsTheCameraMatrixToThePortraitFrame(pose: CameraPose) {
  let transform = OrientationTransform(
    displayOrientation: .right,
    bufferWidth: 1280,
    bufferHeight: 720,
    bufferIntrinsicMatrix: simd_double3x3(CameraPose.landscapeCameraMatrix)
  )!
  let aspect = CardQuadGeometry.aspectRatioOnCard(pose.card(), intrinsicMatrix: transform.intrinsicMatrix!)
  #expect(abs(aspect - 63.0 / 88.0) < 0.000_01, "aspect on the card \(aspect)")
}

struct TiltedCard: RenderableCard {
  let width = 400.0
  let height = 400.0 * 88.0 / 63.0
  private let frameToCard: simd_double3x3

  init(pose: CameraPose) {
    frameToCard = pose.homography.inverse
  }

  func local(_ point: SIMD2<Double>) -> SIMD2<Double> {
    let onCard = frameToCard * SIMD3(point.x, point.y, 1)
    return SIMD2(onCard.x, onCard.y) / onCard.z * width / 63.0
  }
}

let tiltedTowardTheTop = CameraPose(
  tiltDegrees: 15, tiltAxisDegrees: 0, turnDegrees: -4, distanceMm: 150, centerMm: SIMD2(0, 0)
)

private func tiltedCardOutline(intrinsicMatrix: simd_float3x3?) -> [SIMD2<Double>]? {
  let image = renderCard(TiltedCard(pose: tiltedTowardTheTop), width: 720, height: 1280, background: 185)
  let output = CardQuadDetector.detect(
    pixelBuffer: makeBuffer(oriented: image, orientation: .right),
    displayOrientation: .right,
    intrinsicMatrix: intrinsicMatrix
  )
  return output.refined?.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }
}

@Test("finds the outer edge of a tilted black-bordered card with the camera's intrinsic matrix")
func findsTheOuterEdgeOfATiltedCard() throws {
  let outline = try #require(tiltedCardOutline(intrinsicMatrix: CameraPose.landscapeCameraMatrix))
  let error = maximumCornerError(outline, CardQuadGeometry.orderedClockwise(tiltedTowardTheTop.card())!)
  #expect(error < 1.5, "tilted card corner error \(error) px")
}

@Test("keeps today's check in the frame for a frame with no intrinsic matrix")
func keepsTheFrameCheckWithoutAMatrix() {
  let outline = tiltedCardOutline(intrinsicMatrix: nil)
  let outerEdge = CardQuadGeometry.orderedClockwise(tiltedTowardTheTop.card())!
  #expect(outline.map { maximumCornerError($0, outerEdge) > 5.0 } ?? true, "outline \(String(describing: outline))")
}
