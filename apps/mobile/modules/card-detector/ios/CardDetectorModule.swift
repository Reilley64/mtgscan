import AVFoundation
import ExpoModulesCore

public final class CardDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardDetector")

    Function("isCameraAvailable") { () -> Bool in
      AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
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

      AsyncFunction("takePhoto") { (view: CardDetectorView, promise: Promise) in
        view.takePhoto(promise)
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
