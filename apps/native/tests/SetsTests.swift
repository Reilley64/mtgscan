import Foundation

@MainActor
final class MemoryFinishView: FinishViewStore {
  var value: FinishView?
  var unavailable = false
  func load() throws -> FinishView? { value }
  func save(_ view: FinishView) throws {
    if unavailable { throw SessionFailure.storage }
    value = view
  }
}

@MainActor
final class SetsRemote: SetsService {
  let details: SetDetails
  var failure: SetsFailure?
  var suspend = false
  var pending: CheckedContinuation<SetList, Error>?
  var suspendDetails = false
  var pendingDetails: CheckedContinuation<SetDetails, Error>?
  var detailsReads = 0
  var staleCursor = false
  var pages: [String?: SetList] = [:]

  init(details: SetDetails) { self.details = details }
  func sets(accountID: String, text: String, finishView: FinishView, cursor: String?) async throws
    -> SetList
  {
    if let failure { throw failure }
    if staleCursor && cursor != nil { throw SetsFailure.invalidCursor }
    if suspend { return try await withCheckedThrowingContinuation { pending = $0 } }
    return pages[cursor] ?? SetList(items: [details.summary], nextCursor: nil)
  }
  func set(accountID: String, code: String) async throws -> SetDetails {
    detailsReads += 1
    if suspendDetails {
      return try await withCheckedThrowingContinuation { pendingDetails = $0 }
    }
    if let failure { throw failure }
    return details
  }
}

enum SetsTests {
  @MainActor
  private static func reopenedSetRetainsContentDuringRevalidation() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/set-page.json"))
    let details = try JSONDecoder().decode(SetDetails.self, from: fixture)
    let remote = SetsRemote(details: details)
    let controller = SetsController(api: remote, store: MemoryFinishView())
    controller.setAccount("owner-a")
    await controller.open("tst")
    await controller.closeSet()
    remote.suspendDetails = true
    let reopen = Task { await controller.open("tst") }
    while remote.pendingDetails == nil { await Task.yield() }
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.details?.summary.name == "Test set")
    precondition(controller.presentation.refreshing)
    remote.pendingDetails?.resume(throwing: SetsFailure.unavailable)
    await reopen.value
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.details?.summary.name == "Test set")
    precondition(controller.presentation.notice == "Could not load this set")
    precondition(!controller.presentation.refreshing)
  }

  @MainActor
  private static func warmLifetimeStartsAtCloseAndExpires() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/set-page.json"))
    let details = try JSONDecoder().decode(SetDetails.self, from: fixture)
    let remote = SetsRemote(details: details)
    var seconds: TimeInterval = 1000
    let controller = SetsController(
      api: remote, store: MemoryFinishView(), now: { Date(timeIntervalSince1970: seconds) })
    controller.setAccount("owner-a")
    await controller.open("tst")
    seconds = 2000
    await controller.closeSet()
    seconds = 2299
    remote.failure = .unavailable
    await controller.open("tst")
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.details?.summary.name == "Test set")
    remote.failure = nil
    await controller.closeSet()
    seconds = 2600
    remote.suspendDetails = true
    let expired = Task { await controller.open("tst") }
    while remote.pendingDetails == nil { await Task.yield() }
    precondition(controller.presentation.state == .loading)
    precondition(controller.presentation.details == nil)
    remote.pendingDetails?.resume(throwing: SetsFailure.unavailable)
    await expired.value
    precondition(controller.presentation.state == .failed)
    precondition(controller.presentation.details == nil)
  }

  @MainActor
  private static func cachedSetsClearOnAccountChangeAndRefusal() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/set-page.json"))
    let details = try JSONDecoder().decode(SetDetails.self, from: fixture)
    for failure in [SetsFailure.unauthenticated, .forbidden, .notFound] {
      let remote = SetsRemote(details: details)
      let controller = SetsController(api: remote, store: MemoryFinishView())
      controller.setAccount("owner-a")
      await controller.open("tst")
      await controller.closeSet()
      remote.failure = failure
      await controller.open("tst")
      remote.failure = nil
      remote.suspendDetails = true
      let retry = Task { await controller.open("tst") }
      while remote.pendingDetails == nil { await Task.yield() }
      precondition(controller.presentation.details == nil)
      precondition(controller.presentation.state == .loading)
      remote.pendingDetails?.resume(throwing: SetsFailure.unavailable)
      await retry.value
    }
    for account: String? in ["owner-b", nil] {
      let remote = SetsRemote(details: details)
      let controller = SetsController(api: remote, store: MemoryFinishView())
      controller.setAccount("owner-a")
      await controller.open("tst")
      await controller.closeSet()
      controller.setAccount(account)
      controller.setAccount("owner-b")
      remote.suspendDetails = true
      let newAccount = Task { await controller.open("tst") }
      while remote.pendingDetails == nil { await Task.yield() }
      precondition(controller.presentation.details == nil)
      precondition(controller.presentation.state == .loading)
      remote.pendingDetails?.resume(throwing: SetsFailure.unavailable)
      await newAccount.value
    }
  }

  @MainActor
  static func run() async throws {
    try await reopenedSetRetainsContentDuringRevalidation()
    try await warmLifetimeStartsAtCloseAndExpires()
    try await cachedSetsClearOnAccountChangeAndRefusal()
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/set-page.json"))
    let details = try JSONDecoder().decode(SetDetails.self, from: fixture)
    let remote = SetsRemote(details: details)
    let store = MemoryFinishView()
    let controller = SetsController(api: remote, store: store, pause: {})
    precondition(controller.presentation.finishView == .any)
    controller.setAccount("owner-a")
    await controller.reload()
    precondition(controller.presentation.items.first?.name == "Test set")
    await controller.open("tst")
    precondition(
      controller.presentation.details?.mainSet.first?.spoken(.any) == "Card, number 1, not owned")
    await controller.choose(.foil)
    precondition(remote.detailsReads == 1)
    precondition(controller.presentation.details?.summary.completion[.foil].count == "0 of 0")
    precondition(controller.presentation.details?.summary.completion[.foil].percent == nil)
    precondition(controller.presentation.details?.summary.completion[.foil].complete == false)
    precondition(
      controller.presentation.details?.summary.completion[.foil].spoken("Test set")
        == "Test set, 0 of 0")
    precondition(SetsController(api: remote, store: store).presentation.finishView == .foil)
    await controller.closeSet()
    precondition(controller.presentation.code == nil)
    remote.failure = .unavailable
    await controller.reload()
    precondition(controller.presentation.items.first?.code == "tst")
    precondition(controller.presentation.notice == "Could not load Sets")
    for failure in [SetsFailure.unauthenticated, .forbidden] {
      remote.failure = failure
      await controller.reload()
      precondition(controller.presentation.state == .refused)
      precondition(controller.presentation.items.isEmpty && controller.presentation.details == nil)
    }
    remote.failure = nil
    await controller.search("BLOOM")
    precondition(controller.presentation.searchText == "BLOOM")
    await controller.search("")
    remote.suspend = true
    let late = Task { await controller.reload() }
    while remote.pending == nil { await Task.yield() }
    controller.setAccount("owner-b")
    remote.pending?.resume(returning: SetList(items: [details.summary], nextCursor: nil))
    await late.value
    precondition(controller.presentation.items.isEmpty && controller.presentation.details == nil)
    precondition(controller.presentation.state == .loading)
    controller.setAccount(nil)
    precondition(controller.presentation.state == .signedOut)
    precondition(controller.presentation.finishView == .foil)
    precondition(SetCompletion(owned: 2, size: 3).percent == 66)
    precondition(PresentationData.setArtScrim.count == 2)
    precondition(PresentationData.setArtScrim[0].rgba[3] == 0.8509803921568627)
    precondition(PresentationData.setArtScrim[1].location == 0.7)
    let pagedRemote = SetsRemote(details: details)
    let rows = (0..<20).map { index in
      CardSet(
        code: "s\(index)", name: "Set \(index)", releasedAt: "2026-01-01",
        iconSVGURI: "set.svg", setArtURI: nil, completion: details.summary.completion)
    }
    pagedRemote.pages[nil] = SetList(items: rows, nextCursor: "next")
    pagedRemote.pages["next"] = SetList(items: [details.summary], nextCursor: nil)
    let paged = SetsController(api: pagedRemote, store: MemoryFinishView())
    paged.setAccount("owner")
    await paged.reload()
    await paged.more()
    precondition(paged.presentation.items.count == 21 && paged.presentation.nextCursor == nil)
    await paged.reload()
    precondition(paged.presentation.items.count == 21)
    await paged.choose(.foil)
    precondition(paged.presentation.items.count == 20 && paged.presentation.nextCursor == "next")
    pagedRemote.staleCursor = true
    await paged.more()
    precondition(paged.presentation.items.count == 20 && paged.presentation.state == .loaded)
    precondition(!paged.presentation.loadingMore)
    store.unavailable = true
    remote.suspend = false
    controller.setAccount("owner")
    await controller.choose(.nonfoil)
    precondition(controller.presentation.notice == "Could not keep your finish view.")
  }
}

@MainActor
func runSetsServiceTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/set-page.json"))
  let api = SetsAPI(origin: URL(string: "https://api.test")!, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/sets")
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer token")
    let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
    precondition(query.contains(URLQueryItem(name: "text", value: "a&b")))
    precondition(query.contains(URLQueryItem(name: "finish_view", value: "foil")))
    precondition(query.contains(URLQueryItem(name: "cursor", value: "next: page")))
    return (200, Data(#"{"items":[],"next_cursor":null}"#.utf8))
  }
  let page = try await api.sets(
    text: "a&b", finishView: .foil, cursor: "next: page", accessToken: "token")
  precondition(page.items.isEmpty)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/sets/tst")
    precondition(request.url?.query == nil)
    return (200, fixture)
  }
  let details = try await api.set(code: "tst", accessToken: "token")
  precondition(details.summary.setArtURI == "art.jpg")
  let session = SessionController(
    provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(), api: AccountService(),
    now: { 1000 })
  let collection = CollectionController(api: CollectionRemote())
  collection.bind(to: session)
  let sets = SetsController(
    api: SessionSetsService(session: session, api: api), store: MemoryFinishView())
  sets.bind(to: session)
  await session.signIn(.apple)
  while collection.presentation.state == .loading { await Task.yield() }
  precondition(collection.presentation.state == .empty)
  AuthHTTPStub.reply = { request in
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    return (200, Data(#"{"items":["#.utf8) + fixture + Data(#"],"next_cursor":null}"#.utf8))
  }
  await sets.reload()
  precondition(sets.presentation.items.first?.code == "tst")
  await session.signOut()
  precondition(sets.presentation.state == .signedOut && sets.presentation.items.isEmpty)
  precondition(collection.presentation.state == .signedOut)
  for (status, failure) in [
    (401, SetsFailure.unauthenticated), (403, .forbidden), (404, .notFound), (503, .unavailable),
  ] {
    AuthHTTPStub.reply = { _ in (status, Data("private upstream body".utf8)) }
    do {
      _ = try await api.set(code: "tst", accessToken: "token")
      preconditionFailure("A failed set read cannot become a loaded set")
    } catch let actual as SetsFailure {
      precondition(String(describing: actual) == String(describing: failure))
    }
  }
}
