import AVFoundation
import ExpoModulesCore
import UIKit

final class CardDetectorView: ExpoView {
  let onDetectionSample = EventDispatcher()
  private let previewLayer = AVCaptureVideoPreviewLayer()
  private let outlineLayer = CAShapeLayer()
  private var camera: CameraSession?

  var active = false {
    didSet { updateRunning() }
  }

  var outlineColor = UIColor.clear {
    didSet { outlineLayer.strokeColor = outlineColor.cgColor }
  }

  var outlineWidth = 0.0 {
    didSet { outlineLayer.lineWidth = outlineWidth }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    let camera = CameraSession { [weak self] sample in
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          self?.show(sample)
        }
      }
    }
    self.camera = camera
    previewLayer.session = camera.session
    previewLayer.videoGravity = .resizeAspectFill
    outlineLayer.fillColor = nil
    outlineLayer.lineJoin = .round
    layer.addSublayer(previewLayer)
    layer.addSublayer(outlineLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    outlineLayer.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateRunning()
  }

  func takePhoto(_ promise: Promise) {
    guard let camera else {
      promise.reject(PhotoFailure.cameraNotRunning.rawValue, "The camera is not running")
      return
    }
    camera.takePhoto { result in
      switch result {
      case let .success(photo):
        promise.resolve([
          "uri": photo.url.absoluteString,
          "outline": photo.outline.map { ["x": $0.x, "y": $0.y] },
        ])
      case let .failure(failure):
        promise.reject(failure.rawValue, "The photo could not be taken")
      }
    }
  }

  private func updateRunning() {
    let running = active && window != nil
    camera?.setRunning(running)
    if !running {
      outlineLayer.path = nil
    }
  }

  private func show(_ sample: DetectionSample) {
    guard active else { return }
    keepPreviewUpright()
    outlineLayer.path = outlinePath(sample)
    onDetectionSample(sample.record)
  }

  private func keepPreviewUpright() {
    guard let connection = previewLayer.connection,
          connection.videoRotationAngle != 90,
          connection.isVideoRotationAngleSupported(90)
    else { return }
    connection.videoRotationAngle = 90
  }

  private func outlinePath(_ sample: DetectionSample) -> CGPath? {
    guard let devicePoints = sample.captureDevicePoints else { return nil }
    let path = CGMutablePath()
    path.addLines(between: devicePoints.map {
      previewLayer.layerPointConverted(fromCaptureDevicePoint: CGPoint(x: $0.x, y: $0.y))
    })
    path.closeSubpath()
    return path
  }
}
