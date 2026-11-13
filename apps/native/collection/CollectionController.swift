import Foundation

enum CollectionFailure: Error {
  case unauthenticated
  case forbidden
  case notFound
  case unavailable
  case query(code: String, field: String?, message: String)
}

@MainActor
protocol CollectionService {
  func options(accountID: String) async throws -> CollectionSearchOptions
  func browse(accountID: String) async throws -> [CollectionCopy]
  func search(accountID: String, query: CollectionSearchQuery, cursor: String?) async throws
    -> CollectionSearchPage
  func copy(accountID: String, copyID: String) async throws -> CollectionCopy
}

extension CollectionService {
  func options(accountID: String) async throws -> CollectionSearchOptions {
    CollectionSearchOptions()
  }
}

enum CollectionState: Equatable {
  case signedOut
  case loading
  case empty
  case loaded
  case failed
  case refused
  case queryRefused
  case missing
}

struct CollectionPresentation {
  var state: CollectionState = .signedOut
  var copies: [CollectionCopy] = []
  var copy: CollectionCopy?
  var selectedCopyID: String?
  var refreshing = false
  var loadingMore = false
  var moreFailed = false
  var searching = false
  var basicLands: [CollectionBasicLand] = []
  var totalCount: Int?
  var nextCursor: String?
  var queryError: CollectionQueryError?
  var searchOptions = CollectionSearchOptions()
  var optionsFailed = false
  var accountRevision = 0
  var scrollRevision = 0

  var visibleBasicLands: [CollectionBasicLand] { nextCursor == nil ? basicLands : [] }

  var message: String? {
    switch state {
    case .signedOut: return nil
    case .loading: return selectedCopyID == nil ? "Loading collection" : "Loading card"
    case .empty: return searching ? "No cards found" : "Your collection is empty"
    case .failed:
      return selectedCopyID == nil ? "Could not load your collection" : "Could not load this card"
    case .refused: return "Your session ended. Sign in again."
    case .queryRefused: return queryError?.message
    case .missing: return "This card is no longer in your collection."
    case .loaded: return nil
    }
  }
}

@MainActor
final class CollectionController {
  private let api: any CollectionService
  private let now: () -> TimeInterval
  private var accountID: String?
  private var generation = 0
  private var optionsGeneration = 0
  private var query = CollectionSearchQuery()
  private var copyCache: [String: (copy: CollectionCopy, expires: TimeInterval)] = [:]
  private var searchCache: [String: (page: CollectionSearchPage, expires: TimeInterval)] = [:]
  private(set) var presentation = CollectionPresentation()
  var onChange: (() -> Void)?

  init(
    api: any CollectionService,
    now: @escaping () -> TimeInterval = { Date.timeIntervalSinceReferenceDate }
  ) {
    self.api = api
    self.now = now
  }

  func bind(to session: SessionController) {
    session.onAccountChange = { [weak self] accountID in
      guard let self else { return }
      if self.setAccount(accountID), accountID != nil {
        Task { await self.reloadOptions() }
        Task { await self.reload() }
      }
    }
    session.onAccountChange?(session.presentation.accountID)
  }

  @discardableResult
  func setAccount(_ accountID: String?) -> Bool {
    guard self.accountID != accountID else { return false }
    generation += 1
    optionsGeneration += 1
    self.accountID = accountID
    copyCache.removeAll()
    searchCache.removeAll()
    query = CollectionSearchQuery()
    let revision = presentation.accountRevision + 1
    presentation = CollectionPresentation(state: accountID == nil ? .signedOut : .loading)
    presentation.accountRevision = revision
    onChange?()
    return true
  }

  func search(_ query: CollectionSearchQuery, searching: Bool) async {
    guard accountID != nil, self.query != query || presentation.searching != searching else {
      return
    }
    cacheSearch()
    generation += 1
    self.query = query
    presentation.selectedCopyID = nil
    presentation.copy = nil
    presentation.copies = []
    presentation.basicLands = []
    presentation.nextCursor = nil
    presentation.totalCount = nil
    presentation.searching = searching
    presentation.state = .loading
    presentation.queryError = nil
    presentation.scrollRevision += 1
    if let cached = searchCache[query.json], cached.expires > now() { show(cached.page) }
    await reload()
  }

  func refuseSearch(_ query: CollectionSearchQuery, message: String) {
    guard accountID != nil else { return }
    generation += 1
    self.query = query
    presentation.searching = true
    presentation.selectedCopyID = nil
    presentation.copy = nil
    presentation.refreshing = false
    presentation.loadingMore = false
    fail(
      CollectionFailure.query(code: "invalid_argument", field: nil, message: message), copyID: nil,
      previousState: presentation.state)
    onChange?()
  }

  func reloadOptions() async {
    guard let accountID else { return }
    let operation = optionsGeneration
    do {
      let options = try await api.options(accountID: accountID)
      guard operation == optionsGeneration, self.accountID == accountID else { return }
      optionsGeneration += 1
      presentation.searchOptions = options
      presentation.optionsFailed = false
    } catch {
      guard operation == optionsGeneration, self.accountID == accountID else { return }
      presentation.optionsFailed = true
      fail(error, copyID: presentation.selectedCopyID, previousState: presentation.state)
    }
    onChange?()
  }

  func reload() async {
    guard let accountID else { return }
    if presentation.optionsFailed {
      await reloadOptions()
      guard !presentation.optionsFailed, self.accountID == accountID else { return }
    }
    generation += 1
    let operation = generation
    let copyID = presentation.selectedCopyID
    let previousState = presentation.state
    if presentation.copy == nil && (copyID != nil || presentation.copies.isEmpty) {
      presentation.state = .loading
    }
    presentation.refreshing = true
    presentation.loadingMore = false
    presentation.moreFailed = false
    presentation.queryError = nil
    onChange?()
    do {
      if let copyID {
        let copy = try await api.copy(accountID: accountID, copyID: copyID)
        guard operation == generation else { return }
        copyCache[copyID] = (copy, now() + 300)
        presentation.copy = copy
        presentation.state = .loaded
      } else {
        let page = try await api.search(accountID: accountID, query: query, cursor: nil)
        guard operation == generation else { return }
        show(page)
        cacheSearch()
      }
    } catch {
      guard operation == generation else { return }
      fail(error, copyID: copyID, previousState: previousState)
    }
    presentation.refreshing = false
    onChange?()
  }

  func loadMore() async {
    guard let accountID, presentation.selectedCopyID == nil, let cursor = presentation.nextCursor,
      !presentation.loadingMore, !presentation.refreshing
    else { return }
    let operation = generation
    presentation.loadingMore = true
    presentation.moreFailed = false
    onChange?()
    do {
      let page = try await api.search(accountID: accountID, query: query, cursor: cursor)
      guard operation == generation else { return }
      var ids = Set(presentation.copies.map(\.copyID))
      presentation.copies += page.copies.filter { ids.insert($0.copyID).inserted }
      presentation.nextCursor = page.nextCursor
      cacheSearch()
    } catch {
      guard operation == generation else { return }
      if case CollectionFailure.query(let code, _, _) = error, code == "invalid_cursor" {
        presentation.scrollRevision += 1
        await reload()
        return
      }
      switch error {
      case CollectionFailure.unauthenticated, CollectionFailure.forbidden,
        SessionFailure.unauthenticated,
        CollectionFailure.query:
        fail(error, copyID: nil, previousState: .loaded)
      default:
        presentation.moreFailed = true
      }
    }
    presentation.loadingMore = false
    onChange?()
  }

  func focus() async {
    guard accountID != nil else { return }
    presentation.scrollRevision += 1
    await reload()
  }

  func invalidate() async {
    copyCache.removeAll()
    searchCache.removeAll()
    optionsGeneration += 1
    await reloadOptions()
    await focus()
  }

  func open(_ copyID: String) async {
    guard accountID != nil else { return }
    cacheSearch()
    generation += 1
    copyCache = copyCache.filter { $0.value.expires > now() }
    presentation.selectedCopyID = copyID
    presentation.copy = copyCache[copyID]?.copy
    presentation.state = presentation.copy == nil ? .loading : .loaded
    await reload()
  }

  func closeCopy() async {
    guard accountID != nil else { return }
    generation += 1
    if let copy = presentation.copy { copyCache[copy.copyID] = (copy, now() + 300) }
    presentation.selectedCopyID = nil
    presentation.copy = nil
    presentation.state = presentation.copies.isEmpty ? .loading : .loaded
    await focus()
  }

  private func show(_ page: CollectionSearchPage) {
    presentation.copies = page.copies
    presentation.basicLands = page.basicLands ?? []
    presentation.totalCount = page.totalCount
    presentation.nextCursor = page.nextCursor
    if let options = page.searchOptions {
      optionsGeneration += 1
      presentation.searchOptions = options
      presentation.optionsFailed = false
    }
    presentation.state = page.copies.isEmpty && presentation.basicLands.isEmpty ? .empty : .loaded
  }

  private func cacheSearch() {
    guard presentation.selectedCopyID == nil,
      presentation.state == .loaded || presentation.state == .empty
    else { return }
    searchCache = searchCache.filter { $0.value.expires > now() }
    searchCache[query.json] = (
      CollectionSearchPage(
        copies: presentation.copies, basicLands: presentation.basicLands,
        totalCount: presentation.totalCount, nextCursor: presentation.nextCursor,
        searchOptions: presentation.searchOptions), now() + 300
    )
  }

  private func fail(_ error: Error, copyID: String?, previousState: CollectionState) {
    switch error {
    case CollectionFailure.unauthenticated, CollectionFailure.forbidden,
      SessionFailure.unauthenticated:
      copyCache.removeAll()
      searchCache.removeAll()
      optionsGeneration += 1
      presentation.copy = nil
      presentation.copies = []
      presentation.basicLands = []
      presentation.nextCursor = nil
      presentation.searchOptions = CollectionSearchOptions()
      presentation.state = .refused
    case CollectionFailure.notFound:
      presentation.copy = nil
      if let copyID { copyCache.removeValue(forKey: copyID) } else { presentation.copies = [] }
      presentation.state = .missing
    case CollectionFailure.query(let code, let field, let message):
      presentation.queryError = CollectionQueryError(code: code, field: field, message: message)
      presentation.copies = []
      presentation.basicLands = []
      presentation.nextCursor = nil
      presentation.state = code == "data_unavailable" ? .failed : .queryRefused
    default:
      if previousState == .loaded || previousState == .empty {
        presentation.state = previousState
      } else {
        presentation.copy = nil
        if copyID == nil { presentation.copies = [] }
        presentation.state = .failed
      }
    }
  }
}
