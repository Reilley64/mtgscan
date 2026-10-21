import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import os
import simd

// Diagnostic build only (diag/493-device): records what the detector and photo refinement saw on the device.
final class DetectorDebug: @unchecked Sendable {
  static let shared = DetectorDebug()
  private static let log = Logger(subsystem: "dev.reilley.mtgscan", category: "card-detector")
  private static let frameInterval = 1.0
  private static let framesMax = 300
  private static let stableMotionMax = 0.04
  private static let dwellSeconds = 0.4

  private struct Window {
    var startedAt: Double?
    var frames = 0
    var proposals = 0
    var refined = 0
    var detected = 0
    var stable = 0
    var longestHoldMs = 0.0
    var diagnoses: [String: Int] = [:]
    var presentFailures: [String: Int] = [:]
    var proposalAspectOnCard: [Double] = []
    var last: [String: Any] = [:]
  }

  private let lock = NSLock()
  private let writeQueue = DispatchQueue(label: "dev.reilley.mtgscan.detector-debug", qos: .utility)
  private let runStamp: String
  private let runDirectory: URL
  private let photosDirectory: URL
  private var photoCount = 0
  private var savedFrames = 0
  private var lastFrameSavedAt = -Double.infinity
  private var loggedFirstFrame = false
  private var window = Window()
  private var previousCorners: [SIMD2<Double>]?
  private var holdStartedAt: Double?

  private init() {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    runStamp = formatter.string(from: Date())
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    runDirectory = documents.appendingPathComponent("detector-debug/\(runStamp)")
    photosDirectory = documents.appendingPathComponent("photo-outline-debug")
    try? FileManager.default.createDirectory(at: runDirectory, withIntermediateDirectories: true)
    try? FileManager.default.createDirectory(at: photosDirectory, withIntermediateDirectories: true)
  }

  // MARK: camera

  func cameraConfigured(_ info: [String: Any]) {
    let text = Self.jsonText(info)
    Self.log.info("[DEBUG-493] camera configured \(text, privacy: .public)")
    write(Data(text.utf8), to: runDirectory.appendingPathComponent("camera.json"))
  }

  // MARK: frames

  func observe(
    sampleBuffer: CMSampleBuffer,
    connection: AVCaptureConnection,
    pixelBuffer: CVPixelBuffer,
    intrinsicMatrix: simd_float3x3?,
    output: CardQuadDetector.Output,
    sample: DetectionSample,
    seconds: Double
  ) {
    let bufferWidth = Double(CVPixelBufferGetWidth(pixelBuffer))
    let bufferHeight = Double(CVPixelBufferGetHeight(pixelBuffer))
    if !loggedFirstFrame {
      loggedFirstFrame = true
      let info: [String: Any] = [
        "bufferWidth": bufferWidth,
        "bufferHeight": bufferHeight,
        "pixelFormat": CVPixelBufferGetPixelFormatType(pixelBuffer),
        "planes": Self.planes(pixelBuffer),
        "intrinsicMatrixRows": intrinsicMatrix.map(Self.rows) ?? NSNull(),
        "connection": Self.connectionInfo(connection),
        "sampleAttachments": CMCopyDictionaryOfAttachments(
          allocator: nil,
          target: sampleBuffer,
          attachmentMode: kCMAttachmentMode_ShouldPropagate
        ).map { $0 as NSDictionary } ?? NSNull(),
        "pixelBufferAttachments": CVBufferCopyAttachments(pixelBuffer, .shouldPropagate).map { $0 as NSDictionary } ?? NSNull(),
        "formatExtensions": CMSampleBufferGetFormatDescription(sampleBuffer)
          .flatMap { CMFormatDescriptionGetExtensions($0) }.map { $0 as NSDictionary } ?? NSNull(),
      ]
      let text = Self.jsonText(info)
      Self.log.info("[DEBUG-493] first frame \(text, privacy: .public)")
      write(Data(text.utf8), to: runDirectory.appendingPathComponent("first-frame.json"))
    }

    let withMatrix = OrientationTransform(
      displayOrientation: CameraSession.displayOrientation,
      bufferWidth: bufferWidth,
      bufferHeight: bufferHeight,
      bufferIntrinsicMatrix: intrinsicMatrix.map(simd_double3x3.init)
    )!
    let size = SIMD2(withMatrix.orientedWidth, withMatrix.orientedHeight)
    let proposalAspects = output.proposal.map { Self.aspects($0.map { $0 * size }, withMatrix) }
    let refinedAspects = output.refined.map { Self.aspects($0.map { $0 * size }, withMatrix) }

    let corners = sample.corners?.map { $0 * size }
    let motion = Self.quadMotion(previousCorners, corners)
    previousCorners = corners
    let stable = motion.map { $0 <= Self.stableMotionMax } ?? false
    if sample.detected, stable {
      holdStartedAt = holdStartedAt ?? seconds
    } else {
      holdStartedAt = nil
    }
    let holdMs = holdStartedAt.map { (seconds - $0) * 1_000.0 } ?? 0.0

    var presentFailures: [String] = []
    if output.refined != nil {
      if output.confidence < DetectionSample.confidenceMin { presentFailures.append("confidence") }
      if !DetectionSample.areaRatios.contains(output.areaRatio) { presentFailures.append("area") }
      if output.edgeSupportMin < DetectionSample.edgeSupportMin { presentFailures.append("edge_support") }
    }

    if window.startedAt == nil { window.startedAt = seconds }
    window.frames += 1
    if output.proposal != nil { window.proposals += 1 }
    if output.refined != nil { window.refined += 1 }
    if sample.detected { window.detected += 1 }
    if sample.detected, stable { window.stable += 1 }
    window.longestHoldMs = max(window.longestHoldMs, holdMs)
    window.diagnoses[output.diagnosis, default: 0] += 1
    for failure in presentFailures { window.presentFailures[failure, default: 0] += 1 }
    if let onCard = proposalAspects?.onCard { window.proposalAspectOnCard.append(onCard) }

    let record: [String: Any] = [
      "seconds": seconds,
      "bufferWidth": bufferWidth,
      "bufferHeight": bufferHeight,
      "intrinsicMatrixRows": intrinsicMatrix.map(Self.rows) ?? NSNull(),
      "diagnosis": output.diagnosis,
      "confidence": output.confidence,
      "areaRatio": output.areaRatio,
      "aspectRatio": output.aspectRatio,
      "edgeSupportMin": output.edgeSupportMin,
      "proposal": Self.points(output.proposal),
      "refined": Self.points(output.refined),
      "proposalAspectOnCard": proposalAspects?.onCard ?? NSNull(),
      "proposalAspectInFrame": proposalAspects?.inFrame ?? NSNull(),
      "refinedAspectOnCard": refinedAspects?.onCard ?? NSNull(),
      "refinedAspectInFrame": refinedAspects?.inFrame ?? NSNull(),
      "detected": sample.detected,
      "presentFailures": presentFailures,
      "motion": motion ?? NSNull(),
      "holdMs": holdMs,
    ]
    window.last = record

    if seconds - lastFrameSavedAt >= Self.frameInterval, savedFrames < Self.framesMax {
      lastFrameSavedAt = seconds
      savedFrames += 1
      let index = savedFrames
      let packed = Self.packedPlanes(pixelBuffer)
      var saved = record
      saved["frame"] = "frame-\(index).nv12.zlib"
      let line = Self.jsonText(saved, pretty: false) + "\n"
      writeQueue.async { [runDirectory] in
        if let packed, let compressed = try? (packed as NSData).compressed(using: .zlib) {
          try? (compressed as Data).write(to: runDirectory.appendingPathComponent("frame-\(index).nv12.zlib"))
        }
        Self.append(Data(line.utf8), to: runDirectory.appendingPathComponent("frames.jsonl"))
      }
    }

    if let startedAt = window.startedAt, seconds - startedAt >= 1.0 {
      let aspects = window.proposalAspectOnCard
      let matrix = intrinsicMatrix.map { "fx \($0[0][0]) fy \($0[1][1]) cx \($0[2][0]) cy \($0[2][1])" } ?? "none"
      let summary = "[DEBUG-493] second: frames \(window.frames), proposals \(window.proposals), refined \(window.refined), detected \(window.detected), stable \(window.stable), longest hold \(Int(window.longestHoldMs)) ms; diagnoses \(window.diagnoses); present failures \(window.presentFailures); proposal aspect on card min \(aspects.min() ?? .nan) max \(aspects.max() ?? .nan); last \(Self.jsonText(window.last, pretty: false)); K \(matrix)"
      Self.log.info("\(summary, privacy: .public)")
      window = Window()
    }
  }

  // MARK: photos

  struct PhotoRecord {
    var requestHostSeconds = 0.0
    var keptFrameSeconds: [Double] = []
    var chosenFrameSeconds: Double?
  }

  func photo(
    record: PhotoRecord,
    photoURL: URL,
    photoSeconds: Double,
    photoInfo: Data,
    times: PhotoTimes,
    frame: CVPixelBuffer?,
    frameIntrinsicMatrix: simd_float3x3?,
    heldStill: [SIMD2<Double>],
    result: PhotoOutline.Result?,
    durationMs: Double
  ) {
    let index: Int = lock.withLock {
      photoCount += 1
      return photoCount
    }
    let directory = photosDirectory.appendingPathComponent("\(runStamp)-\(index)")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? FileManager.default.copyItem(at: photoURL, to: directory.appendingPathComponent("photo.jpg"))
    var frameInfo: [String: Any] = [:]
    if let frame {
      frameInfo = [
        "bufferWidth": CVPixelBufferGetWidth(frame),
        "bufferHeight": CVPixelBufferGetHeight(frame),
        "pixelFormat": CVPixelBufferGetPixelFormatType(frame),
        "planes": Self.planes(frame),
        "intrinsicMatrixRows": frameIntrinsicMatrix.map(Self.rows) ?? NSNull(),
        "file": "frame.nv12.zlib",
      ]
      if let packed = Self.packedPlanes(frame) {
        if let compressed = try? (packed as NSData).compressed(using: .zlib) {
          try? (compressed as Data).write(to: directory.appendingPathComponent("frame.nv12.zlib"))
        }
        let width = CVPixelBufferGetWidth(frame)
        let height = CVPixelBufferGetHeight(frame)
        if let png = Self.lumaPNG(packed.prefix(width * height), width: width, height: height) {
          try? png.write(to: directory.appendingPathComponent("frame-luma.png"))
        }
      }
    }
    if let png = result?.debug?.thumbnailPNG {
      try? png.write(to: directory.appendingPathComponent("thumbnail.png"))
    }
    let debug = result?.debug
    var debugInfo: [String: Any] = [:]
    debugInfo["frameWidth"] = debug?.frameWidth
    debugInfo["frameHeight"] = debug?.frameHeight
    debugInfo["orientedIntrinsicMatrix"] = debug?.orientedIntrinsicMatrix
    debugInfo["warpRowMajor"] = debug?.warp
    debugInfo["moved"] = Self.points(debug?.moved)
    debugInfo["refinement"] = debug?.refinement
    debugInfo["refinedCorners"] = Self.points(debug?.refinedCorners)
    debugInfo["refinementAtHeldStill"] = debug?.refinementAtHeldStill
    debugInfo["refinedCornersAtHeldStill"] = Self.points(debug?.refinedCornersAtHeldStill)
    debugInfo["thumbnailWidth"] = debug?.thumbnailWidth
    debugInfo["thumbnailHeight"] = debug?.thumbnailHeight
    var json: [String: Any] = [:]
    json["index"] = index
    json["outcome"] = result?.outcome.rawValue ?? "no_frame"
    json["durationMs"] = durationMs
    json["requestHostSeconds"] = record.requestHostSeconds
    json["keptFrameSeconds"] = record.keptFrameSeconds
    json["chosenFrameSeconds"] = record.chosenFrameSeconds
    json["photoSeconds"] = photoSeconds
    json["photoAfterFrameMs"] = record.chosenFrameSeconds.map { (photoSeconds - $0) * 1_000.0 }
    json["photoAfterRequestMs"] = (photoSeconds - record.requestHostSeconds) * 1_000.0
    json["wallClockMs"] = ["received": times.receivedAt, "captured": times.capturedAt, "processed": times.processedAt, "saved": times.savedAt]
    json["heldStill"] = Self.points(heldStill)
    json["outline"] = Self.points(result?.outline)
    json["frame"] = frameInfo
    json["photo"] = (try? JSONSerialization.jsonObject(with: photoInfo)) ?? NSNull()
    json["debug"] = debugInfo
    let text = Self.jsonText(json)
    try? Data(text.utf8).write(to: directory.appendingPathComponent("record.json"))
    Self.log.info("[DEBUG-493] photo \(index, privacy: .public) dumped to \(directory.lastPathComponent, privacy: .public): \(Self.jsonText(debugInfo, pretty: false), privacy: .public)")
  }

  // MARK: helpers

  static func photoInfo(_ photo: AVCapturePhoto) -> Data {
    let settings = photo.resolvedSettings
    var info: [String: Any] = [
      "timestampSeconds": photo.timestamp.seconds,
      "photoDimensions": [settings.photoDimensions.width, settings.photoDimensions.height],
      "previewDimensions": [settings.previewDimensions.width, settings.previewDimensions.height],
      "photoProcessingTimeRangeSeconds": [settings.photoProcessingTimeRange.start.seconds, settings.photoProcessingTimeRange.duration.seconds],
      "expectedPhotoCount": settings.expectedPhotoCount,
      "metadata": photo.metadata as NSDictionary,
    ]
    if let calibration = photo.cameraCalibrationData {
      info["calibration"] = [
        "intrinsicMatrixRows": rows(calibration.intrinsicMatrix),
        "referenceDimensions": [calibration.intrinsicMatrixReferenceDimensions.width, calibration.intrinsicMatrixReferenceDimensions.height],
        "pixelSize": calibration.pixelSize,
        "lensDistortionCenter": [calibration.lensDistortionCenter.x, calibration.lensDistortionCenter.y],
      ]
    }
    return (try? JSONSerialization.data(withJSONObject: sanitized(info))) ?? Data()
  }

  static func connectionInfo(_ connection: AVCaptureConnection?) -> Any {
    guard let connection else { return NSNull() }
    return [
      "preferredVideoStabilizationMode": connection.preferredVideoStabilizationMode.rawValue,
      "activeVideoStabilizationMode": connection.activeVideoStabilizationMode.rawValue,
      "videoRotationAngle": connection.videoRotationAngle,
      "isVideoMirrored": connection.isVideoMirrored,
      "isCameraIntrinsicMatrixDeliverySupported": connection.isCameraIntrinsicMatrixDeliverySupported,
      "isCameraIntrinsicMatrixDeliveryEnabled": connection.isCameraIntrinsicMatrixDeliveryEnabled,
    ] as [String: Any]
  }

  static func formatInfo(_ format: AVCaptureDevice.Format) -> [String: Any] {
    let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    return [
      "description": format.description,
      "dimensions": [dimensions.width, dimensions.height],
      "videoFieldOfView": format.videoFieldOfView,
      "geometricDistortionCorrectedVideoFieldOfView": format.geometricDistortionCorrectedVideoFieldOfView,
      "isVideoBinned": format.isVideoBinned,
      "supportedMaxPhotoDimensions": format.supportedMaxPhotoDimensions.map { [$0.width, $0.height] },
      "stabilizationSupported": [
        "standard": format.isVideoStabilizationModeSupported(.standard),
        "cinematic": format.isVideoStabilizationModeSupported(.cinematic),
        "auto": format.isVideoStabilizationModeSupported(.auto),
      ],
    ]
  }

  private static func aspects(_ corners: [SIMD2<Double>], _ withMatrix: OrientationTransform) -> (onCard: Double?, inFrame: Double) {
    let horizontal = (simd_distance(corners[0], corners[1]) + simd_distance(corners[3], corners[2])) / 2.0
    let vertical = (simd_distance(corners[0], corners[3]) + simd_distance(corners[1], corners[2])) / 2.0
    return (
      withMatrix.intrinsicMatrix.map { CardQuadGeometry.aspectRatioOnCard(corners, intrinsicMatrix: $0) },
      min(horizontal, vertical) / max(horizontal, vertical)
    )
  }

  private static func quadMotion(_ previous: [SIMD2<Double>]?, _ current: [SIMD2<Double>]?) -> Double? {
    guard let previous, let current else { return nil }
    let shortSide = min(
      (simd_distance(current[0], current[1]) + simd_distance(current[3], current[2])) / 2.0,
      (simd_distance(current[0], current[3]) + simd_distance(current[1], current[2])) / 2.0
    )
    guard shortSide > 0 else { return nil }
    return zip(previous, current).map { simd_distance($0, $1) }.max()! / shortSide
  }

  private static func planes(_ buffer: CVPixelBuffer) -> [[Int]] {
    (0 ..< CVPixelBufferGetPlaneCount(buffer)).map {
      [CVPixelBufferGetWidthOfPlane(buffer, $0), CVPixelBufferGetHeightOfPlane(buffer, $0), CVPixelBufferGetBytesPerRowOfPlane(buffer, $0)]
    }
  }

  // Y plane rows then CbCr plane rows, without row padding.
  private static func packedPlanes(_ buffer: CVPixelBuffer) -> Data? {
    guard CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    var data = Data()
    for plane in 0 ..< CVPixelBufferGetPlaneCount(buffer) {
      guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, plane) else { return nil }
      let rowBytes = CVPixelBufferGetWidthOfPlane(buffer, plane) * (plane == 0 ? 1 : 2)
      let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, plane)
      for row in 0 ..< CVPixelBufferGetHeightOfPlane(buffer, plane) {
        data.append(base.advanced(by: row * stride).assumingMemoryBound(to: UInt8.self), count: rowBytes)
      }
    }
    return data
  }

  private static func lumaPNG(_ luma: Data, width: Int, height: Int) -> Data? {
    guard let provider = CGDataProvider(data: Data(luma) as CFData),
          let image = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 8,
            bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
          )
    else { return nil }
    return PhotoOutline.pngData(image)
  }

  static func rows(_ matrix: simd_float3x3) -> [[Double]] {
    (0 ..< 3).map { row in (0 ..< 3).map { column in Double(matrix[column][row]) } }
  }

  private static func points(_ corners: [SIMD2<Double>]?) -> Any {
    corners.map { $0.map { [$0.x, $0.y] } } ?? NSNull()
  }

  private static func sanitized(_ value: Any) -> Any {
    switch value {
    case let number as NSNumber:
      return number.doubleValue.isFinite ? number : NSNull()
    case let string as String:
      return string
    case is NSNull:
      return value
    case let data as Data:
      return "<\(data.count) bytes: \(data.prefix(64).map { String(format: "%02x", $0) }.joined())>"
    case let array as [Any]:
      return array.map(sanitized)
    case let dictionary as [String: Any]:
      return dictionary.mapValues(sanitized)
    case let dictionary as NSDictionary:
      var result: [String: Any] = [:]
      for (key, item) in dictionary {
        result[String(describing: key)] = sanitized(item)
      }
      return result
    default:
      return String(describing: value)
    }
  }

  private static func jsonText(_ value: Any, pretty: Bool = true) -> String {
    let options: JSONSerialization.WritingOptions = pretty ? [.sortedKeys, .prettyPrinted] : [.sortedKeys]
    guard let data = try? JSONSerialization.data(withJSONObject: sanitized(value), options: options) else {
      return "\"unserializable\""
    }
    return String(decoding: data, as: UTF8.self)
  }

  private func write(_ data: Data, to url: URL) {
    writeQueue.async { try? data.write(to: url) }
  }

  private static func append(_ data: Data, to url: URL) {
    if let handle = try? FileHandle(forWritingTo: url) {
      handle.seekToEndOfFile()
      handle.write(data)
      try? handle.close()
    } else {
      try? data.write(to: url)
    }
  }
}
