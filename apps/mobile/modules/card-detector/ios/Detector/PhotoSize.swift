import CoreMedia
import ImageIO
import simd

enum PhotoSize {
  static let cardReadWidth = 1191.0
  static let cardReadHeight = 1664.0

  static func smallest(
    of sizes: [CMVideoDimensions],
    orientation: CGImagePropertyOrientation,
    readingCard outline: [SIMD2<Double>]
  ) -> CMVideoDimensions? {
    let ascending = sizes.sorted { $0.width < $1.width }
    return ascending.first { readsCard(outline, in: $0, orientation: orientation) } ?? ascending.last
  }

  private static func readsCard(
    _ outline: [SIMD2<Double>],
    in size: CMVideoDimensions,
    orientation: CGImagePropertyOrientation
  ) -> Bool {
    guard let photo = OrientationTransform(
      displayOrientation: orientation,
      bufferWidth: Double(size.width),
      bufferHeight: Double(size.height)
    ) else { return false }
    let corners = outline.map { SIMD2($0.x * photo.orientedWidth, $0.y * photo.orientedHeight) }
    let edges = corners.indices.map { simd_distance(corners[$0], corners[($0 + 1) % corners.count]) }
    let sides = [min(edges[0], edges[2]), min(edges[1], edges[3])].sorted()
    return sides[0] >= cardReadWidth && sides[1] >= cardReadHeight
  }
}
