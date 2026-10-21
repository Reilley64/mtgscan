import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd
import Testing

@testable import CardDetector

private let card = SyntheticCard(center: SIMD2(360, 620), width: 400, angle: 4.0 * Double.pi / 180.0)
private let moved = CardQuadGeometry.orderedClockwise(card.corners)!

private func refined(_ corners: [SIMD2<Double>]) -> CardEdgeRefiner.Outcome {
  .refined(corners: corners, supportMin: 0.9, shifts: [0, 0, 0, 0], supports: [0.9, 0.9, 0.9, 0.9], fallbackEdges: 0)
}

private func scaled(_ corners: [SIMD2<Double>], width: Double, height: Double) -> [SIMD2<Double>] {
  let centroid = corners.reduce(SIMD2<Double>(0, 0), +) / 4.0
  let across = simd_normalize(corners[1] - corners[0])
  let down = simd_normalize(corners[3] - corners[0])
  return corners.map { corner in
    let offset = corner - centroid
    return centroid + simd_dot(offset, across) * width * across + simd_dot(offset, down) * height * down
  }
}

private func writeJPEG(_ image: GrayImage) -> URL {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
  let provider = CGDataProvider(data: Data(image.pixels) as CFData)!
  let cgImage = CGImage(
    width: image.width,
    height: image.height,
    bitsPerComponent: 8,
    bitsPerPixel: 8,
    bytesPerRow: image.width,
    space: CGColorSpaceCreateDeviceGray(),
    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
    provider: provider,
    decode: nil,
    shouldInterpolate: false,
    intent: .defaultIntent
  )!
  let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, cgImage, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
  CGImageDestinationFinalize(destination)
  return url
}

@Test("keeps a photo outline within the size and motion checks")
func keepsAPhotoOutlineWithinTheChecks() {
  let close = scaled(moved, width: 0.99, height: 0.99).map { $0 + SIMD2(2.0, 1.0) }
  let result = PhotoOutline.checkedOutline(refined(close), moved: moved)
  #expect(result.outcome == .refined)
  #expect(result.outline == close)
}

@Test(
  "refuses a photo outline more than 2% smaller than the moved outline, and keeps the moved outline",
  arguments: [(0.97, 1.0), (1.0, 0.97), (0.9, 0.9)]
)
func refusesASmallerPhotoOutline(width: Double, height: Double) {
  let result = PhotoOutline.checkedOutline(refined(scaled(moved, width: width, height: height)), moved: moved)
  #expect(result.outcome == .sizeRefused)
  #expect(result.outline == moved)
}

@Test("refuses a photo outline whose corners sit far from the moved outline, and keeps the moved outline")
func refusesAPhotoOutlineFarFromTheMovedOutline() {
  let shifted = moved.map { $0 + SIMD2(0.0, 12.0) }
  let result = PhotoOutline.checkedOutline(refined(shifted), moved: moved)
  #expect(result.outcome == .motionRefused)
  #expect(result.outline == moved)
}

@Test("keeps the moved outline when the edge refiner finds no outline on the photo")
func keepsTheMovedOutlineWithoutARefinedOutline() {
  let result = PhotoOutline.checkedOutline(.weakEdge(supportMin: 0.2), moved: moved)
  #expect(result.outcome == .notRefined)
  #expect(result.outline == moved)
}

@Test("keeps the held-still outline when the photo cannot be read")
func keepsTheHeldStillOutlineOnAnError() {
  let frame = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 185), orientation: .right)
  let outline = moved.map { SIMD2($0.x / 720.0, $0.y / 1280.0) }
  let missing = FileManager.default.temporaryDirectory.appendingPathComponent("missing-\(UUID().uuidString).jpg")
  let result = PhotoOutline.refine(
    photo: missing,
    frame: frame,
    frameOrientation: .right,
    frameIntrinsicMatrix: nil,
    heldStill: outline
  )
  #expect(result.outcome == .failed)
  #expect(result.outline == outline)
}

@Test("moves the held-still outline onto the card in a photo taken after the hand moved")
func refinesTheOutlineOnAPhotoAfterTheHandMoved() throws {
  let frame = makeBuffer(oriented: renderCard(card, width: 720, height: 1280, background: 185), orientation: .right)
  let photoCard = SyntheticCard(center: (card.center + SIMD2(14.0, -10.0)) * 2.0, width: card.width * 2.0, angle: card.angle + 0.01)
  let photo = writeJPEG(renderCard(photoCard, width: 1440, height: 2560, background: 185))
  defer { try? FileManager.default.removeItem(at: photo) }
  let truth = CardQuadGeometry.orderedClockwise(photoCard.corners)!.map { $0 / 2.0 }

  let result = PhotoOutline.refine(
    photo: photo,
    frame: frame,
    frameOrientation: .right,
    frameIntrinsicMatrix: nil,
    heldStill: moved.map { SIMD2($0.x / 720.0, $0.y / 1280.0) }
  )

  #expect(result.outcome == .refined)
  let error = maximumCornerError(result.outline.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }, truth)
  #expect(error < 1.5, "photo outline corner error \(error) px")
}

@Test("refines the outline of a tilted black-bordered card on the photo with the frame's intrinsic matrix")
func refinesATiltedCardWithTheIntrinsicMatrix() {
  let image = renderCard(TiltedCard(pose: tiltedTowardTheTop), width: 720, height: 1280, background: 185)
  let frame = makeBuffer(oriented: image, orientation: .right)
  let photo = writeJPEG(image)
  defer { try? FileManager.default.removeItem(at: photo) }
  let outerEdge = CardQuadGeometry.orderedClockwise(tiltedTowardTheTop.card())!
  func refined(frameIntrinsicMatrix: simd_float3x3?) -> PhotoOutline.Result {
    PhotoOutline.refine(
      photo: photo,
      frame: frame,
      frameOrientation: .right,
      frameIntrinsicMatrix: frameIntrinsicMatrix,
      heldStill: outerEdge.map { SIMD2($0.x / 720.0, $0.y / 1280.0) }
    )
  }

  let withMatrix = refined(frameIntrinsicMatrix: CameraPose.landscapeCameraMatrix)
  let withoutMatrix = refined(frameIntrinsicMatrix: nil)

  #expect(withMatrix.outcome == .refined)
  let error = maximumCornerError(withMatrix.outline.map { SIMD2($0.x * 720.0, $0.y * 1280.0) }, outerEdge)
  #expect(error < 1.5, "photo outline corner error \(error) px")
  #expect(withoutMatrix.outcome != .refined)
}
