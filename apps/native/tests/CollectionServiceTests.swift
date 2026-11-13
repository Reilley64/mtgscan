import Foundation

@MainActor
func runCollectionServiceTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let data = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/collection-copy.json"))
  let api = CollectionAPI(origin: URL(string: "https://api.test")!, http: http)
  let session = SessionController(
    provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(),
    api: AccountService(), now: { 1000 })
  let collection = CollectionController(api: SessionCollectionService(session: session, api: api))
  collection.bind(to: session)
  AuthHTTPStub.reply = { request in
    if request.url?.path == "/api/v1/collection/search-options" {
      return (200, Data(#"{"decks":[],"user_tags":[]}"#.utf8))
    }
    precondition(request.url?.path == "/api/v1/collection/copies")
    let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
    precondition(query == [URLQueryItem(name: "query", value: "{}")])
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    return (200, Data(#"{"copies":["#.utf8) + data + Data("]}".utf8))
  }
  await session.signIn(.apple)
  while collection.presentation.state == .loading { await Task.yield() }
  precondition(collection.presentation.copies.first?.printing.name == "Sol Ring")
  AuthHTTPStub.reply = { request in
    if request.url?.path == "/api/v1/collection/search-options" {
      return (200, Data(#"{"decks":[],"user_tags":[]}"#.utf8))
    }
    precondition(
      request.url?.path == "/api/v1/collection/copies/10000000-0000-4000-8000-000000000001")
    precondition(request.url?.query == nil)
    return (200, data)
  }
  await collection.open("10000000-0000-4000-8000-000000000001")
  precondition(collection.presentation.copy?.printing.faces.first?.oracleText == "{T}: Add {C}{C}.")
  await session.signOut()
  precondition(collection.presentation.state == .signedOut)
  precondition(collection.presentation.copy == nil && collection.presentation.copies.isEmpty)
  do {
    _ = try await session.withAccessToken(for: "account-1") { _ in true }
    preconditionFailure("A signed-out session cannot supply a collection credential")
  } catch SessionFailure.unauthenticated {}

  AuthHTTPStub.reply = { request in
    let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
    let query =
      try! JSONSerialization.jsonObject(with: Data(items[0].value!.utf8)) as! [String: Any]
    precondition(query["cursor"] as? String == "page-two")
    precondition(query["finishes"] as? [String] == ["foil"])
    precondition(query["owner_id"] == nil)
    return (
      400,
      Data(
        #"{"error":{"code":"invalid_cursor","field":"cursor","message":"The cursor has expired. Start the search again."}}"#
          .utf8)
    )
  }
  do {
    _ = try await api.search(
      query: CollectionSearchQuery(json: "{\"finishes\":[\"foil\"]}"), cursor: "page-two",
      accessToken: "synthetic")
    preconditionFailure("Expired cursors must not become empty pages")
  } catch CollectionFailure.query(let code, let field, _) {
    precondition(code == "invalid_cursor" && field == "cursor")
  }

  for (status, state) in [(401, CollectionState.refused), (403, .refused), (503, .failed)] {
    AuthHTTPStub.reply = { _ in (status, Data("upstream-private-body".utf8)) }
    let direct = CollectionController(api: SessionCollectionService(session: session, api: api))
    direct.setAccount("account-1")
    await session.signIn(.apple)
    await direct.reload()
    precondition(direct.presentation.state == state)
    await session.signOut()
  }
}
