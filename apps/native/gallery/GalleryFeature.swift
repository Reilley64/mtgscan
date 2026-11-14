import UIKit

@MainActor
final class GalleryFeature {
  private let controller: GalleryController
  private let accessToken: () async throws -> String
  private var signedIn = false
  var scannerReady: Bool { controller.presentation.isReady }
  var onScannerReadinessChange: (() -> Void)?
  private var lastScannerReady = false
  private var task: Task<Void, Never>?
  lazy var view = GalleryStatus(
    onRetry: { [weak self] in self?.check() },
    onCellular: { [weak self] in self?.check(allowsCellular: true) },
    onCancel: { [weak self] in
      Task { await self?.controller.cancel() }
    })

  convenience init(config: PublicConfiguration, accessToken: @escaping () async throws -> String) {
    self.init(
      source: GalleryStorage(config: config), device: NativeGalleryDevice(),
      accessToken: accessToken)
  }

  init(
    source: any GallerySource, device: any GalleryDevice,
    accessToken: @escaping () async throws -> String
  ) {
    controller = GalleryController(source: source, device: device)
    self.accessToken = accessToken
    controller.onChange = { [weak self] in self?.display() }
    view.isHidden = true
    Task { await controller.restore() }
  }

  func sessionChanged(signedIn: Bool) {
    guard self.signedIn != signedIn else { return }
    self.signedIn = signedIn
    view.isHidden = !signedIn
    if signedIn {
      foreground()
    } else {
      task?.cancel()
      Task { await controller.endSession() }
    }
    display()
  }

  func foreground() {
    guard signedIn else { return }
    task?.cancel()
    task = Task {
      guard let token = try? await accessToken(), !Task.isCancelled else { return }
      await controller.resume(accessToken: token)
    }
  }

  private func check(allowsCellular: Bool = false) {
    task?.cancel()
    task = Task { await update(allowsCellular: allowsCellular) }
  }

  private func update(allowsCellular: Bool) async {
    guard signedIn, let token = try? await accessToken(), !Task.isCancelled else { return }
    await controller.check(accessToken: token, allowsCellular: allowsCellular)
  }

  private func display() {
    view.display(controller.presentation, signedIn: signedIn)
    if lastScannerReady != scannerReady {
      lastScannerReady = scannerReady
      onScannerReadinessChange?()
    }
  }
}
