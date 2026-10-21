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
    heldStill: [SIMD2<Double>]
  ) -> Result {
    guard heldStill.count == 4,
          let frameTransform = OrientationTransform(
            displayOrientation: frameOrientation,
            bufferWidth: Double(CVPixelBufferGetWidth(frame)),
            bufferHeight: Double(CVPixelBufferGetHeight(frame))
          ),
          let image = PhotoLuma(photo: photo, width: Int(frameTransform.orientedWidth), height: Int(frameTransform.orientedHeight)),
          let motion = cameraMotion(from: frame, orientation: frameOrientation, to: image)
    else {
      return Result(outline: heldStill, outcome: .failed)
    }
    let size = SIMD2(frameTransform.orientedWidth, frameTransform.orientedHeight)
    let heldStillPixels = heldStill.map { $0 * size }
    let moved = heldStillPixels.map(motion)
    let refinement = image.withPlane { plane in
      CardEdgeRefiner.refine(proposal: moved, plane: plane, transform: image.transform, intrinsicMatrix: nil)
    }
    let chosen = chosen(refinement, moved: moved, heldStill: heldStillPixels)
    return Result(outline: chosen.outline.map { $0 / size }, outcome: chosen.outcome)
  }

  static func chosen(
    _ refinement: CardEdgeRefiner.Outcome,
    moved: [SIMD2<Double>],
    heldStill: [SIMD2<Double>]
  ) -> Result {
    guard case let .refined(corners, _, _, _, _) = refinement else {
      return Result(outline: heldStill, outcome: .notRefined)
    }
    let refinedSides = sides(corners)
    let movedSides = sides(moved)
    guard refinedSides.x >= (1.0 - sizeShrinkMax) * movedSides.x,
          refinedSides.y >= (1.0 - sizeShrinkMax) * movedSides.y
    else {
      return Result(outline: heldStill, outcome: .sizeRefused)
    }
    let limit = cornerMotionMax * min(movedSides.x, movedSides.y)
    guard zip(corners, moved).allSatisfy({ simd_distance($0, $1) <= limit }) else {
      return Result(outline: heldStill, outcome: .motionRefused)
    }
    return Result(outline: corners, outcome: .refined)
  }

  private static func sides(_ corners: [SIMD2<Double>]) -> SIMD2<Double> {
    SIMD2(
      (simd_distance(corners[0], corners[1]) + simd_distance(corners[3], corners[2])) / 2.0,
      (simd_distance(corners[0], corners[3]) + simd_distance(corners[1], corners[2])) / 2.0
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
    let matrix = simd_double3x3(
      SIMD3<Double>(warp.columns.0),
      SIMD3<Double>(warp.columns.1),
      SIMD3<Double>(warp.columns.2)
    )
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

  init?(photo: URL, width: Int, height: Int) {
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
          let transform = OrientationTransform(displayOrientation: .up, bufferWidth: Double(width), bufferHeight: Double(height))
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
