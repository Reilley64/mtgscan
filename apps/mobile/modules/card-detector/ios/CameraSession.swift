import AVFoundation
import CoreMedia
import ImageIO
import os
import simd

enum PhotoFailure: String, Error {
  case cameraNotRunning = "camera_not_running"
  case noCard = "no_card"
  case unreadablePhoto = "unreadable_photo"
}

struct CapturedPhoto: Sendable {
  let url: URL
  let outline: [SIMD2<Double>]
}

final class CameraSession: NSObject, @unchecked Sendable {
  static let displayOrientation = CGImagePropertyOrientation.right
  static let analysisInterval = 0.19
  static let videoDimensions = (width: Int32(1280), height: Int32(720))

  let session = AVCaptureSession()
  private let onSample: @Sendable (DetectionSample) -> Void
  private let sessionQueue = DispatchQueue(label: "dev.reilley.mtgscan.camera")
  private let analysisQueue = DispatchQueue(label: "dev.reilley.mtgscan.detector")
  private let videoOutput = AVCaptureVideoDataOutput()
  private let photoOutput = AVCapturePhotoOutput()
  private let latestOutline = OSAllocatedUnfairLock<[SIMD2<Double>]?>(initialState: nil)
  private var configured = false
  private var lastAnalyzedAt = CMTime.invalid
  private var photoCaptures: [Int64: PhotoCapture] = [:]

  init(onSample: @escaping @Sendable (DetectionSample) -> Void) {
    self.onSample = onSample
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(sessionFailed),
      name: AVCaptureSession.runtimeErrorNotification,
      object: session
    )
  }

  func setRunning(_ running: Bool) {
    sessionQueue.async { [self] in
      if running {
        guard configured || configure() else {
          onSample(DetectionSample(failure: .cameraFailed, sampledAtMs: Self.nowMs()))
          return
        }
        if !session.isRunning {
          session.startRunning()
        }
      } else {
        latestOutline.withLock { $0 = nil }
        if session.isRunning {
          session.stopRunning()
        }
      }
    }
  }

  func takePhoto(completion: @escaping @Sendable (Result<CapturedPhoto, PhotoFailure>) -> Void) {
    guard let outline = latestOutline.withLock({ $0 }) else {
      completion(.failure(.noCard))
      return
    }
    sessionQueue.async { [self] in
      guard session.isRunning else {
        completion(.failure(.cameraNotRunning))
        return
      }
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      settings.maxPhotoDimensions = photoOutput.maxPhotoDimensions
      settings.flashMode = .off
      settings.photoQualityPrioritization = .balanced
      let id = settings.uniqueID
      let capture = PhotoCapture { [weak self] result in
        if let self {
          sessionQueue.async { self.photoCaptures[id] = nil }
        }
        completion(result.map { CapturedPhoto(url: $0, outline: outline) })
      }
      photoCaptures[id] = capture
      photoOutput.capturePhoto(with: settings, delegate: capture)
    }
  }

  static func backCamera() -> AVCaptureDevice? {
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  private func configure() -> Bool {
    guard let device = Self.backCamera(),
          let format = Self.analysisFormat(of: device),
          let photoDimensions = Self.largestPhotoDimensions(of: format),
          let input = try? AVCaptureDeviceInput(device: device)
    else {
      return false
    }
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    guard session.canAddInput(input), session.canAddOutput(videoOutput), session.canAddOutput(photoOutput) else {
      return false
    }
    session.addInput(input)
    session.addOutput(videoOutput)
    session.addOutput(photoOutput)
    do {
      try device.lockForConfiguration()
      device.activeFormat = format
      if device.isFocusModeSupported(.continuousAutoFocus) {
        device.focusMode = .continuousAutoFocus
      }
      device.unlockForConfiguration()
    } catch {
      return false
    }
    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: analysisQueue)
    photoOutput.maxPhotoDimensions = photoDimensions
    photoOutput.maxPhotoQualityPrioritization = .balanced
    if let connection = photoOutput.connection(with: .video), connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
    configured = true
    return true
  }

  private static func analysisFormat(of device: AVCaptureDevice) -> AVCaptureDevice.Format? {
    device.formats
      .filter { format in
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        return dimensions.width == videoDimensions.width
          && dimensions.height == videoDimensions.height
          && CMFormatDescriptionGetMediaSubType(format.formatDescription)
            == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
          && largestPhotoDimensions(of: format) != nil
      }
      .max { photoArea($0) < photoArea($1) }
  }

  private static func largestPhotoDimensions(of format: AVCaptureDevice.Format) -> CMVideoDimensions? {
    format.supportedMaxPhotoDimensions
      .filter { $0.width * videoDimensions.height == $0.height * videoDimensions.width }
      .max { $0.width < $1.width }
  }

  private static func photoArea(_ format: AVCaptureDevice.Format) -> Int32 {
    guard let dimensions = largestPhotoDimensions(of: format) else { return 0 }
    return dimensions.width * dimensions.height
  }

  private static func nowMs() -> Double {
    CMClockGetTime(CMClockGetHostTimeClock()).seconds * 1_000.0
  }

  @objc private func sessionFailed() {
    onSample(DetectionSample(failure: .cameraFailed, sampledAtMs: Self.nowMs()))
  }
}

extension CameraSession: AVCaptureVideoDataOutputSampleBufferDelegate {
  func captureOutput(
    _: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from _: AVCaptureConnection
  ) {
    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if lastAnalyzedAt.isValid, (time - lastAnalyzedAt).seconds < Self.analysisInterval {
      return
    }
    lastAnalyzedAt = time
    let sampledAtMs = time.seconds * 1_000.0
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
          let transform = OrientationTransform(
            displayOrientation: Self.displayOrientation,
            bufferWidth: Double(CVPixelBufferGetWidth(pixelBuffer)),
            bufferHeight: Double(CVPixelBufferGetHeight(pixelBuffer))
          )
    else {
      onSample(DetectionSample(failure: .unreadableFrame, sampledAtMs: sampledAtMs))
      return
    }
    let startedAt = ProcessInfo.processInfo.systemUptime
    let output = CardQuadDetector.detect(pixelBuffer: pixelBuffer, displayOrientation: Self.displayOrientation)
    let sample = DetectionSample(
      output: output,
      transform: transform,
      nativeDurationMs: CardQuadDetector.elapsedMilliseconds(since: startedAt),
      sampledAtMs: sampledAtMs
    )
    if let corners = sample.corners {
      latestOutline.withLock { $0 = corners }
    }
    onSample(sample)
  }
}

private final class PhotoCapture: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
  private let completion: @Sendable (Result<URL, PhotoFailure>) -> Void

  init(completion: @escaping @Sendable (Result<URL, PhotoFailure>) -> Void) {
    self.completion = completion
  }

  func photoOutput(_: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("scan-\(UUID().uuidString).jpg")
    guard error == nil, let data = photo.fileDataRepresentation(), (try? data.write(to: url)) != nil else {
      completion(.failure(.unreadablePhoto))
      return
    }
    completion(.success(url))
  }
}
