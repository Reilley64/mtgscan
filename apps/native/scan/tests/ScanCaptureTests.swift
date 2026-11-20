import Foundation

@MainActor
final class FakeScanCamera: ScanCamera {
  var available = true
  var access: ScanCameraPermission = .granted
  var running = false
  var photo: CheckedContinuation<ScanPhoto, Error>?
  var completedPhotos = 0
  var discarded: [URL] = []
  func permission() async -> ScanCameraPermission { access }
  func setRunning(_ running: Bool) { self.running = running }
  func takePhoto(outline: [SIMD2<Double>]) async throws -> ScanPhoto {
    defer { completedPhotos += 1 }
    return try await withCheckedThrowingContinuation { photo = $0 }
  }
  func discard(_ photo: ScanPhoto) { discarded.append(photo.url) }
}

actor FakeScanRecognizer: ScanRecognizer {
  let answer: Recognition
  init(_ answer: Recognition) { self.answer = answer }
  func recognize(_ photo: ScanPhoto) async throws -> ScanRecognitionResult { .recognized(answer) }
}

struct ScanCaptureTests {
  @MainActor
  static func latePhotoFailureDoesNotStopTheNextAccount() async throws {
    let camera = FakeScanCamera()
    let review = ScanReviewController(files: MemoryScanFiles())
    let capture = ScanCaptureController(
      camera: camera, recognizer: FakeScanRecognizer(scanRecognition([try scanPrinting()])),
      review: review, feedback: { _ in })
    review.setAccount("account-a")
    await capture.setActive(true, galleryReady: true)

    for attempt in 0..<3 {
      let start = Double(attempt * 1000)
      for offset in [0.0, 200, 400, 600] {
        capture.observe(AutomaticCaptureTests.sample(start + offset))
      }
      await waitForCamera { camera.photo != nil }
      if attempt == 2 {
        await capture.setActive(false, galleryReady: true)
        review.setAccount("account-b")
        await capture.setActive(true, galleryReady: true)
      }
      let photo = camera.photo
      camera.photo = nil
      photo?.resume(throwing: TestPhotoFailure.unavailable)
      await waitForCamera { camera.completedPhotos == attempt + 1 }
    }

    precondition(
      capture.state == .running && camera.running,
      "A photo failure from the old account cannot stop the new account camera")
    for time in [3000.0, 3200, 3400, 3600] {
      capture.observe(AutomaticCaptureTests.sample(time))
    }
    await waitForCamera { camera.photo != nil }
    let photo = camera.photo
    camera.photo = nil
    photo?.resume(
      returning: ScanPhoto(url: URL(fileURLWithPath: "/synthetic/current.jpg"), outline: []))
    await waitForCamera { camera.discarded.count == 1 }
    precondition(review.batch.scans.count == 1, "The new account can take and recognize photos")
  }

  private enum TestPhotoFailure: Error { case unavailable }

  @MainActor
  private static func waitForCamera(_ ready: () -> Bool) async {
    for _ in 0..<10_000 {
      if ready() { return }
      await Task.yield()
    }
    preconditionFailure("Expected the synthetic camera to reach the next checkpoint")
  }

  @MainActor
  static func recognitionFeedbackUsesTheNativeDecisionWithoutScores() async throws {
    let answers: [(Recognition, [ScanFeedback], Int)] = [
      (scanRecognition([try scanPrinting()], accepted: false), [.recognized], 1),
      (scanRecognition([]), [.failed], 0),
      (.notACard(NotACardRecognition(topSimilarity: 0.1, stageMs: [:])), [], 0),
    ]
    for (answer, expected, count) in answers {
      let camera = FakeScanCamera()
      let review = ScanReviewController(files: MemoryScanFiles(), newID: { "copy" })
      review.setAccount("account-a")
      var feedback: [ScanFeedback] = []
      let capture = ScanCaptureController(
        camera: camera, recognizer: FakeScanRecognizer(answer),
        review: review, feedback: { feedback.append($0) })
      await capture.setActive(true, galleryReady: true)
      for time in [0.0, 200, 400, 600] { capture.observe(AutomaticCaptureTests.sample(time)) }
      while camera.photo == nil { await Task.yield() }
      camera.photo?.resume(
        returning: ScanPhoto(url: URL(fileURLWithPath: "/synthetic/photo.jpg"), outline: []))
      while camera.discarded.isEmpty { await Task.yield() }
      precondition(
        feedback == expected,
        "Accept and abstain use success feedback; empty candidates warn; not-a-card stays silent")
      precondition(review.batch.scans.count == count)
    }
  }

  @MainActor
  static func lifecycleAndAccountCancellation() async throws {
    let camera = FakeScanCamera()
    let review = ScanReviewController(files: MemoryScanFiles(), newID: { "copy" })
    review.setAccount("account-a")
    var feedback: [ScanFeedback] = []
    let capture = ScanCaptureController(
      camera: camera, recognizer: FakeScanRecognizer(scanRecognition([try scanPrinting()])),
      review: review, feedback: { feedback.append($0) })
    camera.access = .denied
    await capture.setActive(true, galleryReady: true)
    precondition(capture.state == .denied && !camera.running)
    camera.access = .granted
    await capture.setActive(true, galleryReady: true)
    precondition(capture.state == .running && camera.running)
    for time in [0.0, 200, 400, 600] { capture.observe(AutomaticCaptureTests.sample(time)) }
    while camera.photo == nil { await Task.yield() }
    await capture.setActive(false, galleryReady: true)
    review.setAccount("account-b")
    camera.photo?.resume(
      returning: ScanPhoto(url: URL(fileURLWithPath: "/synthetic/photo.jpg"), outline: []))
    while camera.discarded.isEmpty { await Task.yield() }
    precondition(!camera.running && capture.state == .inactive)
    precondition(
      review.batch.scans.isEmpty && feedback.isEmpty,
      "Old capture cannot enter another account or play feedback")
    precondition(
      camera.discarded.count == 1, "Captured temporary photo is discarded even after cancellation")
  }
}
