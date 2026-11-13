import Foundation

enum DeckFailure: Error {
  case unauthenticated, forbidden, notFound, unavailable, invalidArgument
}

@MainActor
protocol DeckService {
  func browse(accountID: String) async throws -> [DeckSummary]
  func contents(accountID: String, deckID: String) async throws -> DeckContents
  func create(accountID: String, name: String) async throws -> String
  func metadata(accountID: String, deckID: String, change: DeckMetadataChange) async throws
}

enum DeckState: Equatable {
  case signedOut, loading, loaded, empty, failed, refused
}

struct DeckPresentation {
  var state: DeckState = .signedOut
  var decks: [DeckSummary] = []
  var deck: DeckContents?
  var selectedDeckID: String?
  var writing = false
  var writeFailure: String?
  var message: String? {
    switch state {
    case .signedOut, .loaded: return nil
    case .loading: return selectedDeckID == nil ? "Loading decks" : "Loading deck"
    case .empty: return "No decks yet"
    case .failed:
      return selectedDeckID == nil ? "Could not load your decks" : "Could not load this deck"
    case .refused: return "Your session ended. Sign in again."
    }
  }
}

@MainActor
final class DeckController {
  private let api: any DeckService
  private var accountID: String?
  private var generation = 0
  private var readGeneration = 0
  private(set) var presentation = DeckPresentation()
  var interactionID: Int { generation }
  var onChange: (() -> Void)?
  private(set) var grouping: DeckGrouping = .type
  private(set) var sort: DeckSort = .name
  private(set) var ascending = true

  func group(by grouping: DeckGrouping) {
    self.grouping = grouping
    onChange?()
  }

  func sort(by sort: DeckSort) {
    ascending = self.sort == sort ? !ascending : sort == .name || sort == .manaValue
    self.sort = sort
    onChange?()
  }

  init(api: any DeckService) { self.api = api }

  func setAccount(_ accountID: String?) {
    guard self.accountID != accountID else { return }
    generation += 1
    readGeneration += 1
    self.accountID = accountID
    presentation = DeckPresentation(state: accountID == nil ? .signedOut : .loading)
    onChange?()
  }

  func reload() async {
    guard let accountID else { return }
    readGeneration += 1
    let read = readGeneration
    let operation = generation
    let previous = presentation.state
    if presentation.deck == nil && presentation.decks.isEmpty && previous != .empty
      && previous != .loaded
    {
      presentation.state = .loading
    }
    onChange?()
    do {
      if let id = presentation.selectedDeckID {
        let deck = try await api.contents(accountID: accountID, deckID: id)
        guard read == readGeneration, operation == generation else { return }
        presentation.deck = deck
        presentation.state = .loaded
      } else {
        let decks = try await api.browse(accountID: accountID)
        guard read == readGeneration, operation == generation else { return }
        presentation.decks = decks
        presentation.state = decks.isEmpty ? .empty : .loaded
      }
    } catch {
      guard read == readGeneration, operation == generation else { return }
      if isRefusal(error) {
        refuse()
      } else if case DeckFailure.notFound = error {
        removeMissingDeck()
      } else if previous != .loaded && previous != .empty {
        presentation.state = .failed
      }
    }
    onChange?()
  }

  func open(_ id: String) async {
    guard let accountID else { return }
    generation += 1
    let operation = generation
    presentation.selectedDeckID = id
    presentation.deck = nil
    presentation.writing = false
    presentation.writeFailure = nil
    presentation.state = .loading
    onChange?()
    do {
      try await api.metadata(accountID: accountID, deckID: id, change: .used)
    } catch {
      guard operation == generation else { return }
      if isRefusal(error) {
        refuse()
        onChange?()
        return
      }
      if case DeckFailure.notFound = error {
        removeMissingDeck()
        onChange?()
        return
      }
    }
    guard operation == generation else { return }
    await reload()
  }

  func close() async {
    guard accountID != nil else { return }
    generation += 1
    presentation.selectedDeckID = nil
    presentation.deck = nil
    presentation.writing = false
    presentation.writeFailure = nil
    presentation.state = presentation.decks.isEmpty ? .loading : .loaded
    await reload()
  }

  func create(_ input: String) async {
    guard let accountID, !presentation.writing, let name = DeckNameInput.checked(input) else {
      return
    }
    let operation = generation
    presentation.writing = true
    presentation.writeFailure = nil
    onChange?()
    do {
      let id = try await api.create(accountID: accountID, name: name)
      guard operation == generation else { return }
      presentation.writing = false
      await open(id)
    } catch {
      guard operation == generation else { return }
      writeFailed(error, title: "Could not create this deck")
    }
  }

  func rename(_ input: String) async {
    guard let name = DeckNameInput.checked(input) else { return }
    await write(.rename(name), title: "Could not rename this deck")
  }

  func setPriority(_ priority: DeckPriority) async {
    await write(.priority(priority), title: "Could not change the deck priority")
  }

  func clearWriteFailure() {
    presentation.writeFailure = nil
  }

  private func write(_ change: DeckMetadataChange, title: String) async {
    guard let accountID, let id = presentation.selectedDeckID, !presentation.writing else { return }
    let operation = generation
    presentation.writing = true
    presentation.writeFailure = nil
    onChange?()
    do {
      try await api.metadata(accountID: accountID, deckID: id, change: change)
      guard operation == generation else { return }
      presentation.writing = false
      await reload()
    } catch {
      guard operation == generation else { return }
      writeFailed(error, title: title)
    }
  }

  private func writeFailed(_ error: any Error, title: String) {
    presentation.writing = false
    if isRefusal(error) {
      refuse()
    } else if case DeckFailure.notFound = error {
      removeMissingDeck()
    } else {
      presentation.writeFailure = title
    }
    onChange?()
  }

  private func refuse() {
    generation += 1
    readGeneration += 1
    presentation = DeckPresentation(state: .refused)
  }

  private func removeMissingDeck() {
    generation += 1
    readGeneration += 1
    presentation.writing = false
    let missingID = presentation.selectedDeckID
    presentation.decks.removeAll { $0.deckID == missingID }
    presentation.selectedDeckID = nil
    presentation.deck = nil
    presentation.state = presentation.decks.isEmpty ? .empty : .loaded
  }

  private func isRefusal(_ error: any Error) -> Bool {
    switch error {
    case DeckFailure.unauthenticated, DeckFailure.forbidden, SessionFailure.unauthenticated:
      return true
    default: return false
    }
  }
}
