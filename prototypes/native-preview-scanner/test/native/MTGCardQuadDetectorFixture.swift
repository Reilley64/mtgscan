import CoreImage
import CoreVideo
import Foundation
import ImageIO
import simd
import Vision

private let allOrientations: [CGImagePropertyOrientation] = [
  .up, .upMirrored, .down, .downMirrored, .leftMirrored, .right, .rightMirrored, .left,
]

private func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  guard condition() else {
    fputs("native detector fixture failed: \(message)\n", stderr)
    exit(1)
  }
}

private struct GrayImage {
  let width: Int
  let height: Int
  var pixels: [UInt8]

  init(width: Int, height: Int, fill: UInt8) {
    self.width = width
    self.height = height
    pixels = [UInt8](repeating: fill, count: width * height)
  }
}

private func makeBuffer(oriented: GrayImage, orientation: CGImagePropertyOrientation) -> CVPixelBuffer {
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
  let transform = MTGOrientationTransform(
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

private func testTransformMatchesCoreImage() {
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
    let transform = MTGOrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(width),
      bufferHeight: Double(height)
    )!
    require(
      Int(transform.orientedWidth) == orientedWidth && Int(transform.orientedHeight) == orientedHeight,
      "oriented size for \(orientation.rawValue)"
    )
    for y in 0 ..< orientedHeight {
      for x in 0 ..< orientedWidth {
        let target = transform.bufferPoint(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
        let expected = source[(Int(target.y) * width + Int(target.x)) * 4]
        let actual = rendered[(y * orientedWidth + x) * 4]
        require(
          expected == actual,
          "Core Image orientation \(orientation.rawValue) at \(x),\(y): \(actual) != \(expected)"
        )
      }
    }
  }
}

private func testTransformMatchesVision() {
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
      require(false, "Vision failed for \(orientation.rawValue): \(error)")
    }
    guard let observation = request.results?.first else {
      require(false, "Vision found no rectangle for \(orientation.rawValue)")
      return
    }
    let transform = MTGOrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(bufferWidth),
      bufferHeight: Double(bufferHeight)
    )!
    let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
    let orientedCenter = corners.reduce(SIMD2<Double>(0, 0)) {
      $0 + SIMD2(Double($1.x) * transform.orientedWidth, (1.0 - Double($1.y)) * transform.orientedHeight)
    } / 4.0
    let mapped = transform.bufferPoint(orientedCenter)
    require(
      simd_length(mapped - expectedCenter) < 4.0,
      "Vision orientation \(orientation.rawValue) mapped center \(mapped), expected \(expectedCenter)"
    )
  }
}

private struct SyntheticCard {
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

private func renderCard(_ card: SyntheticCard?, width: Int, height: Int, background: Double) -> GrayImage {
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

private func lumaPlane<T>(_ buffer: CVPixelBuffer, _ body: (MTGLumaPlane) -> T) -> T {
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
  let plane = MTGLumaPlane(
    base: UnsafePointer(CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!.assumingMemoryBound(to: UInt8.self)),
    width: CVPixelBufferGetWidthOfPlane(buffer, 0),
    height: CVPixelBufferGetHeightOfPlane(buffer, 0),
    bytesPerRow: CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
  )
  return body(plane)
}

private func maximumCornerError(_ actual: [SIMD2<Double>], _ expected: [SIMD2<Double>]) -> Double {
  zip(actual, expected).map { simd_length($0 - $1) }.max() ?? .infinity
}

private func testRefinementRecoversOuterEdges() {
  let card = SyntheticCard(center: SIMD2(372, 610), width: 400, angle: 7.0 * Double.pi / 180.0)
  let truth = MTGCardQuadGeometry.orderedClockwise(card.corners)!
  let oriented = renderCard(card, width: 720, height: 1280, background: 190)

  for orientation in [CGImagePropertyOrientation.right, .up, .left] {
    let buffer = makeBuffer(oriented: oriented, orientation: orientation)
    let transform = MTGOrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
      bufferHeight: Double(CVPixelBufferGetHeight(buffer))
    )!
    let centroid = truth.reduce(SIMD2<Double>(0, 0), +) / 4.0
    let lowered = truth.map { centroid + ($0 - centroid) * 0.94 + SIMD2(0.0, card.height * 0.06) }
    let outcome = lumaPlane(buffer) {
      MTGCardEdgeRefiner.refine(proposal: lowered, plane: $0, transform: transform)
    }
    guard case let .refined(corners, supportMin, shifts) = outcome else {
      require(false, "refinement failed for orientation \(orientation.rawValue): \(outcome)")
      return
    }
    let error = maximumCornerError(corners, truth)
    require(error < 1.5, "orientation \(orientation.rawValue) corner error \(error) px")
    require(supportMin >= 0.9, "orientation \(orientation.rawValue) support \(supportMin)")
    require(shifts[0] > 0.05 && shifts[2] < 0.0, "orientation \(orientation.rawValue) shifts \(shifts)")
  }
}

private func testRefinementRejectsBlankSurface() {
  let oriented = renderCard(nil, width: 720, height: 1280, background: 150)
  let buffer = makeBuffer(oriented: oriented, orientation: .right)
  let transform = MTGOrientationTransform(
    displayOrientation: .right,
    bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
    bufferHeight: Double(CVPixelBufferGetHeight(buffer))
  )!
  let proposal = [SIMD2(200.0, 350.0), SIMD2(520.0, 350.0), SIMD2(520.0, 800.0), SIMD2(200.0, 800.0)]
  let outcome = lumaPlane(buffer) {
    MTGCardEdgeRefiner.refine(proposal: proposal, plane: $0, transform: transform)
  }
  guard case .weakEdge = outcome else {
    require(false, "blank surface should have weak edges, got \(outcome)")
    return
  }
}

private func testDetectorEndToEnd() {
  let card = SyntheticCard(center: SIMD2(350, 590), width: 420, angle: -5.0 * Double.pi / 180.0)
  let truth = MTGCardQuadGeometry.orderedClockwise(card.corners)!
    .map { SIMD2($0.x / 720.0, $0.y / 1280.0) }
  let buffer = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 185), orientation: .right)
  let output = MTGCardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: .right)
  require(output.runtimeErrorCode == 0, "end-to-end runtime error \(output.runtimeErrorCode)")
  require(output.proposal != nil, "document segmentation produced no proposal")
  require(output.refinementStatus == .refined, "end-to-end status \(output.refinementStatus)")
  let error = maximumCornerError(
    output.refined!.map { SIMD2($0.x * 720.0, $0.y * 1280.0) },
    truth.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }
  )
  require(error < 1.5, "end-to-end corner error \(error) px")
  let proposalError = maximumCornerError(
    output.proposal!.map { SIMD2($0.x * 720.0, $0.y * 1280.0) },
    truth.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }
  )
  print(
    "end-to-end: confidence \(output.confidence), proposal error \(proposalError) px, "
      + "refined error \(error) px, shifts \(output.shifts.map { ($0 * 1000).rounded() / 1000 })"
  )
}

private func testRefinementTiming() {
  let card = SyntheticCard(center: SIMD2(360, 640), width: 380, angle: 3.0 * Double.pi / 180.0)
  let truth = MTGCardQuadGeometry.orderedClockwise(card.corners)!
  let buffer = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 175), orientation: .right)
  let transform = MTGOrientationTransform(displayOrientation: .right, bufferWidth: 1280, bufferHeight: 720)!
  var durations: [Double] = []
  lumaPlane(buffer) { plane in
    for _ in 0 ..< 200 {
      let startedAt = ProcessInfo.processInfo.systemUptime
      _ = MTGCardEdgeRefiner.refine(proposal: truth, plane: plane, transform: transform)
      durations.append((ProcessInfo.processInfo.systemUptime - startedAt) * 1_000.0)
    }
  }
  durations.sort()
  print("refinement on this Mac: p50 \(durations[100]) ms, p95 \(durations[189]) ms")
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

private func testCardSignature() {
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
    let output = MTGCardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: .right)
    require(output.refinementStatus == .refined, "signature card was not refined")
    require(output.signature.count == 48, "signature has \(output.signature.count) cells")
    return output.signature
  }
  let base = SyntheticCard(center: SIMD2(350, 600), width: 420, angle: 0.0)
  let shifted = SyntheticCard(center: SIMD2(356, 606), width: 420, angle: 1.0 * Double.pi / 180.0)
  let same = correlation(signature(for: base, artOffset: 0.0), signature(for: shifted, artOffset: 0.0))
  let different = correlation(signature(for: base, artOffset: 0.0), signature(for: base, artOffset: 0.4))
  require(same > 0.9, "same card signature correlation \(same)")
  require(different < 0.6, "different card signature correlation \(different)")
  print("signature correlation: same card \(same), different card \(different)")
}

testTransformMatchesCoreImage()
testTransformMatchesVision()
testRefinementRecoversOuterEdges()
testRefinementRejectsBlankSurface()
testDetectorEndToEnd()
testCardSignature()
testRefinementTiming()
print("native detector fixture passed")
