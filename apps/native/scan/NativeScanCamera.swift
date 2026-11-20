import AVFoundation
import UIKit

@MainActor
final class NativeScanCamera: UIView, ScanCamera {
  private let preview = AVCaptureVideoPreviewLayer()
  private let outline = CAShapeLayer()
  private var running = false
  private lazy var camera = CameraSession { [weak self] sample in
    Task { @MainActor [weak self] in self?.receive(sample) }
  }
  var onSample: ((ScanDetection) -> Void)?
  var available: Bool { CameraSession.backCamera() != nil }

  init() {
    super.init(frame: .zero)
    backgroundColor = Tokens.cameraOff
    preview.session = camera.session
    preview.videoGravity = .resizeAspectFill
    outline.fillColor = nil
    outline.strokeColor = Tokens.cardOutline.cgColor
    outline.lineWidth = Tokens.cardOutlineWidth
    outline.lineJoin = .round
    layer.addSublayer(preview)
    layer.addSublayer(outline)
    isAccessibilityElement = true
    accessibilityLabel = "Camera preview"
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
    outline.frame = bounds
  }

  func permission() async -> ScanCameraPermission {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return .granted
    case .notDetermined:
      return await AVCaptureDevice.requestAccess(for: .video) ? .granted : .denied
    default: return .denied
    }
  }

  func setRunning(_ running: Bool) {
    self.running = running
    camera.setRunning(running)
    if !running { outline.path = nil }
  }

  func takePhoto(outline: [SIMD2<Double>]) async throws -> ScanPhoto {
    try await withCheckedThrowingContinuation { continuation in
      camera.takePhoto(outline: outline) { result in
        continuation.resume(with: result.map { ScanPhoto(url: $0.url, outline: $0.outline) })
      }
    }
  }

  func discard(_ photo: ScanPhoto) { try? FileManager.default.removeItem(at: photo.url) }

  private func receive(_ sample: DetectionSample) {
    guard running else { return }
    if let connection = preview.connection, connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
    if let points = sample.captureDevicePoints {
      let path = CGMutablePath()
      path.addLines(
        between: points.map {
          preview.layerPointConverted(fromCaptureDevicePoint: CGPoint(x: $0.x, y: $0.y))
        })
      path.closeSubpath()
      outline.path = path
    } else {
      outline.path = nil
    }
    onSample?(
      ScanDetection(
        detected: sample.detected, corners: sample.corners, proposalCorners: sample.proposalCorners,
        confidence: sample.confidence, signature: sample.signature, frameWidth: sample.frameWidth,
        frameHeight: sample.frameHeight, sampledAtMs: sample.sampledAtMs,
        failed: sample.failure != nil))
  }
}
