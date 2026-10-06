import CoreGraphics
import Foundation
import simd

enum MTGCardRectangleGeometry {
  static let trialAspectRatioRange = 0.55 ... 0.90
  static let trialCenterOffsetMaximum = 0.35
  private static let closingTolerance: Float = 0.01

  struct Candidate {
    let topLeft: CGPoint
    let topRight: CGPoint
    let bottomRight: CGPoint
    let bottomLeft: CGPoint
    let areaRatio: Double
    let aspectRatio: Double
    let centerOffset: Double
  }

  static func acceptedLocalPoints(_ points: [simd_float2]) -> [simd_float2]? {
    let acceptedPoints: ArraySlice<simd_float2>

    switch points.count {
    case 4:
      acceptedPoints = points[0 ..< 4]
    case 5:
      guard isClosingDuplicate(points[0], points[4]) else {
        return nil
      }
      acceptedPoints = points[0 ..< 4]
    default:
      return nil
    }

    guard points.allSatisfy({
      $0.x.isFinite && $0.y.isFinite
        && (0.0 ... 1.0).contains(Double($0.x))
        && (0.0 ... 1.0).contains(Double($0.y))
    }) else {
      return nil
    }

    return Array(acceptedPoints)
  }

  static func candidate(
    localPoints: [simd_float2],
    roiX: Double,
    roiYUpperLeft: Double,
    roiWidth: Double,
    roiHeight: Double,
    orientedWidth: Double,
    orientedHeight: Double
  ) -> Candidate? {
    guard let acceptedPoints = acceptedLocalPoints(localPoints) else {
      return nil
    }
    let imageCorners = acceptedPoints.map {
      imagePoint(
        $0,
        roiX: roiX,
        roiYUpperLeft: roiYUpperLeft,
        roiWidth: roiWidth,
        roiHeight: roiHeight
      )
    }
    guard let corners = orderQuadrilateral(imageCorners) else {
      return nil
    }
    return candidate(
      corners: corners,
      orientedWidth: orientedWidth,
      orientedHeight: orientedHeight
    )
  }

  static func imagePoint(
    _ roiLocalPoint: simd_float2,
    roiX: Double,
    roiYUpperLeft: Double,
    roiWidth: Double,
    roiHeight: Double
  ) -> CGPoint {
    CGPoint(
      x: roiX + Double(roiLocalPoint.x) * roiWidth,
      y: roiYUpperLeft + (1.0 - Double(roiLocalPoint.y)) * roiHeight
    )
  }

  static func orderQuadrilateral(_ points: [CGPoint]) -> [CGPoint]? {
    guard points.count == 4 else {
      return nil
    }
    let byVerticalPosition = points.sorted {
      $0.y == $1.y ? $0.x < $1.x : $0.y < $1.y
    }
    let top = byVerticalPosition[0 ..< 2].sorted { $0.x < $1.x }
    let bottom = byVerticalPosition[2 ..< 4].sorted { $0.x < $1.x }
    return [top[0], top[1], bottom[1], bottom[0]]
  }

  private static func isClosingDuplicate(
    _ first: simd_float2,
    _ last: simd_float2
  ) -> Bool {
    abs(first.x - last.x) <= closingTolerance && abs(first.y - last.y) <= closingTolerance
  }

  private static func candidate(
    corners: [CGPoint],
    orientedWidth: Double,
    orientedHeight: Double
  ) -> Candidate? {
    guard corners.count == 4,
          corners.allSatisfy({
            $0.x.isFinite && $0.y.isFinite
              && (0.0 ... 1.0).contains($0.x)
              && (0.0 ... 1.0).contains($0.y)
          }),
          isNondegenerateConvexQuadrilateral(corners)
    else {
      return nil
    }

    let topLeft = corners[0]
    let topRight = corners[1]
    let bottomRight = corners[2]
    let bottomLeft = corners[3]
    let areaRatio = polygonArea(corners)
    let horizontalLength = (
      pixelDistance(topLeft, topRight, orientedWidth, orientedHeight)
        + pixelDistance(bottomLeft, bottomRight, orientedWidth, orientedHeight)
    ) / 2.0
    let verticalLength = (
      pixelDistance(topLeft, bottomLeft, orientedWidth, orientedHeight)
        + pixelDistance(topRight, bottomRight, orientedWidth, orientedHeight)
    ) / 2.0
    let aspectRatio = min(horizontalLength, verticalLength)
      / max(0.000_001, max(horizontalLength, verticalLength))
    let centerX = corners.reduce(0.0) { $0 + $1.x } / 4.0
    let centerY = corners.reduce(0.0) { $0 + $1.y } / 4.0
    let centerOffset = min(
      1.0,
      hypot((centerX - 0.5) * 2.0, (centerY - 0.5) * 2.0) / sqrt(2.0)
    )

    guard areaRatio.isFinite,
          areaRatio > 0.000_001,
          aspectRatio.isFinite,
          trialAspectRatioRange.contains(aspectRatio),
          centerOffset.isFinite,
          centerOffset <= trialCenterOffsetMaximum
    else {
      return nil
    }

    return Candidate(
      topLeft: topLeft,
      topRight: topRight,
      bottomRight: bottomRight,
      bottomLeft: bottomLeft,
      areaRatio: areaRatio,
      aspectRatio: aspectRatio,
      centerOffset: centerOffset
    )
  }

  private static func isNondegenerateConvexQuadrilateral(_ points: [CGPoint]) -> Bool {
    let minimumEdgeLength = 0.001
    var crossProductSign = 0.0

    for index in points.indices {
      let current = points[index]
      let next = points[(index + 1) % points.count]
      guard hypot(next.x - current.x, next.y - current.y) > minimumEdgeLength else {
        return false
      }

      let following = points[(index + 2) % points.count]
      let crossProduct = (next.x - current.x) * (following.y - next.y)
        - (next.y - current.y) * (following.x - next.x)
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

  private static func pixelDistance(
    _ first: CGPoint,
    _ second: CGPoint,
    _ width: Double,
    _ height: Double
  ) -> Double {
    hypot(
      Double(first.x - second.x) * width,
      Double(first.y - second.y) * height
    )
  }

  private static func polygonArea(_ points: [CGPoint]) -> Double {
    var twiceArea = 0.0
    for index in points.indices {
      let next = points[(index + 1) % points.count]
      twiceArea += Double(points[index].x * next.y - next.x * points[index].y)
    }
    return min(1.0, abs(twiceArea) / 2.0)
  }
}
