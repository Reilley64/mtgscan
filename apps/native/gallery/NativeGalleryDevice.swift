import Foundation

@MainActor
final class NativeGalleryDevice: GalleryDevice {
  var onChange: ((GalleryProgress) -> Void)?
  private let downloads = GalleryDownloads.shared

  init() {
    downloads.listen { [weak self] status in
      Task { @MainActor in self?.onChange?(Self.progress(status)) }
    }
  }

  func installed() async throws -> GalleryManifest? {
    try await Task.detached(priority: .utility) {
      let directory = GalleryDownloads.installedDirectory
      guard FileManager.default.fileExists(atPath: directory.path) else { return nil }
      do { return try GalleryInstaller.validatedInstalledManifest(in: directory) } catch {
        throw GalleryFailure.corrupt
      }
    }.value
  }

  func status() async -> GalleryProgress? {
    await downloads.currentStatus().map(Self.progress)
  }

  func download(manifest: Data, urls: [String: URL], allowsCellular: Bool) async throws {
    let parsed = try GalleryInstaller.manifest(from: manifest)
    try await downloads.download(
      version: parsed.version, manifest: manifest, urls: urls,
      allowsCellularAccess: allowsCellular)
  }

  func cancel(persist: Bool) async -> Bool {
    await downloads.cancel(persistCancellation: persist)
  }

  private static func progress(_ status: GalleryDownloadStatus) -> GalleryProgress {
    let phase: GalleryPhase
    switch status.state {
    case .downloading: phase = .downloading
    case .waitingForWifi: phase = .waitingForWifi
    case .waitingForNetwork: phase = .offline
    case .installing: phase = .installing
    case .installed: phase = .ready
    case .failed: phase = .failed
    case .cancelled: phase = .cancelled
    case .corrupt: phase = .corrupt
    case .unsupported: phase = .unsupported
    case .notEnoughSpace: phase = .notEnoughSpace(status.bytesNeeded)
    }
    return GalleryProgress(phase: phase, bytesDone: status.bytesDone, bytesTotal: status.bytesTotal)
  }
}
