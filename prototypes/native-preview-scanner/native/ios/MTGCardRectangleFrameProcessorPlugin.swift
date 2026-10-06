import CoreMedia
import Foundation
import ImageIO
import simd
import UIKit
import VisionCamera

@objc(MTGCardRectangleFrameProcessorPlugin)
public final class MTGCardRectangleFrameProcessorPlugin: FrameProcessorPlugin {
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
      guard let orientation = Self.mapOrientation(frame.orientation) else {
        var output = MTGCardQuadDetector.Output()
        output.runtimeErrorCode = 1
        return Self.record(output, startedAt: startedAt, orientationCode: -1)
      }
      guard let pixelBuffer = CMSampleBufferGetImageBuffer(frame.buffer) else {
        var output = MTGCardQuadDetector.Output()
        output.runtimeErrorCode = 2
        return Self.record(output, startedAt: startedAt, orientationCode: orientation.code)
      }
      let output = MTGCardQuadDetector.detect(
        pixelBuffer: pixelBuffer,
        displayOrientation: orientation.display
      )
      return Self.record(output, startedAt: startedAt, orientationCode: orientation.code)
    }
  }

  private static func mapOrientation(
    _ frameOrientation: UIImage.Orientation
  ) -> (display: CGImagePropertyOrientation, code: Int)? {
    switch frameOrientation {
    case .up:
      return (.up, 0)
    case .down:
      return (.down, 1)
    case .left:
      return (.right, 2)
    case .right:
      return (.left, 3)
    case .upMirrored:
      return (.upMirrored, 4)
    case .downMirrored:
      return (.downMirrored, 5)
    case .leftMirrored:
      return (.leftMirrored, 6)
    case .rightMirrored:
      return (.rightMirrored, 7)
    @unknown default:
      return nil
    }
  }

  private static func record(
    _ output: MTGCardQuadDetector.Output,
    startedAt: TimeInterval,
    orientationCode: Int
  ) -> [String: Any] {
    let detected = output.refinementStatus == .refined && output.refined != nil
    let refined = detected ? output.refined : nil
    return [
      "detected": detected,
      "topLeft": pointRecord(refined?[0]),
      "topRight": pointRecord(refined?[1]),
      "bottomRight": pointRecord(refined?[2]),
      "bottomLeft": pointRecord(refined?[3]),
      "proposalDetected": output.proposal != nil,
      "proposalTopLeft": pointRecord(output.proposal?[0]),
      "proposalTopRight": pointRecord(output.proposal?[1]),
      "proposalBottomRight": pointRecord(output.proposal?[2]),
      "proposalBottomLeft": pointRecord(output.proposal?[3]),
      "confidence": output.confidence,
      "areaRatio": detected ? output.areaRatio : 0.0,
      "aspectRatio": detected ? output.aspectRatio : 0.0,
      "centerOffset": detected ? output.centerOffset : 1.0,
      "edgeSupportMin": output.edgeSupportMin,
      "shiftTop": detected ? output.shifts[0] : 0.0,
      "shiftRight": detected ? output.shifts[1] : 0.0,
      "shiftBottom": detected ? output.shifts[2] : 0.0,
      "shiftLeft": detected ? output.shifts[3] : 0.0,
      "refinementStatus": output.refinementStatus.rawValue,
      "proposalDurationMs": output.proposalDurationMs,
      "nativeDurationMs": MTGCardQuadDetector.elapsedMilliseconds(since: startedAt),
      "orientationCode": orientationCode,
      "runtimeErrorCode": output.runtimeErrorCode,
    ]
  }

  private static func pointRecord(_ point: SIMD2<Double>?) -> Any {
    guard let point else {
      return NSNull()
    }
    return ["x": point.x, "y": point.y]
  }
}
