import Foundation

func catalogFixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
  let data = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/catalog-\(name).json"))
  return try CatalogDecoding.decoder().decode(type, from: data)
}

@MainActor
final class CatalogRemote: CatalogService {
  var failure: CatalogFailure?
  var printingFailure: CatalogFailure?
  var omitOraclePrinting = false
  var foilOnly = false
  var printingRequests: [(ownedOnly: Bool, cursor: String?)] = []
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
    if printingID == nil && omitOraclePrinting { page.items[0].printing = nil }
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
    printingRequests.append((ownedOnly, cursor))
    if let printingFailure { throw printingFailure }
    var page = try catalogFixture("printings", as: CatalogPrintingsPage.self)
    if foilOnly {
      page.items = [
        CatalogPrinting(
          printingId: "20000000-0000-4000-8000-000000000003", set: "syn",
          setName: "Synthetic set", collectorNumber: "1", rarity: "rare", finishes: ["foil"],
          releasedAt: "2026-01-01", imageUris: ["https://fixture.invalid/card"],
          artCropUri: "https://fixture.invalid/art", artist: "Synthetic artist", ownedQuantity: 1)
      ]
    }
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
  private static func ownedPrintingsFailure() async throws {
    let remote = CatalogRemote()
    let controller = CatalogController(api: remote)
    controller.setAccount("owner-a")
    await controller.open("10000000-0000-4000-8000-000000000001")
    precondition(!controller.presentation.printings.isEmpty)
    precondition(controller.presentation.printingCursor != nil)
    remote.printingFailure = .unavailable
    await controller.showOwnedPrintings(true)
    precondition(controller.presentation.ownedOnly)
    precondition(
      controller.presentation.printings.isEmpty,
      "Failed owned-only transition must clear incompatible rows")
    precondition(controller.presentation.printingCursor == nil)
    remote.printingFailure = nil
    await controller.loadPrintings(reset: true)
    precondition(controller.presentation.printings.allSatisfy { ($0.ownedQuantity ?? 0) > 0 })
    precondition(remote.printingRequests.last?.ownedOnly == true)
    precondition(remote.printingRequests.last?.cursor == nil)
  }

  @MainActor
  private static func initialPrintingRetry() async throws {
    let remote = CatalogRemote()
    remote.omitOraclePrinting = true
    remote.foilOnly = true
    remote.printingFailure = .unavailable
    let controller = CatalogController(api: remote)
    controller.setAccount("owner-a")
    await controller.open("10000000-0000-4000-8000-000000000001")
    precondition(controller.presentation.card != nil)
    precondition(controller.presentation.card?.printing == nil)
    precondition(controller.presentation.printingMessage != nil)
    remote.printingFailure = nil
    await controller.loadPrintings(reset: true)
    precondition(
      controller.presentation.card?.printing == controller.presentation.printings.first,
      "Retry must restore fallback printing")
    precondition(controller.presentation.card?.printing?.artCropUri != nil)
    precondition(controller.presentation.finish == "foil")
  }

  @MainActor
  private static func paginationResumesAfterOpeningACard() async throws {
    let remote = CatalogRemote()
    let controller = CatalogController(api: remote)
    controller.setAccount("owner-a")
    await controller.search(CatalogQuery(fields: ["text": .text("ring")]))
    remote.suspend = true
    let oldPage = Task { await controller.more() }
    while remote.pending == nil { await Task.yield() }
    precondition(controller.presentation.loadingMore)
    remote.suspend = false
    await controller.open("10000000-0000-4000-8000-000000000001")
    controller.closeCard()
    remote.pending?.resume(returning: try catalogFixture("search", as: CatalogSearchPage.self))
    await oldPage.value
    precondition(!controller.presentation.loadingMore)
    precondition(controller.presentation.nextCursor == "opaque-search-cursor")
    await controller.more()
    precondition(controller.presentation.items.count == 3)
    precondition(controller.presentation.nextCursor == nil)
  }

  @MainActor
  private static func obsoletePaginationDoesNotClearANewerPage() async throws {
    let remote = CatalogRemote()
    let controller = CatalogController(api: remote)
    controller.setAccount("owner-a")
    await controller.search(CatalogQuery(fields: ["text": .text("ring")]))
    remote.suspend = true
    let oldPage = Task { await controller.more() }
    while remote.pending == nil { await Task.yield() }
    let oldReply = remote.pending!
    remote.pending = nil
    remote.suspend = false
    await controller.reload()
    precondition(!controller.presentation.loadingMore)
    remote.suspend = true
    let newPage = Task { await controller.more() }
    while remote.pending == nil { await Task.yield() }
    let newReply = remote.pending!
    remote.pending = nil
    oldReply.resume(returning: try catalogFixture("search", as: CatalogSearchPage.self))
    await oldPage.value
    precondition(controller.presentation.loadingMore)
    precondition(controller.presentation.items.count == 2)
    var next = try catalogFixture("search", as: CatalogSearchPage.self)
    next.items = [next.items[1]]
    next.nextCursor = nil
    newReply.resume(returning: next)
    await newPage.value
    precondition(!controller.presentation.loadingMore)
    precondition(controller.presentation.items.count == 3)
    precondition(controller.presentation.nextCursor == nil)
  }

  @MainActor
  static func run() async throws {
    try await ownedPrintingsFailure()
    try await initialPrintingRetry()
    try await paginationResumesAfterOpeningACard()
    try await obsoletePaginationDoesNotClearANewerPage()
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
