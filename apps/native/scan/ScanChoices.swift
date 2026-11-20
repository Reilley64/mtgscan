import Foundation

protocol ScanLocalGallery: Sendable {
  func names(_ text: String) async throws -> [CardName]
  func printings(_ oracleID: String) async throws -> [RecognitionCandidate]
}

@MainActor
final class ScanChoicesController {
  private let local: any ScanLocalGallery
  private let pause: () async throws -> Void
  private let imageURI: (String, String) async throws -> String?
  private var accountID: String?
  private var generation = 0
  private var searchGeneration = 0
  private var printingGeneration = 0
  private(set) var names: [CardName] = []
  private(set) var printings: [RecognitionCandidate] = []
  private(set) var artwork: [String: String] = [:]
  private(set) var message: String?
  private(set) var artworkFailed = false
  private(set) var localFailed = false
  private(set) var searchText = ""
  var onChange: (() -> Void)?

  init(
    local: any ScanLocalGallery,
    pause: @escaping () async throws -> Void = {
      try await Task.sleep(for: .milliseconds(300))
    }, imageURI: @escaping (String, String) async throws -> String?
  ) {
    self.local = local
    self.pause = pause
    self.imageURI = imageURI
  }

  func setAccount(_ accountID: String?) {
    guard self.accountID != accountID else { return }
    self.accountID = accountID
    generation += 1
    searchGeneration += 1
    printingGeneration += 1
    names = []
    printings = []
    artwork = [:]
    message = nil
    artworkFailed = false
    localFailed = false
    searchText = ""
    onChange?()
  }

  func search(_ text: String) async {
    searchText = text
    localFailed = false
    searchGeneration += 1
    printingGeneration += 1
    let request = searchGeneration
    names = []
    printings = []
    message = nil
    onChange?()
    guard accountID != nil, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return
    }
    do {
      try await pause()
      guard request == searchGeneration else { return }
      let found = try await local.names(text)
      guard request == searchGeneration else { return }
      names = found
      if found.isEmpty {
        message = "No card names match \"\(text.trimmingCharacters(in: .whitespacesAndNewlines))\"."
      }
    } catch {
      guard request == searchGeneration else { return }
      localFailed = true
      message = "Could not search card names. Try again."
    }
    onChange?()
  }

  func loadPrintings(_ oracleID: String, scan: BatchScan? = nil) async {
    printingGeneration += 1
    let request = printingGeneration
    printings = []
    message = nil
    localFailed = false
    guard accountID != nil else { return }
    do {
      let found = try await local.printings(oracleID)
      guard request == printingGeneration else { return }
      if found.allSatisfy(\.basicLand) && !found.isEmpty {
        message = "Basic lands are not tracked."
      } else if let scan {
        let twins = scan.options.prefix(scan.sameTextTwinCount + 1).filter {
          $0.oracleId == scan.printing.oracleId
        }
        let twinIDs = Set(twins.map(\.printingId))
        printings = twins + found.filter { !twinIDs.contains($0.printingId) }
      } else {
        printings = found
      }
    } catch {
      guard request == printingGeneration else { return }
      localFailed = true
      message = "Could not load card printings. Try again."
    }
    onChange?()
  }

  func loadArtwork(_ candidates: [RecognitionCandidate]) async {
    guard let accountID else { return }
    let request = generation
    artworkFailed = false
    for candidate in candidates where artwork[candidate.printingId] == nil {
      do {
        let uri = try await imageURI(accountID, candidate.printingId)
        guard request == generation else { return }
        artwork[candidate.printingId] = uri
      } catch {
        guard request == generation else { return }
        artworkFailed = true
      }
    }
    onChange?()
  }
}
