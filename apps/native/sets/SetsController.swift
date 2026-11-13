import Foundation

@MainActor
protocol SetsService {
  func sets(accountID: String, text: String, finishView: FinishView, cursor: String?) async throws
    -> SetList
  func set(accountID: String, code: String) async throws -> SetDetails
}

@MainActor
protocol FinishViewStore {
  func load() throws -> FinishView?
  func save(_ view: FinishView) throws
}

enum SetsFailure: Error {
  case unauthenticated
  case forbidden
  case notFound
  case invalidCursor
  case unavailable
}

enum SetsState: Equatable {
  case signedOut, loading, loaded, failed, refused, missing
}

struct SetsPresentation {
  var accountRevision = 0
  var state: SetsState = .signedOut
  var items: [CardSet] = []
  var details: SetDetails?
  var code: String?
  var searchText = ""
  var finishView: FinishView = .any
  var nextCursor: String?
  var refreshing = false
  var loadingMore = false
  var notice: String?

  var message: String? {
    switch state {
    case .signedOut: return nil
    case .loading: return code == nil ? "Loading sets" : "Loading set"
    case .failed: return code == nil ? "Could not load Sets" : "Could not load this set"
    case .refused: return "Your session ended. Sign in again."
    case .missing: return "This set is no longer in the card catalog."
    case .loaded:
      return code == nil && items.isEmpty ? "No sets match \"\(searchText)\"." : nil
    }
  }
}

@MainActor
final class SetsController {
  private let api: any SetsService
  private let store: any FinishViewStore
  private let pause: () async throws -> Void
  private var accountID: String?
  private var generation = 0
  private var listNeedsReset = false
  private(set) var presentation = SetsPresentation()
  var onChange: (() -> Void)?

  init(
    api: any SetsService, store: any FinishViewStore,
    pause: @escaping () async throws -> Void = { try await Task.sleep(for: .milliseconds(300)) }
  ) {
    self.api = api
    self.store = store
    self.pause = pause
    presentation.finishView = (try? store.load()) ?? .any
  }

  func bind(to session: SessionController) {
    let previous = session.onAccountChange
    session.onAccountChange = { [weak self] accountID in
      previous?(accountID)
      self?.setAccount(accountID)
    }
    setAccount(session.presentation.accountID)
  }

  func setAccount(_ accountID: String?) {
    guard accountID != self.accountID else { return }
    generation += 1
    self.accountID = accountID
    let finishView = presentation.finishView
    let accountRevision = presentation.accountRevision + 1
    presentation = SetsPresentation(
      accountRevision: accountRevision, state: accountID == nil ? .signedOut : .loading,
      finishView: finishView)
    listNeedsReset = false
    onChange?()
  }

  func search(_ text: String) async {
    guard accountID != nil else { return }
    generation += 1
    let operation = generation
    presentation.searchText = text
    presentation.items = []
    presentation.nextCursor = nil
    presentation.state = .loading
    presentation.notice = nil
    onChange?()
    if !text.isEmpty {
      do { try await pause() } catch { return }
    }
    guard operation == generation else { return }
    await reload(reset: true)
  }

  func choose(_ view: FinishView) async {
    guard view != presentation.finishView else { return }
    presentation.finishView = view
    do {
      try store.save(view)
      presentation.notice = nil
    } catch {
      presentation.notice = "Could not keep your finish view."
    }
    listNeedsReset = true
    onChange?()
    if presentation.code == nil { await reload(reset: true) }
  }

  func open(_ code: String) async {
    guard accountID != nil else { return }
    generation += 1
    presentation.code = code
    presentation.details = nil
    presentation.state = .loading
    await reload()
  }

  func closeSet() async {
    guard accountID != nil else { return }
    generation += 1
    presentation.code = nil
    presentation.details = nil
    presentation.state = presentation.items.isEmpty ? .loading : .loaded
    await reload(reset: listNeedsReset)
  }

  func reload(reset: Bool = false) async {
    guard let accountID else { return }
    generation += 1
    let operation = generation
    let code = presentation.code
    let text = presentation.searchText
    let view = presentation.finishView
    let target = reset ? 20 : max(20, presentation.items.count)
    if reset && code == nil {
      presentation.items = []
      presentation.nextCursor = nil
    }
    let hasData =
      code == nil
      ? !presentation.items.isEmpty || presentation.state == .loaded : presentation.details != nil
    if !hasData { presentation.state = .loading }
    presentation.refreshing = true
    presentation.loadingMore = false
    onChange?()
    do {
      if let code {
        let details = try await api.set(accountID: accountID, code: code)
        guard operation == generation else { return }
        presentation.details = details
      } else {
        var items: [CardSet] = []
        var cursor: String?
        repeat {
          let page = try await api.sets(
            accountID: accountID, text: text, finishView: view, cursor: cursor)
          guard operation == generation else { return }
          items.append(contentsOf: page.items)
          guard page.nextCursor != cursor || cursor == nil else { throw SetsFailure.unavailable }
          cursor = page.nextCursor
        } while items.count < target && cursor != nil
        presentation.items = items
        presentation.nextCursor = cursor
        listNeedsReset = false
      }
      presentation.state = .loaded
      if presentation.notice != "Could not keep your finish view." { presentation.notice = nil }
    } catch {
      guard operation == generation else { return }
      fail(error, retaining: hasData)
    }
    presentation.refreshing = false
    onChange?()
  }

  func more() async {
    guard let accountID, let cursor = presentation.nextCursor, presentation.code == nil,
      !presentation.refreshing, !presentation.loadingMore, presentation.state == .loaded
    else { return }
    let operation = generation
    presentation.loadingMore = true
    presentation.notice = nil
    onChange?()
    do {
      let page = try await api.sets(
        accountID: accountID, text: presentation.searchText, finishView: presentation.finishView,
        cursor: cursor)
      guard operation == generation else { return }
      guard page.nextCursor != cursor else { throw SetsFailure.unavailable }
      let existing = Set(presentation.items.map(\.code))
      presentation.items.append(contentsOf: page.items.filter { !existing.contains($0.code) })
      presentation.nextCursor = page.nextCursor
    } catch {
      guard operation == generation else { return }
      if case SetsFailure.invalidCursor = error {
        await reload(reset: true)
        return
      }
      fail(error, retaining: true)
    }
    presentation.loadingMore = false
    onChange?()
  }

  private func fail(_ error: Error, retaining: Bool) {
    switch error {
    case SetsFailure.unauthenticated, SetsFailure.forbidden, SessionFailure.unauthenticated:
      presentation.items = []
      presentation.details = nil
      presentation.nextCursor = nil
      presentation.state = .refused
    case SetsFailure.notFound:
      presentation.details = nil
      presentation.state = .missing
    default:
      if retaining {
        presentation.notice =
          presentation.code == nil ? "Could not load Sets" : "Could not load this set"
      } else {
        presentation.state = .failed
      }
    }
  }
}
