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
    precondition(request.url?.path == "/api/v1/collection/copies")
    precondition(request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    return (200, Data(#"{"copies":["#.utf8) + data + Data("]}".utf8))
  }
  await session.signIn(.apple)
  while collection.presentation.state == .loading { await Task.yield() }
  precondition(collection.presentation.copies.first?.printing.name == "Sol Ring")
  AuthHTTPStub.reply = { request in
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
