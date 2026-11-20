import Foundation

@MainActor
final class NativeScanFiles: ScanFiles {
  private let root: URL

  init(root: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]) {
    self.root = root
  }

  func read(_ name: String) throws -> Data? {
    let url = root.appendingPathComponent(name)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try Data(contentsOf: url)
  }

  func write(_ data: Data, to name: String) throws {
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try data.write(to: root.appendingPathComponent(name), options: .atomic)
  }

  func keepCrop(_ uri: String, accountID: String, copyID: String) -> Bool {
    guard let source = URL(string: uri), source.isFileURL else { return false }
    let destination = crop(accountID: accountID, copyID: copyID)
    do {
      try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      try FileManager.default.moveItem(at: source, to: destination)
      return true
    } catch { return false }
  }

  func discardCrop(_ uri: String) {
    guard let url = URL(string: uri), url.isFileURL else { return }
    try? FileManager.default.removeItem(at: url)
  }

  func dropCrop(accountID: String, copyID: String) {
    try? FileManager.default.removeItem(at: crop(accountID: accountID, copyID: copyID))
  }

  private func crop(accountID: String, copyID: String) -> URL {
    root.appendingPathComponent("training-crops", isDirectory: true)
      .appendingPathComponent(accountID, isDirectory: true).appendingPathComponent("\(copyID).webp")
  }
}
