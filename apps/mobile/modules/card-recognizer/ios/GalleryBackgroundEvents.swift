import Foundation

final class GalleryBackgroundEvents: @unchecked Sendable {
  private let identifier: String
  private let deliver: (@escaping () -> Void) -> Void
  private let lock = NSLock()
  private var completions: [() -> Void] = []
  private var drained = false
  private var installing = false

  init(identifier: String, deliver: @escaping (@escaping () -> Void) -> Void) {
    self.identifier = identifier
    self.deliver = deliver
  }

  func handleEvents(
    identifier: String, reconnect: () -> Void = {}, completion: @escaping () -> Void
  ) -> Bool {
    guard identifier == self.identifier else { return false }
    lock.withLock {
      completions.append(completion)
    }
    reconnect()
    return true
  }

  func didFinishEvents(identifier: String) {
    guard identifier == self.identifier else { return }
    let ready = lock.withLock {
      drained = !completions.isEmpty
      return takeReady()
    }
    ready.forEach(deliver)
  }

  func beginInstallation() { lock.withLock { installing = true } }

  func endInstallation() {
    let ready = lock.withLock {
      installing = false
      return takeReady()
    }
    ready.forEach(deliver)
  }

  private func takeReady() -> [() -> Void] {
    guard drained, !installing, !completions.isEmpty else { return [] }
    let ready = completions
    completions.removeAll()
    drained = false
    return ready
  }
}
