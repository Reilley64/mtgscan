import Foundation

@MainActor
private final class QueryRemote: CollectionService {
  var result = CollectionSearchPage(copies: [])
  var failure: CollectionFailure?
  var pending: [String: CheckedContinuation<CollectionSearchPage, Error>] = [:]
  var suspend = false
  var cursors: [String?] = []

  func browse(accountID: String) async throws -> [CollectionCopy] { result.copies }
  func copy(accountID: String, copyID: String) async throws -> CollectionCopy {
    if let failure { throw failure }
    guard let copy = result.copies.first(where: { $0.copyID == copyID }) else {
      throw CollectionFailure.notFound
    }
    return copy
  }
  func search(accountID: String, query: CollectionSearchQuery, cursor: String?) async throws
    -> CollectionSearchPage
  {
    cursors.append(cursor)
    if let failure { throw failure }
    if suspend { return try await withCheckedThrowingContinuation { pending[query.json] = $0 } }
    return result
  }
}

enum CollectionQueryTests {
  @MainActor
  static func run() async throws {
    let copy = try JSONDecoder().decode(
      CollectionCopy.self,
      from: Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/collection-copy.json")))
    let remote = QueryRemote()
    var now: TimeInterval = 0
    let controller = CollectionController(api: remote, now: { now })
    controller.setAccount("synthetic-a")
    remote.result = CollectionSearchPage(
      copies: [copy],
      basicLands: [CollectionBasicLand(oracleID: "island", name: "Island", imageURIs: [])],
      totalCount: 2, nextCursor: "page-two")
    await controller.reload()
    precondition(controller.presentation.copies == [copy])
    precondition(controller.presentation.visibleBasicLands.isEmpty)
    remote.result = CollectionSearchPage(copies: [copy])
    await controller.loadMore()
    precondition(controller.presentation.copies == [copy])
    precondition(controller.presentation.visibleBasicLands.map(\.name) == ["Island"])
    await controller.focus()
    precondition(remote.cursors.last! == nil)
    precondition(controller.presentation.scrollRevision > 0)

    remote.suspend = true
    let firstQuery = CollectionSearchQuery(json: "{\"text\":\"snow\"}")
    let secondQuery = CollectionSearchQuery(json: "{\"text\":\"island\"}")
    let first = Task { await controller.search(firstQuery, searching: true) }
    while remote.pending[firstQuery.json] == nil { await Task.yield() }
    precondition(
      controller.presentation.state == .loading && controller.presentation.copies.isEmpty)
    let second = Task { await controller.search(secondQuery, searching: true) }
    while remote.pending[secondQuery.json] == nil { await Task.yield() }
    remote.pending[secondQuery.json]?.resume(returning: CollectionSearchPage(copies: []))
    await second.value
    remote.pending[firstQuery.json]?.resume(returning: CollectionSearchPage(copies: [copy]))
    await first.value
    precondition(controller.presentation.state == .empty && controller.presentation.copies.isEmpty)
    precondition(controller.presentation.message == "No cards found")
    remote.suspend = false
    remote.failure = .query(
      code: "invalid_argument", field: "sets[0]", message: "No set named \"zzz\".")
    await controller.reload()
    precondition(controller.presentation.state == .queryRefused)
    precondition(controller.presentation.queryError?.field == "sets[0]")
    remote.failure = .forbidden
    await controller.reload()
    precondition(
      controller.presentation.state == .refused && controller.presentation.copies.isEmpty)
    controller.setAccount("synthetic-b")
    precondition(controller.presentation.searchOptions.decks.isEmpty)
    remote.failure = nil
    remote.result = CollectionSearchPage(copies: [copy])
    await controller.open(copy.copyID)
    await controller.closeCopy()
    now = 301
    remote.failure = .unavailable
    await controller.open(copy.copyID)
    precondition(controller.presentation.state == .failed && controller.presentation.copy == nil)
    print(
      "Collection query unit checks passed: new-search loading, late replies, pagination, focus restart, field refusal, account clearing and five-minute cache expiry."
    )
  }
}
