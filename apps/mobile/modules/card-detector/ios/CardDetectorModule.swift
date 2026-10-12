import AVFoundation
import ExpoModulesCore
import UIKit

enum ShutterFeedbackStyle: String, Enumerable {
  case light
  case medium
  case heavy
  case rigid
  case soft

  var impactStyle: UIImpactFeedbackGenerator.FeedbackStyle {
    switch self {
    case .light: .light
    case .medium: .medium
    case .heavy: .heavy
    case .rigid: .rigid
    case .soft: .soft
    }
  }
}

struct ShutterFeedback: Record {
  @Field var style: ShutterFeedbackStyle = .medium
  @Field var intensity: Double = 1.0
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

      Prop("shutterFeedback") { (view: CardDetectorView, feedback: ShutterFeedback) in
        view.shutterFeedback = feedback
      }

      AsyncFunction("takePhoto") { (view: CardDetectorView, promise: Promise) in
        MainActor.assumeIsolated {
          view.takePhoto(promise)
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
