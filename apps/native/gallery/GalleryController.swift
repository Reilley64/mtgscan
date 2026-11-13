import Foundation

struct GalleryPointer: Decodable {
  let formatVersion: Int
  let version: String
  let manifest: String
}

@MainActor
protocol GallerySource {
  func published(accessToken: String) async throws -> GalleryPointer
  func manifest(_ pointer: GalleryPointer, accessToken: String) async throws -> Data
  func urls(version: String, parts: [GalleryManifest.Part], accessToken: String) async throws
    -> [String: URL]
}

enum GalleryPhase: Equatable {
  case missing, checking, downloading, waitingForWifi, offline, installing, ready
  case cancelled, corrupt, unsupported, failed
  case notEnoughSpace(Int64)
}

struct GalleryProgress {
  let phase: GalleryPhase
  var bytesDone: Int64 = 0
  var bytesTotal: Int64 = 0
}

@MainActor
protocol GalleryDevice: AnyObject {
  var onChange: ((GalleryProgress) -> Void)? { get set }
  func installed() async throws -> GalleryManifest?
  func status() async -> GalleryProgress?
  func download(manifest: Data, urls: [String: URL], allowsCellular: Bool) async throws
  func cancel(persist: Bool) async -> Bool
}

struct GalleryPresentation {
  var phase: GalleryPhase = .missing
  var installedVersion: String?
  var builtAt: String?
  var model: String?
  var bytesDone: Int64 = 0
  var bytesTotal: Int64 = 0
  var isReady: Bool { installedVersion != nil }
  var canCancel: Bool { [.checking, .downloading, .waitingForWifi, .offline].contains(phase) }
  var canRetry: Bool {
    switch phase {
    case .missing, .offline, .cancelled, .corrupt, .unsupported, .failed, .notEnoughSpace: true
    default: false
    }
  }
  var title: String {
    switch phase {
    case .missing: "The scanner needs the gallery to recognize cards."
    case .checking: "Checking gallery"
    case .downloading: "Downloading gallery"
    case .waitingForWifi: "Waiting for Wi-Fi"
    case .offline: "Gallery download paused. It continues when you are online."
    case .installing: "Installing gallery"
    case .ready: "Up to date"
    case .cancelled: "Gallery download cancelled."
    case .corrupt: "Gallery download did not work."
    case .unsupported: "This gallery version needs a newer app."
    case .failed: "Gallery download did not work."
    case .notEnoughSpace(let bytes):
      "Not enough space for the gallery. It needs \(Self.megabytes(bytes)) MB."
    }
  }
  var progress: String {
    "\(Self.megabytes(bytesDone)) MB of \(Self.megabytes(bytesTotal)) MB"
  }
  static func megabytes(_ bytes: Int64) -> String {
    String(format: "%.1f", Double(bytes) / 1_000_000)
  }
}

@MainActor
final class GalleryController {
  private let source: any GallerySource
  private let device: any GalleryDevice
  private var generation = 0
  private var checking = false
  private var cancelled = false
  private(set) var presentation = GalleryPresentation()
  var onChange: (() -> Void)?

  init(source: any GallerySource, device: any GalleryDevice) {
    self.source = source
    self.device = device
    device.onChange = { [weak self] progress in
      Task { await self?.receive(progress) }
    }
  }

  func restore() async {
    do { setInstalled(try await device.installed()) } catch {
      setInstalled(nil)
      presentation.phase = .corrupt
    }
    if let status = await device.status() {
      await receive(status)
    } else if presentation.isReady {
      presentation.phase = .ready
    }
    onChange?()
  }

  func resume(accessToken: String) async {
    await restore()
    guard presentation.phase != .cancelled else { return }
    await check(accessToken: accessToken)
  }

  func check(accessToken: String, allowsCellular: Bool = false) async {
    guard !checking && presentation.phase != .installing else { return }
    checking = true
    cancelled = false
    generation += 1
    let operation = generation
    defer {
      if generation == operation { checking = false }
    }
    presentation.phase = .checking
    onChange?()
    do {
      let installed: GalleryManifest?
      do { installed = try await device.installed() } catch GalleryFailure.corrupt {
        installed = nil
      }
      guard operation == generation else { return }
      setInstalled(installed)
      let pointer = try await source.published(accessToken: accessToken)
      guard operation == generation else { return }
      guard pointer.formatVersion == GalleryManifest.formatVersion else {
        throw GalleryFailure.unsupported
      }
      guard pointer.version != installed?.version else {
        guard await device.cancel(persist: false) else { throw GalleryFailure.unavailable }
        guard operation == generation else { return }
        presentation.phase = .ready
        onChange?()
        return
      }
      let data = try await source.manifest(pointer, accessToken: accessToken)
      guard operation == generation else { return }
      let manifest = try GalleryPolicy.manifest(data, version: pointer.version)
      let needed = try GalleryPolicy.partsNeeded(manifest, installed: installed)
      let urls = try await source.urls(
        version: manifest.version, parts: needed, accessToken: accessToken)
      guard operation == generation else { return }
      guard needed.allSatisfy({ urls[$0.name] != nil }) else { throw GalleryFailure.unavailable }
      try await device.download(manifest: data, urls: urls, allowsCellular: allowsCellular)
      guard operation == generation else { return }
      if let status = await device.status() { await receive(status) }
    } catch {
      guard operation == generation else { return }
      switch error {
      case GalleryFailure.unsupported: presentation.phase = .unsupported
      case GalleryFailure.corrupt: presentation.phase = .corrupt
      case GalleryFailure.offline: presentation.phase = .offline
      default: presentation.phase = .failed
      }
      onChange?()
    }
  }

  func cancel() async {
    guard presentation.canCancel else { return }
    generation += 1
    checking = false
    cancelled = true
    let didCancel = await device.cancel(persist: true)
    if !didCancel {
      cancelled = false
      if let status = await device.status() { await receive(status) }
      return
    }
    presentation.phase = .cancelled
    onChange?()
  }

  func endSession() async {
    generation += 1
    checking = false
    cancelled = true
    _ = await device.cancel(persist: false)
    presentation.phase = presentation.isReady ? .ready : .missing
    onChange?()
  }

  private func receive(_ progress: GalleryProgress) async {
    guard !cancelled else { return }
    presentation.phase = progress.phase
    presentation.bytesDone = progress.bytesDone
    presentation.bytesTotal = progress.bytesTotal
    if progress.phase == .ready {
      do {
        setInstalled(try await device.installed())
        if !presentation.isReady { presentation.phase = .missing }
      } catch {
        setInstalled(nil)
        presentation.phase = .corrupt
      }
    }
    onChange?()
  }

  private func setInstalled(_ manifest: GalleryManifest?) {
    presentation.installedVersion = manifest?.version
    presentation.builtAt = manifest?.builtAt
    presentation.model = manifest?.model.name
  }
}
