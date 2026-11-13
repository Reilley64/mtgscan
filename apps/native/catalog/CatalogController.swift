import Foundation

enum CatalogFailure: Error {
  case refused
  case unavailable
  case notFound
  case invalid(code: String, field: String?)
}

@MainActor
protocol CatalogService {
  func search(accountID: String, query: CatalogQuery) async throws -> CatalogSearchPage
  func cards(accountID: String, oracleID: String?, printingID: String?) async throws
    -> CatalogCardsPage
  func printings(accountID: String, oracleID: String, ownedOnly: Bool, cursor: String?) async throws
    -> CatalogPrintingsPage
  func tags(accountID: String, text: String) async throws -> CatalogTagsPage
}

enum CatalogState: Equatable {
  case signedOut, idle, loading, loaded, empty, failed, refused, missing
}

struct CatalogPresentation {
  var state: CatalogState = .signedOut
  var query = CatalogQuery()
  var items: [CatalogRow] = []
  var nextCursor: String?
  var card: CatalogCard?
  var selectedOracleID: String?
  var selectedPrintingID: String?
  var printings: [CatalogPrinting] = []
  var printingCursor: String?
  var ownedOnly = false
  var finish = "nonfoil"
  var tags: [CatalogOracleTag] = []
  var message: String?
  var printingMessage: String?
  var tagMessage: String?
  var loadingMore = false
  var loadingPrintings = false
  var rulesStale = false
  var pricesStale = false
}

@MainActor
final class CatalogController {
  private let api: any CatalogService
  private var accountID: String?
  private var generation = 0
  private var tagGeneration = 0
  private var debounce: Task<Void, Never>?
  private var tagDebounce: Task<Void, Never>?
  private(set) var presentation = CatalogPresentation()
  var onChange: (() -> Void)?

  init(api: any CatalogService) { self.api = api }

  func setAccount(_ accountID: String?) {
    guard self.accountID != accountID else { return }
    generation += 1
    tagGeneration += 1
    debounce?.cancel()
    tagDebounce?.cancel()
    self.accountID = accountID
    presentation = CatalogPresentation(state: accountID == nil ? .signedOut : .idle)
    onChange?()
  }

  func schedule(_ query: CatalogQuery) {
    guard accountID != nil else { return }
    prepare(query)
    debounce?.cancel()
    debounce = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
      guard !Task.isCancelled else { return }
      await self?.reload()
    }
  }

  func search(_ query: CatalogQuery) async {
    guard accountID != nil else { return }
    debounce?.cancel()
    prepare(query)
    await reload()
  }

  private func prepare(_ query: CatalogQuery) {
    generation += 1
    presentation.query = query
    presentation.items.removeAll()
    presentation.nextCursor = nil
    presentation.card = nil
    presentation.selectedOracleID = nil
    presentation.selectedPrintingID = nil
    presentation.printings.removeAll()
    presentation.printingCursor = nil
    presentation.loadingMore = false
    presentation.loadingPrintings = false
    presentation.message = nil
    presentation.state = query.hasCriteria ? .loading : .idle
    onChange?()
  }

  func reload() async {
    guard let accountID else { return }
    if presentation.selectedOracleID != nil {
      await loadCard(refreshPrintings: true)
      return
    }
    guard presentation.query.hasCriteria else { return }
    generation += 1
    let operation = generation
    presentation.message = nil
    if presentation.items.isEmpty { presentation.state = .loading }
    onChange?()
    do {
      let page = try await api.search(accountID: accountID, query: presentation.query)
      guard operation == generation else { return }
      presentation.items = page.items
      presentation.nextCursor = page.nextCursor
      presentation.rulesStale = page.rulesStale
      presentation.pricesStale = page.pricesStale
      presentation.state = page.items.isEmpty ? .empty : .loaded
    } catch {
      guard operation == generation else { return }
      fail(error)
    }
    onChange?()
  }

  func more() async {
    guard let accountID, let cursor = presentation.nextCursor, !presentation.loadingMore else {
      return
    }
    generation += 1
    let operation = generation
    var query = presentation.query
    query.fields["cursor"] = .text(cursor)
    presentation.loadingMore = true
    presentation.message = nil
    onChange?()
    do {
      let page = try await api.search(accountID: accountID, query: query)
      guard operation == generation else { return }
      presentation.items.append(contentsOf: page.items)
      presentation.nextCursor = page.nextCursor
      presentation.rulesStale = page.rulesStale
      presentation.pricesStale = page.pricesStale
    } catch {
      guard operation == generation else { return }
      fail(error)
    }
    presentation.loadingMore = false
    onChange?()
  }

  func open(_ oracleID: String) async {
    guard accountID != nil else { return }
    presentation.selectedOracleID = oracleID
    presentation.selectedPrintingID = nil
    presentation.card = nil
    presentation.printings.removeAll()
    presentation.printingCursor = nil
    presentation.ownedOnly = false
    presentation.loadingPrintings = false
    await loadCard(refreshPrintings: true)
  }

  func selectPrinting(_ printingID: String) async {
    guard presentation.printings.contains(where: { $0.printingId == printingID }) else { return }
    presentation.selectedPrintingID = printingID
    presentation.card = nil
    await loadCard()
  }

  private func loadCard(refreshPrintings: Bool = false) async {
    guard let accountID, let oracleID = presentation.selectedOracleID else { return }
    generation += 1
    let operation = generation
    presentation.loadingPrintings = false
    presentation.state = .loading
    presentation.message = nil
    onChange?()
    do {
      let page = try await api.cards(
        accountID: accountID, oracleID: presentation.selectedPrintingID == nil ? oracleID : nil,
        printingID: presentation.selectedPrintingID)
      guard operation == generation else { return }
      guard let card = page.items.first(where: { $0.oracleId == oracleID }) else {
        throw CatalogFailure.notFound
      }
      presentation.card = card
      presentation.rulesStale = page.rulesStale
      presentation.pricesStale = page.pricesStale
      presentation.state = .loaded
      if refreshPrintings || presentation.printings.isEmpty { await loadPrintings(reset: true) }
      guard operation == generation else { return }
      normalizePrinting()
    } catch {
      guard operation == generation else { return }
      fail(error)
    }
    onChange?()
  }

  func loadPrintings(reset: Bool = false) async {
    guard let accountID, let oracleID = presentation.selectedOracleID,
      !presentation.loadingPrintings,
      reset || presentation.printingCursor != nil
    else { return }
    let operation = generation
    presentation.loadingPrintings = true
    presentation.printingMessage = nil
    onChange?()
    do {
      let page = try await api.printings(
        accountID: accountID, oracleID: oracleID, ownedOnly: presentation.ownedOnly,
        cursor: reset ? nil : presentation.printingCursor)
      guard operation == generation else { return }
      if reset {
        presentation.printings = page.items
      } else {
        presentation.printings.append(contentsOf: page.items)
      }
      presentation.printingCursor = page.nextCursor
      normalizePrinting()
    } catch {
      guard operation == generation else { return }
      if case CatalogFailure.refused = error {
        fail(error)
      } else if case SessionFailure.unauthenticated = error {
        fail(error)
      } else {
        presentation.printingMessage = "Could not load card printings"
      }
    }
    presentation.loadingPrintings = false
    onChange?()
  }

  func showOwnedPrintings(_ ownedOnly: Bool) async {
    guard accountID != nil else { return }
    generation += 1
    presentation.loadingPrintings = false
    presentation.ownedOnly = ownedOnly
    presentation.printings.removeAll()
    presentation.printingCursor = nil
    await loadPrintings(reset: true)
  }

  func selectFinish(_ finish: String) {
    guard presentation.card?.printing?.finishes.contains(finish) == true else { return }
    presentation.finish = finish
    onChange?()
  }

  private func normalizePrinting() {
    if presentation.card?.printing == nil {
      let printing = presentation.printings.first
      presentation.card?.printing = printing
    }
    let finishes = presentation.card?.printing?.finishes ?? []
    if !finishes.contains(presentation.finish) { presentation.finish = finishes.first ?? "nonfoil" }
  }

  func closeCard() {
    guard accountID != nil else { return }
    generation += 1
    presentation.card = nil
    presentation.selectedOracleID = nil
    presentation.selectedPrintingID = nil
    presentation.printings.removeAll()
    presentation.loadingPrintings = false
    if presentation.state != .refused {
      presentation.message = nil
      presentation.state =
        !presentation.query.hasCriteria ? .idle : presentation.items.isEmpty ? .empty : .loaded
    }
    onChange?()
  }

  func scheduleTags(_ text: String) {
    guard accountID != nil else { return }
    tagGeneration += 1
    tagDebounce?.cancel()
    presentation.tags.removeAll()
    presentation.tagMessage = nil
    onChange?()
    tagDebounce = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
      guard !Task.isCancelled else { return }
      await self?.lookupTags(text)
    }
  }

  func lookupTags(_ text: String) async {
    guard let accountID else { return }
    tagGeneration += 1
    let operation = tagGeneration
    presentation.tags.removeAll()
    presentation.tagMessage = nil
    guard !text.isEmpty else {
      onChange?()
      return
    }
    do {
      let page = try await api.tags(accountID: accountID, text: text)
      guard operation == tagGeneration else { return }
      presentation.tags = page.items
    } catch {
      guard operation == tagGeneration else { return }
      if case CatalogFailure.refused = error {
        fail(error)
      } else if case SessionFailure.unauthenticated = error {
        fail(error)
      } else {
        presentation.tagMessage = "Could not load Oracle tags"
      }
    }
    onChange?()
  }

  private func fail(_ error: Error) {
    switch error {
    case CatalogFailure.refused, SessionFailure.unauthenticated:
      generation += 1
      tagGeneration += 1
      debounce?.cancel()
      tagDebounce?.cancel()
      presentation.items.removeAll()
      presentation.card = nil
      presentation.printings.removeAll()
      presentation.tags.removeAll()
      presentation.nextCursor = nil
      presentation.state = .refused
      presentation.message = "Your session ended. Sign in again."
    case CatalogFailure.notFound:
      presentation.card = nil
      presentation.state = .missing
      presentation.message = "This card is no longer in the card catalog."
    case CatalogFailure.invalid(let code, let field):
      presentation.items.removeAll()
      presentation.nextCursor = nil
      presentation.state = .failed
      presentation.message =
        code == "invalid_cursor" ? "The page expired. Search again." : fieldMessage(field)
    default:
      let hasContent =
        presentation.selectedOracleID == nil
        ? !presentation.items.isEmpty : presentation.card != nil
      presentation.state = hasContent ? .loaded : .failed
      presentation.message =
        presentation.selectedOracleID == nil
        ? "Could not load the card catalog" : "Could not load this card"
    }
  }

  private func fieldMessage(_ field: String?) -> String {
    guard let field else { return "Search needs text or at least one filter." }
    let parts = field.split(separator: "[")
    if parts.count == 2, let index = Int(parts[1].dropLast()),
      case .list(let values)? = presentation.query.fields[String(parts[0])],
      values.indices.contains(index)
    {
      let kind =
        parts[0].hasPrefix("sets")
        ? "set"
        : parts[0].hasPrefix("tags")
          ? "Oracle tag" : parts[0].hasPrefix("keywords") ? "keyword" : nil
      if let kind { return "No \(kind) named \"\(values[index])\"." }
    }
    return "\(field) is not a valid chip."
  }
}
