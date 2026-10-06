import CoreMedia
import Foundation
import ImageIO
import UIKit
import Vision
import VisionCamera

@objc(MTGCardRectangleFrameProcessorPlugin)
public final class MTGCardRectangleFrameProcessorPlugin: FrameProcessorPlugin {
  private static let guideWidthFraction = 0.72
  private static let analysisMarginFraction = 0.08
  private static let cardAspectRatio = 63.0 / 88.0

  public override init(
    proxy: VisionCameraProxyHolder,
    options: [AnyHashable: Any]! = [:]
  ) {
    super.init(proxy: proxy, options: options)
  }

  public override func callback(
    _ frame: Frame,
    withArguments _: [AnyHashable: Any]?
  ) -> Any? {
    return autoreleasepool {
      let startedAt = ProcessInfo.processInfo.systemUptime
      let orientation = Self.mapOrientation(frame.orientation)

      guard let orientation else {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          orientationCode: -1,
          runtimeErrorCode: 1
        )
      }
      guard let pixelBuffer = CMSampleBufferGetImageBuffer(frame.buffer) else {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          orientationCode: orientation.code,
          runtimeErrorCode: 2
        )
      }

      let bufferWidth = Double(CVPixelBufferGetWidth(pixelBuffer))
      let bufferHeight = Double(CVPixelBufferGetHeight(pixelBuffer))
      let orientedWidth = orientation.swapsDimensions ? bufferHeight : bufferWidth
      let orientedHeight = orientation.swapsDimensions ? bufferWidth : bufferHeight
      guard orientedWidth > 0, orientedHeight > 0 else {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          orientationCode: orientation.code,
          runtimeErrorCode: 3
        )
      }

      let roiPixelWidth = orientedWidth * Self.guideWidthFraction
        * (1.0 + 2.0 * Self.analysisMarginFraction)
      let roiPixelHeight = roiPixelWidth / Self.cardAspectRatio
      let roiWidth = min(1.0, roiPixelWidth / orientedWidth)
      let roiHeight = min(1.0, roiPixelHeight / orientedHeight)
      let roiX = (1.0 - roiWidth) / 2.0
      let roiYUpperLeft = (1.0 - roiHeight) / 2.0
      let roiYVision = 1.0 - roiYUpperLeft - roiHeight

      let request = VNDetectContoursRequest()
      request.regionOfInterest = CGRect(
        x: roiX,
        y: roiYVision,
        width: roiWidth,
        height: roiHeight
      )
      request.maximumImageDimension = 256
      request.contrastAdjustment = 2.0
      request.detectsDarkOnLight = true

      let handler = VNImageRequestHandler(
        cvPixelBuffer: pixelBuffer,
        orientation: orientation.imagePropertyOrientation,
        options: [:]
      )
      do {
        try handler.perform([request])
      } catch {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          roiX: roiX,
          roiY: roiYUpperLeft,
          roiWidth: roiWidth,
          roiHeight: roiHeight,
          orientationCode: orientation.code,
          runtimeErrorCode: 4
        )
      }

      guard let observation = request.results?.first,
            observation.confidence.isFinite,
            (0.0 ... 1.0).contains(Double(observation.confidence))
      else {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          roiX: roiX,
          roiY: roiYUpperLeft,
          roiWidth: roiWidth,
          roiHeight: roiHeight,
          orientationCode: orientation.code,
          runtimeErrorCode: 0
        )
      }

      var bestCandidate: MTGCardRectangleGeometry.Candidate?
      let contourCount = min(observation.contourCount, 32)
      for index in 0 ..< contourCount {
        do {
          let contour = try observation.contour(at: index)
          let approximation = try contour.polygonApproximation(epsilon: 0.02)
          guard let candidate = MTGCardRectangleGeometry.candidate(
            localPoints: approximation.normalizedPoints,
            roiX: roiX,
            roiYUpperLeft: roiYUpperLeft,
            roiWidth: roiWidth,
            roiHeight: roiHeight,
            orientedWidth: orientedWidth,
            orientedHeight: orientedHeight
          ) else {
            continue
          }

          if bestCandidate == nil || candidate.areaRatio > bestCandidate!.areaRatio {
            bestCandidate = candidate
          }
        } catch {
          continue
        }
      }

      guard let bestCandidate else {
        return Self.emptyResult(
          nativeDurationMs: Self.elapsedMilliseconds(since: startedAt),
          roiX: roiX,
          roiY: roiYUpperLeft,
          roiWidth: roiWidth,
          roiHeight: roiHeight,
          orientationCode: orientation.code,
          runtimeErrorCode: 0
        )
      }

      return [
        "detected": true,
        "topLeft": Self.pointRecord(bestCandidate.topLeft),
        "topRight": Self.pointRecord(bestCandidate.topRight),
        "bottomRight": Self.pointRecord(bestCandidate.bottomRight),
        "bottomLeft": Self.pointRecord(bestCandidate.bottomLeft),
        "confidence": Double(observation.confidence),
        "areaRatio": bestCandidate.areaRatio,
        "aspectRatio": bestCandidate.aspectRatio,
        "centerOffset": bestCandidate.centerOffset,
        "centerScore": 1.0 - bestCandidate.centerOffset,
        "nativeDurationMs": Self.elapsedMilliseconds(since: startedAt),
        "roiX": roiX,
        "roiY": roiYUpperLeft,
        "roiWidth": roiWidth,
        "roiHeight": roiHeight,
        "orientationCode": orientation.code,
        "runtimeErrorCode": 0,
      ] as [String: Any]
    }
  }

  private static func mapOrientation(
    _ orientation: UIImage.Orientation
  ) -> (
    imagePropertyOrientation: CGImagePropertyOrientation,
    code: Int,
    swapsDimensions: Bool
  )? {
    switch orientation {
    case .up:
      return (.up, 0, false)
    case .down:
      return (.down, 1, false)
    case .left:
      return (.left, 2, true)
    case .right:
      return (.right, 3, true)
    case .upMirrored:
      return (.upMirrored, 4, false)
    case .downMirrored:
      return (.downMirrored, 5, false)
    case .leftMirrored:
      return (.leftMirrored, 6, true)
    case .rightMirrored:
      return (.rightMirrored, 7, true)
    @unknown default:
      return nil
    }
  }

  private static func pointRecord(_ point: CGPoint) -> [String: Double] {
    return ["x": point.x, "y": point.y]
  }

  private static func elapsedMilliseconds(since startedAt: TimeInterval) -> Double {
    return max(0.0, (ProcessInfo.processInfo.systemUptime - startedAt) * 1_000.0)
  }

  private static func emptyResult(
    nativeDurationMs: Double,
    roiX: Double = 0.0,
    roiY: Double = 0.0,
    roiWidth: Double = 0.0,
    roiHeight: Double = 0.0,
    orientationCode: Int,
    runtimeErrorCode: Int
  ) -> [String: Any] {
    return [
      "detected": false,
      "topLeft": NSNull(),
      "topRight": NSNull(),
      "bottomRight": NSNull(),
      "bottomLeft": NSNull(),
      "confidence": 0.0,
      "areaRatio": 0.0,
      "aspectRatio": 0.0,
      "centerOffset": 1.0,
      "centerScore": 0.0,
      "nativeDurationMs": nativeDurationMs,
      "roiX": roiX,
      "roiY": roiY,
      "roiWidth": roiWidth,
      "roiHeight": roiHeight,
      "orientationCode": orientationCode,
      "runtimeErrorCode": runtimeErrorCode,
    ]
  }
}
