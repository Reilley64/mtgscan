import CoreGraphics
import Foundation
import ImageIO
import simd

struct MTGOrientationTransform {
  let orientedWidth: Double
  let orientedHeight: Double
  private let a: Double
  private let b: Double
  private let c: Double
  private let d: Double
  private let tx: Double
  private let ty: Double

  init?(
    displayOrientation: CGImagePropertyOrientation,
    bufferWidth: Double,
    bufferHeight: Double
  ) {
    guard bufferWidth > 0, bufferHeight > 0 else {
      return nil
    }
    let swapsDimensions: Bool
    switch displayOrientation {
    case .up, .upMirrored, .down, .downMirrored:
      swapsDimensions = false
    case .leftMirrored, .right, .rightMirrored, .left:
      swapsDimensions = true
    @unknown default:
      return nil
    }
    let width = swapsDimensions ? bufferHeight : bufferWidth
    let height = swapsDimensions ? bufferWidth : bufferHeight
    orientedWidth = width
    orientedHeight = height

    switch displayOrientation {
    case .up:
      (a, b, c, d, tx, ty) = (1, 0, 0, 1, 0, 0)
    case .upMirrored:
      (a, b, c, d, tx, ty) = (-1, 0, 0, 1, width, 0)
    case .down:
      (a, b, c, d, tx, ty) = (-1, 0, 0, -1, width, height)
    case .downMirrored:
      (a, b, c, d, tx, ty) = (1, 0, 0, -1, 0, height)
    case .leftMirrored:
      (a, b, c, d, tx, ty) = (0, 1, 1, 0, 0, 0)
    case .right:
      (a, b, c, d, tx, ty) = (0, 1, -1, 0, 0, width)
    case .rightMirrored:
      (a, b, c, d, tx, ty) = (0, -1, -1, 0, height, width)
    case .left:
      (a, b, c, d, tx, ty) = (0, -1, 1, 0, height, 0)
    @unknown default:
      return nil
    }
  }

  @inline(__always)
  func bufferPoint(_ oriented: SIMD2<Double>) -> SIMD2<Double> {
    SIMD2(
      a * oriented.x + b * oriented.y + tx,
      c * oriented.x + d * oriented.y + ty
    )
  }
}

struct MTGLine {
  let point: SIMD2<Double>
  let direction: SIMD2<Double>

  var normal: SIMD2<Double> {
    SIMD2(-direction.y, direction.x)
  }

  func distance(to target: SIMD2<Double>) -> Double {
    simd_dot(normal, target - point)
  }

  func intersection(with other: MTGLine) -> SIMD2<Double>? {
    let determinant = direction.x * other.direction.y - direction.y * other.direction.x
    guard abs(determinant) > 0.000_001 else {
      return nil
    }
    let offset = other.point - point
    let distanceAlongSelf = (offset.x * other.direction.y - offset.y * other.direction.x)
      / determinant
    return point + distanceAlongSelf * direction
  }

  static func through(_ first: SIMD2<Double>, _ second: SIMD2<Double>) -> MTGLine? {
    let delta = second - first
    let length = simd_length(delta)
    guard length > 0.000_001, length.isFinite else {
      return nil
    }
    return MTGLine(point: first, direction: delta / length)
  }

  static func totalLeastSquares(_ points: [SIMD2<Double>]) -> MTGLine? {
    guard points.count >= 2 else {
      return nil
    }
    let centroid = points.reduce(SIMD2<Double>(0, 0), +) / Double(points.count)
    var sxx = 0.0
    var sxy = 0.0
    var syy = 0.0
    for point in points {
      let offset = point - centroid
      sxx += offset.x * offset.x
      sxy += offset.x * offset.y
      syy += offset.y * offset.y
    }
    let angle = 0.5 * atan2(2.0 * sxy, sxx - syy)
    guard angle.isFinite, sxx + syy > 0.000_001 else {
      return nil
    }
    return MTGLine(point: centroid, direction: SIMD2(cos(angle), sin(angle)))
  }
}

enum MTGCardQuadGeometry {
  static let cardAspectRatio = 63.0 / 88.0
  static let aspectRatioTolerance = 0.03
  static let minimumAreaRatio = 0.02

  struct Metrics {
    let areaRatio: Double
    let aspectRatio: Double
    let centerOffset: Double
    let shortSide: Double
  }

  static func orderedClockwise(_ points: [SIMD2<Double>]) -> [SIMD2<Double>]? {
    guard points.count == 4, points.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else {
      return nil
    }
    let centroid = points.reduce(SIMD2<Double>(0, 0), +) / 4.0
    let byAngle = points.sorted {
      atan2($0.y - centroid.y, $0.x - centroid.x) < atan2($1.y - centroid.y, $1.x - centroid.x)
    }
    guard let firstIndex = byAngle.indices.min(by: {
      byAngle[$0].x + byAngle[$0].y < byAngle[$1].x + byAngle[$1].y
    }) else {
      return nil
    }
    return (0 ..< 4).map { byAngle[(firstIndex + $0) % 4] }
  }

  static func isNondegenerateConvex(_ corners: [SIMD2<Double>], minimumEdge: Double) -> Bool {
    guard corners.count == 4 else {
      return false
    }
    var crossProductSign = 0.0
    for index in 0 ..< 4 {
      let current = corners[index]
      let next = corners[(index + 1) % 4]
      let following = corners[(index + 2) % 4]
      guard simd_length(next - current) > minimumEdge else {
        return false
      }
      let first = next - current
      let second = following - next
      let crossProduct = first.x * second.y - first.y * second.x
      guard abs(crossProduct) > 0.000_001 else {
        return false
      }
      if crossProductSign == 0.0 {
        crossProductSign = crossProduct
      } else if crossProductSign * crossProduct <= 0.0 {
        return false
      }
    }
    return true
  }

  static func isInside(_ corners: [SIMD2<Double>], width: Double, height: Double) -> Bool {
    corners.allSatisfy {
      $0.x.isFinite && $0.y.isFinite
        && $0.x >= 0.0 && $0.x <= width
        && $0.y >= 0.0 && $0.y <= height
    }
  }

  static func metrics(_ corners: [SIMD2<Double>], width: Double, height: Double) -> Metrics {
    let horizontal = (simd_length(corners[1] - corners[0]) + simd_length(corners[2] - corners[3]))
      / 2.0
    let vertical = (simd_length(corners[3] - corners[0]) + simd_length(corners[2] - corners[1]))
      / 2.0
    var twiceArea = 0.0
    for index in 0 ..< 4 {
      let current = corners[index]
      let next = corners[(index + 1) % 4]
      twiceArea += current.x * next.y - next.x * current.y
    }
    let centroid = corners.reduce(SIMD2<Double>(0, 0), +) / 4.0
    let centerOffset = hypot(
      (centroid.x / width - 0.5) * 2.0,
      (centroid.y / height - 0.5) * 2.0
    ) / sqrt(2.0)
    return Metrics(
      areaRatio: abs(twiceArea) / 2.0 / (width * height),
      aspectRatio: min(horizontal, vertical) / max(0.000_001, max(horizontal, vertical)),
      centerOffset: centerOffset,
      shortSide: min(horizontal, vertical)
    )
  }

  static func isCardShaped(_ metrics: Metrics) -> Bool {
    metrics.areaRatio.isFinite
      && metrics.areaRatio >= minimumAreaRatio
      && metrics.areaRatio <= 1.0
      && abs(metrics.aspectRatio - cardAspectRatio) <= aspectRatioTolerance
      && metrics.centerOffset.isFinite
      && (0.0 ... 1.0).contains(metrics.centerOffset)
  }
}
