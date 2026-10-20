import AVFoundation
import ExpoModulesCore

struct OutlinePoint: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

public final class CardDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardDetector")

    Function("isCameraAvailable") { () -> Bool in
      CameraSession.backCamera() != nil
    }

    AsyncFunction("getCameraPermission") { () -> String in
      Self.cameraPermission()
    }

    AsyncFunction("requestCameraPermission") { () async -> String in
      _ = await AVCaptureDevice.requestAccess(for: .video)
      return Self.cameraPermission()
    }

    AsyncFunction("deletePhoto") { (uri: URL) in
      guard uri.isFileURL,
            uri.deletingLastPathComponent().standardizedFileURL
              == FileManager.default.temporaryDirectory.standardizedFileURL
      else { return }
      try? FileManager.default.removeItem(at: uri)
    }

    View(CardDetectorView.self) {
      Events("onDetectionSample")

      Prop("active") { (view: CardDetectorView, active: Bool) in
        view.active = active
      }

      Prop("outlineColor") { (view: CardDetectorView, color: UIColor) in
        view.outlineColor = color
      }

      Prop("outlineWidth") { (view: CardDetectorView, width: Double) in
        view.outlineWidth = width
      }

      Prop("rectangleTrial") { (view: CardDetectorView, rectangleTrial: Bool) in
        view.rectangleTrial = rectangleTrial
      }

      AsyncFunction("takePhoto") { (view: CardDetectorView, outline: [OutlinePoint], promise: Promise) in
        MainActor.assumeIsolated {
          view.takePhoto(outline: outline.map { SIMD2($0.x, $0.y) }, promise: promise)
        }
      }
    }
  }

  private static func cameraPermission() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: "granted"
    case .notDetermined: "undetermined"
    default: "denied"
    }
  }
}
