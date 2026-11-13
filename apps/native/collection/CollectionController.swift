import Foundation

enum CollectionFailure: Error {
  case unauthenticated
  case forbidden
  case notFound
  case unavailable
}

@MainActor
protocol CollectionService {
  func browse(accountID: String) async throws -> [CollectionCopy]
  func copy(accountID: String, copyID: String) async throws -> CollectionCopy
}

enum CollectionState: Equatable {
  case signedOut
  case loading
  case empty
  case loaded
  case failed
  case refused
  case missing
}

struct CollectionPresentation {
  var state: CollectionState = .signedOut
  var copies: [CollectionCopy] = []
  var copy: CollectionCopy?
  var selectedCopyID: String?
  var refreshing = false

  var message: String? {
    switch state {
    case .signedOut: return nil
    case .loading: return selectedCopyID == nil ? "Loading collection" : "Loading card"
    case .empty: return "Your collection is empty"
    case .failed:
      return selectedCopyID == nil ? "Could not load your collection" : "Could not load this card"
    case .refused: return "Your session ended. Sign in again."
    case .missing: return "This card is no longer in your collection."
    case .loaded: return nil
    }
  }
}

@MainActor
final class CollectionController {
  private let api: any CollectionService
  private var accountID: String?
  private var generation = 0
  private var copyCache: [String: CollectionCopy] = [:]
  private(set) var presentation = CollectionPresentation()
  var onChange: (() -> Void)?

  init(api: any CollectionService) { self.api = api }

  func bind(to session: SessionController) {
    session.onAccountChange = { [weak self] accountID in
      guard let self else { return }
      if self.setAccount(accountID), accountID != nil {
        Task { await self.reload() }
      }
    }
    session.onAccountChange?(session.presentation.accountID)
  }

  @discardableResult
  func setAccount(_ accountID: String?) -> Bool {
    guard self.accountID != accountID else { return false }
    generation += 1
    self.accountID = accountID
    copyCache.removeAll()
    presentation = CollectionPresentation(state: accountID == nil ? .signedOut : .loading)
    onChange?()
    return true
  }

  func reload() async {
    guard let accountID else { return }
    generation += 1
    let operation = generation
    let copyID = presentation.selectedCopyID
    if presentation.copy == nil && (copyID != nil || presentation.copies.isEmpty) {
      presentation.state = .loading
    }
    presentation.refreshing = true
    onChange?()
    do {
      if let copyID {
        let copy = try await api.copy(accountID: accountID, copyID: copyID)
        guard operation == generation else { return }
        copyCache[copyID] = copy
        presentation.copy = copy
        presentation.state = .loaded
      } else {
        let copies = try await api.browse(accountID: accountID)
        guard operation == generation else { return }
        presentation.copies = copies
        presentation.state = copies.isEmpty ? .empty : .loaded
      }
    } catch {
      guard operation == generation else { return }
      presentation.copy = nil
      if copyID == nil { presentation.copies.removeAll() }
      switch error {
      case CollectionFailure.unauthenticated, CollectionFailure.forbidden,
        SessionFailure.unauthenticated:
        copyCache.removeAll()
        presentation.copies.removeAll()
        presentation.state = .refused
      case CollectionFailure.notFound:
        if let copyID { copyCache.removeValue(forKey: copyID) }
        presentation.state = .missing
      default: presentation.state = .failed
      }
    }
    presentation.refreshing = false
    onChange?()
  }

  func open(_ copyID: String) async {
    guard accountID != nil else { return }
    generation += 1
    presentation.selectedCopyID = copyID
    presentation.copy = copyCache[copyID]
    presentation.state = presentation.copy == nil ? .loading : .loaded
    await reload()
  }

  func closeCopy() async {
    guard accountID != nil else { return }
    generation += 1
    presentation.selectedCopyID = nil
    presentation.copy = nil
    presentation.state = presentation.copies.isEmpty ? .loading : .loaded
    await reload()
  }
}
