import Foundation

enum ScanCameraPermission { case granted, denied }
enum ScanCameraState {
  case inactive, checking, unavailable, denied, galleryMissing, running, stopped
}
enum ScanFeedback: Hashable { case recognized, failed }

struct ScanPhoto: Sendable {
  let url: URL
  let outline: [SIMD2<Double>]
}

@MainActor
protocol ScanCamera {
  var available: Bool { get }
  func permission() async -> ScanCameraPermission
  func setRunning(_ running: Bool)
  func takePhoto(outline: [SIMD2<Double>]) async throws -> ScanPhoto
  func discard(_ photo: ScanPhoto)
}

protocol ScanRecognizer: Sendable {
  func recognize(_ photo: ScanPhoto) async throws -> ScanRecognitionResult
}

@MainActor
final class ScanCaptureController {
  private let camera: any ScanCamera
  private let recognizer: any ScanRecognizer
  private let review: ScanReviewController
  private let feedback: (ScanFeedback) -> Void
  private var automatic = AutomaticCapture()
  private var permissionGeneration = 0
  private(set) var state: ScanCameraState = .inactive
  var onChange: (() -> Void)?

  init(
    camera: any ScanCamera, recognizer: any ScanRecognizer, review: ScanReviewController,
    feedback: @escaping (ScanFeedback) -> Void
  ) {
    self.camera = camera
    self.recognizer = recognizer
    self.review = review
    self.feedback = feedback
  }

  func setActive(_ active: Bool, galleryReady: Bool) async {
    permissionGeneration += 1
    let generation = permissionGeneration
    camera.setRunning(false)
    guard active, review.accountID != nil else {
      show(.inactive)
      return
    }
    guard galleryReady else {
      show(.galleryMissing)
      return
    }
    guard camera.available else {
      show(.unavailable)
      return
    }
    guard !automatic.stopped else {
      show(.stopped)
      return
    }
    show(.checking)
    let access = await camera.permission()
    guard generation == permissionGeneration else { return }
    guard access == .granted else {
      show(.denied)
      return
    }
    camera.setRunning(true)
    show(.running)
  }

  func retry(galleryReady: Bool) async {
    automatic.retry()
    await setActive(true, galleryReady: galleryReady)
  }

  func observe(_ sample: ScanDetection) {
    guard state == .running, review.storageState != .loadFailed else { return }
    let requestPhoto = automatic.observe(sample)
    if automatic.stopped {
      camera.setRunning(false)
      show(.stopped)
    }
    guard requestPhoto, let corners = sample.corners, let request = review.beginRecognition() else {
      return
    }
    Task { await capture(corners, request: request) }
  }

  private func capture(_ corners: [SIMD2<Double>], request: ScanRequest) async {
    let photo: ScanPhoto
    do {
      photo = try await camera.takePhoto(outline: corners)
      automatic.photoTaken()
    } catch {
      automatic.photoFailed()
      review.complete(request, result: .noPhoto)
      if automatic.stopped {
        camera.setRunning(false)
        show(.stopped)
      }
      return
    }
    defer { camera.discard(photo) }
    let result: ScanRecognitionResult
    do { result = try await recognizer.recognize(photo) } catch { result = .failed }
    guard review.complete(request, result: result) else { return }
    switch result {
    case .recognized(.card(let card), _): feedback(card.candidates.isEmpty ? .failed : .recognized)
    case .failed: feedback(.failed)
    default: break
    }
  }

  private func show(_ state: ScanCameraState) {
    self.state = state
    onChange?()
  }
}
