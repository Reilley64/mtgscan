import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd
import Vision

enum PhotoOutline {
  static let sizeShrinkMax = 0.02
  static let cornerMotionMax = 0.02

  enum Outcome: String, Sendable {
    case refined
    case sizeRefused = "size_refused"
    case motionRefused = "motion_refused"
    case notRefined = "not_refined"
    case failed
  }

  struct Result: Sendable {
    let outline: [SIMD2<Double>]
    let outcome: Outcome
  }

  static func refine(
    photo: URL,
    frame: CVPixelBuffer,
    frameOrientation: CGImagePropertyOrientation,
    frameIntrinsicMatrix: simd_float3x3?,
    heldStill: [SIMD2<Double>]
  ) -> Result {
    guard heldStill.count == 4,
          let frameTransform = OrientationTransform(
            displayOrientation: frameOrientation,
            bufferWidth: Double(CVPixelBufferGetWidth(frame)),
            bufferHeight: Double(CVPixelBufferGetHeight(frame)),
            bufferIntrinsicMatrix: frameIntrinsicMatrix.map(simd_double3x3.init)
          ),
          let image = PhotoLuma(photo: photo, frameTransform: frameTransform),
          let motion = cameraMotion(from: frame, orientation: frameOrientation, to: image)
    else {
      return Result(outline: heldStill, outcome: .failed)
    }
    let size = SIMD2(frameTransform.orientedWidth, frameTransform.orientedHeight)
    let moved = heldStill.map { motion($0 * size) }
    let refinement = image.withPlane { plane in
      CardEdgeRefiner.refine(proposal: moved, plane: plane, transform: image.transform)
    }
    let checked = checkedOutline(refinement, moved: moved)
    return Result(outline: checked.outline.map { $0 / size }, outcome: checked.outcome)
  }

  static func checkedOutline(_ refinement: CardEdgeRefiner.Outcome, moved: [SIMD2<Double>]) -> Result {
    guard case let .refined(corners, _, _, _, _) = refinement else {
      return Result(outline: moved, outcome: .notRefined)
    }
    let refinedSides = meanSideLengths(corners)
    let movedSides = meanSideLengths(moved)
    guard refinedSides.width >= (1.0 - sizeShrinkMax) * movedSides.width,
          refinedSides.height >= (1.0 - sizeShrinkMax) * movedSides.height
    else {
      return Result(outline: moved, outcome: .sizeRefused)
    }
    let limit = cornerMotionMax * min(movedSides.width, movedSides.height)
    guard zip(corners, moved).allSatisfy({ simd_distance($0, $1) <= limit }) else {
      return Result(outline: moved, outcome: .motionRefused)
    }
    return Result(outline: corners, outcome: .refined)
  }

  private static func meanSideLengths(_ corners: [SIMD2<Double>]) -> (width: Double, height: Double) {
    (
      width: (simd_distance(corners[0], corners[1]) + simd_distance(corners[3], corners[2])) / 2.0,
      height: (simd_distance(corners[0], corners[3]) + simd_distance(corners[1], corners[2])) / 2.0
    )
  }

  private static func cameraMotion(
    from frame: CVPixelBuffer,
    orientation: CGImagePropertyOrientation,
    to photo: PhotoLuma
  ) -> ((SIMD2<Double>) -> SIMD2<Double>)? {
    let request = VNHomographicImageRegistrationRequest(targetedCVPixelBuffer: frame, orientation: orientation, options: [:])
    do {
      try VNImageRequestHandler(cgImage: photo.image, orientation: .up, options: [:]).perform([request])
    } catch {
      return nil
    }
    guard let warp = (request.results?.first as? VNImageHomographicAlignmentObservation)?.warpTransform else {
      return nil
    }
    let matrix = simd_double3x3(warp)
    let height = Double(photo.height)
    return { point in
      let mapped = matrix * SIMD3(point.x, height - point.y, 1.0)
      return SIMD2(mapped.x / mapped.z, height - mapped.y / mapped.z)
    }
  }
}

private struct PhotoLuma {
  let width: Int
  let height: Int
  let image: CGImage
  let transform: OrientationTransform
  private let pixels: Data

  init?(photo: URL, frameTransform: OrientationTransform) {
    let width = Int(frameTransform.orientedWidth)
    let height = Int(frameTransform.orientedHeight)
    guard let source = CGImageSourceCreateWithURL(photo as CFURL, nil),
          let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(width, height),
          ] as CFDictionary),
          let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
          ),
          let transform = OrientationTransform(
            displayOrientation: .up,
            bufferWidth: Double(width),
            bufferHeight: Double(height),
            bufferIntrinsicMatrix: frameTransform.intrinsicMatrix
          )
    else {
      return nil
    }
    context.interpolationQuality = .high
    context.draw(decoded, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let image = context.makeImage(), let data = context.data else {
      return nil
    }
    self.width = width
    self.height = height
    self.image = image
    self.transform = transform
    pixels = Data(bytes: data, count: width * height)
  }

  func withPlane<T>(_ body: (LumaPlane) -> T) -> T {
    pixels.withUnsafeBytes { bytes in
      body(LumaPlane(
        base: bytes.bindMemory(to: UInt8.self).baseAddress!,
        width: width,
        height: height,
        bytesPerRow: width
      ))
    }
  }
}
