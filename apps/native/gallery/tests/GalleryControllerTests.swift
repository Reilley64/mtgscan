import Foundation

@MainActor
final class GalleryStorageFake: GallerySource {
  var pointer = GalleryPointer(
    formatVersion: 2, version: "update", manifest: "update/manifest.json")
  var manifestData = Data()
  var failure: GalleryFailure?
  var requested: [String] = []
  var pending: CheckedContinuation<GalleryPointer, Error>?
  var suspend = false
  func published(accessToken: String) async throws -> GalleryPointer {
    if let failure { throw failure }
    if suspend { return try await withCheckedThrowingContinuation { pending = $0 } }
    return pointer
  }
  func manifest(_ pointer: GalleryPointer, accessToken: String) async throws -> Data {
    manifestData
  }
  func urls(version: String, parts: [GalleryManifest.Part], accessToken: String) async throws
    -> [String: URL]
  {
    requested = parts.map(\.name)
    return Dictionary(
      uniqueKeysWithValues: parts.map {
        ($0.name, URL(string: "https://example.invalid/\($0.name)")!)
      })
  }
}

@MainActor
final class GalleryDeviceFake: GalleryDevice {
  var onChange: ((GalleryProgress) -> Void)?
  var active: GalleryManifest?
  var progress: GalleryProgress?
  var failure: GalleryFailure?
  var downloads = 0
  var installedFailure = false
  func installed() async throws -> GalleryManifest? {
    if installedFailure { throw GalleryFailure.corrupt }
    return active
  }
  func status() async -> GalleryProgress? { progress }
  func download(manifest: Data, urls: [String: URL], allowsCellular: Bool) async throws {
    downloads += 1
    if let failure { throw failure }
    progress = GalleryProgress(phase: .downloading, bytesDone: 0, bytesTotal: 6)
  }
  func cancel(persist: Bool) async -> Bool {
    progress = persist ? GalleryProgress(phase: .cancelled) : nil
    return true
  }
}

@MainActor
func runGalleryControllerTests() async throws {
  let storage = GalleryStorageFake()
  let device = GalleryDeviceFake()
  let controller = GalleryController(source: storage, device: device)
  await controller.restore()
  precondition(
    !controller.presentation.isReady && controller.presentation.phase == .missing,
    "A missing gallery cannot enable the scanner")
  device.active = try galleryManifest()
  storage.pointer = GalleryPointer(
    formatVersion: 9, version: "future", manifest: "future/manifest.json")
  await controller.check(accessToken: "synthetic-session")
  precondition(
    controller.presentation.isReady && controller.presentation.phase == .unsupported,
    "An unsupported published version preserves the usable gallery")
  precondition(device.downloads == 0, "Unsupported formats download no parts")
  storage.pointer = GalleryPointer(
    formatVersion: 2, version: "update", manifest: "update/manifest.json")
  storage.manifestData = try JSONEncoder().encode(galleryManifest(version: "update", addOn: true))
  device.failure = .corrupt
  await controller.check(accessToken: "synthetic-session")
  precondition(
    controller.presentation.isReady && controller.presentation.phase == .corrupt,
    "A corrupt update preserves the previous usable gallery and offers retry")
  precondition(controller.presentation.canRetry)
  device.failure = nil
  await controller.check(accessToken: "synthetic-session")
  precondition(controller.presentation.phase == .downloading && controller.presentation.isReady)
  precondition(storage.requested == ["1-gallery.zlib", "1-printings.zlib"])
  device.progress = GalleryProgress(
    phase: .waitingForWifi, bytesDone: 12_300_000, bytesTotal: 68_500_000)
  await controller.restore()
  precondition(
    controller.presentation.title == "Waiting for Wi-Fi"
      && controller.presentation.progress == "12.3 MB of 68.5 MB"
      && controller.presentation.canCancel,
    "Shared presentation reports real byte progress while the installed gallery stays usable")
  device.progress = GalleryProgress(phase: .notEnoughSpace(269_400_000))
  await controller.restore()
  precondition(
    controller.presentation.title == "Not enough space for the gallery. It needs 269.4 MB."
      && controller.presentation.canRetry && controller.presentation.isReady)
  device.progress = GalleryProgress(phase: .downloading)
  await controller.restore()
  await controller.cancel()
  precondition(controller.presentation.phase == .cancelled && controller.presentation.isReady)
  let restarted = GalleryController(source: storage, device: device)
  await restarted.restore()
  precondition(
    restarted.presentation.phase == .cancelled && restarted.presentation.installedVersion == "base",
    "Restart preserves the active gallery and cancelled update")
  let downloadsBeforeRestart = device.downloads
  await restarted.resume(accessToken: "synthetic-session")
  precondition(
    restarted.presentation.phase == .cancelled && device.downloads == downloadsBeforeRestart,
    "Foreground recovery must not restart an explicitly cancelled update")
  await restarted.check(accessToken: "synthetic-session")
  device.active = try galleryManifest(version: "update", addOn: true)
  device.progress = GalleryProgress(phase: .ready)
  await restarted.restore()
  precondition(
    restarted.presentation.installedVersion == "update"
      && restarted.presentation.model == "pe-core-s16-384",
    "A completed compatible installation restores with its matching model")
  device.progress = nil
  device.installedFailure = true
  await restarted.restore()
  precondition(
    !restarted.presentation.isReady && restarted.presentation.phase == .corrupt,
    "A corrupt active installation never enables recognition after foreground recovery")
  device.installedFailure = false
  await restarted.restore()
  storage.failure = .offline
  await restarted.check(accessToken: "synthetic-session")
  precondition(restarted.presentation.isReady && restarted.presentation.phase == .offline)
  precondition(
    restarted.presentation.title == "Gallery download paused. It continues when you are online.")
  storage.failure = nil
  storage.suspend = true
  let pending = Task { await restarted.check(accessToken: "synthetic-session") }
  while storage.pending == nil { await Task.yield() }
  let downloadsBeforeCancel = device.downloads
  await restarted.cancel()
  storage.pending?.resume(returning: storage.pointer)
  await pending.value
  precondition(
    restarted.presentation.phase == .cancelled && device.downloads == downloadsBeforeCancel,
    "A late request cannot restart a cancelled gallery update")
}
