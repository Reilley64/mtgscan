import Foundation

func catalogFixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
  let data = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/catalog-\(name).json"))
  return try CatalogDecoding.decoder().decode(type, from: data)
}

@MainActor
final class CatalogRemote: CatalogService {
  var failure: CatalogFailure?
  var printingFailure: CatalogFailure?
  var suspend = false
  var pending: CheckedContinuation<CatalogSearchPage, Error>?

  func search(accountID: String, query: CatalogQuery) async throws -> CatalogSearchPage {
    if let failure { throw failure }
    if suspend { return try await withCheckedThrowingContinuation { pending = $0 } }
    var page = try catalogFixture("search", as: CatalogSearchPage.self)
    if query.fields["cursor"] == .text("opaque-search-cursor") {
      page.items = [page.items[1]]
      page.nextCursor = nil
    }
    return page
  }

  func cards(accountID: String, oracleID: String?, printingID: String?) async throws
    -> CatalogCardsPage
  {
    if let failure { throw failure }
    var page = try catalogFixture("cards", as: CatalogCardsPage.self)
    if printingID == "20000000-0000-4000-8000-000000000002" {
      let printings = try catalogFixture("printings", as: CatalogPrintingsPage.self)
      page.items[0].printing = printings.items[1]
    }
    return page
  }

  func printings(accountID: String, oracleID: String, ownedOnly: Bool, cursor: String?) async throws
    -> CatalogPrintingsPage
  {
    if let failure { throw failure }
    if let printingFailure { throw printingFailure }
    var page = try catalogFixture("printings", as: CatalogPrintingsPage.self)
    if cursor != nil {
      page.items = []
      page.nextCursor = nil
    }
    if ownedOnly { page.items = page.items.filter { ($0.ownedQuantity ?? 0) > 0 } }
    return page
  }

  func tags(accountID: String, text: String) async throws -> CatalogTagsPage {
    if let failure { throw failure }
    return try catalogFixture("tags", as: CatalogTagsPage.self)
  }
}

enum CatalogTests {
  @MainActor
  static func run() async throws {
    let remote = CatalogRemote()
    let controller = CatalogController(api: remote)
    precondition(controller.presentation.state == .signedOut)
    controller.setAccount("owner-a")
    precondition(controller.presentation.state == .idle)
    let query = CatalogQuery(fields: ["text": .text("ring"), "types_exclude": .list(["Creature"])])
    await controller.search(query)
    precondition(controller.presentation.items.map(\.name) == ["Sol Ring", "Ring of Three Wishes"])
    precondition(controller.presentation.items[0].owned.freeQuantity == 2)
    precondition(controller.presentation.items[1].priceFrom == nil)
    remote.failure = .unavailable
    await controller.more()
    precondition(controller.presentation.items.count == 2)
    precondition(controller.presentation.nextCursor == "opaque-search-cursor")
    precondition(controller.presentation.message == "Could not load the card catalog")
    remote.failure = nil
    await controller.more()
    precondition(
      controller.presentation.items.map(\.name) == [
        "Sol Ring", "Ring of Three Wishes", "Ring of Three Wishes",
      ])
    precondition(controller.presentation.nextCursor == nil)

    await controller.open("10000000-0000-4000-8000-000000000001")
    precondition(controller.presentation.card?.oracleText == "{T}: Add {C}{C}.")
    precondition(controller.presentation.printings.map(\.set) == ["c21", "lea"])
    precondition(controller.presentation.card?.owned.protectedFreeQuantity == 1)
    remote.printingFailure = .unavailable
    await controller.loadPrintings(reset: true)
    precondition(controller.presentation.card?.name == "Sol Ring")
    precondition(controller.presentation.printingMessage == "Could not load card printings")
    remote.printingFailure = nil
    await controller.loadPrintings(reset: true)
    precondition(controller.presentation.printingMessage == nil)
    await controller.selectPrinting("20000000-0000-4000-8000-000000000002")
    precondition(controller.presentation.card?.printing?.set == "lea")
    precondition(controller.presentation.card?.printing?.finishes == ["nonfoil"])
    await controller.lookupTags("mana stone")
    precondition(controller.presentation.tags.first?.slug == "mana-rock")
    precondition(controller.presentation.tags.first?.cardCount == 123)
    controller.closeCard()
    precondition(controller.presentation.items.count == 3)

    remote.failure = .invalid(code: "invalid_argument", field: "sets[0]")
    await controller.search(CatalogQuery(fields: ["sets": .list(["zzz"])]))
    precondition(controller.presentation.items.isEmpty)
    precondition(controller.presentation.message == "No set named \"zzz\".")
    remote.failure = .refused
    await controller.reload()
    precondition(controller.presentation.state == .refused)
    precondition(controller.presentation.items.isEmpty && controller.presentation.card == nil)
    precondition(controller.presentation.tags.isEmpty)
    remote.failure = nil
    await controller.search(query)
    precondition(controller.presentation.state == .loaded)

    remote.suspend = true
    let refusedRead = Task { await controller.search(query) }
    while remote.pending == nil { await Task.yield() }
    remote.failure = .refused
    await controller.lookupTags("mana")
    remote.pending?.resume(returning: try catalogFixture("search", as: CatalogSearchPage.self))
    await refusedRead.value
    precondition(controller.presentation.state == .refused)
    precondition(controller.presentation.items.isEmpty)
    remote.failure = nil
    remote.pending = nil

    let late = Task { await controller.search(query) }
    while remote.pending == nil { await Task.yield() }
    controller.setAccount("owner-b")
    remote.pending?.resume(returning: try catalogFixture("search", as: CatalogSearchPage.self))
    await late.value
    precondition(controller.presentation.items.isEmpty && controller.presentation.card == nil)
    precondition(controller.presentation.state == .idle)
    controller.setAccount(nil)
    precondition(controller.presentation.state == .signedOut)
    precondition(controller.presentation.query.fields.isEmpty)
    print(
      "Catalog unit checks passed: search, pagination, field refusal, retry, details, printings, Oracle tags and account isolation."
    )
  }
}
