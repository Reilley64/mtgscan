import Foundation

@MainActor
func runDeckServiceTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let api = DeckAPI(origin: URL(string: "https://api.test")!, http: http)
  let session = SessionController(
    provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(), api: AccountService(),
    now: { 1000 })
  let service = SessionDeckService(session: session, api: api)
  let controller = DeckController(api: service)
  await session.signIn(.apple)
  controller.setAccount("account-1")
  let gallery = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/decks.json"))
  let deck = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/decks")
    precondition(request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    return (200, gallery)
  }
  await controller.reload()
  precondition(controller.presentation.decks.first?.needsYouCount == 2)
  AuthHTTPStub.reply = { request in
    precondition(
      request.url?.path == "/api/v1/decks/40000000-0000-4000-8000-000000000001"
        || request.url?.path == "/api/v1/decks/40000000-0000-4000-8000-000000000001/metadata")
    precondition(request.url?.query == nil)
    if request.httpMethod == "POST" {
      let body = try JSONDecoder().decode([String: String].self, from: deckRequestBody(request))
      precondition(body == ["action": "used"])
      return (200, Data("null".utf8))
    }
    return (200, deck)
  }
  await controller.open("40000000-0000-4000-8000-000000000001")
  precondition(
    controller.presentation.deck?.cards.first?.copyID == "10000000-0000-4000-8000-000000000001")
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/decks")
    precondition(request.httpMethod == "POST")
    let body = try JSONDecoder().decode([String: String].self, from: deckRequestBody(request))
    precondition(body == ["name": "Duplicate"])
    return (201, Data(#"{"deck_id":"40000000-0000-4000-8000-000000000002"}"#.utf8))
  }
  let created = try await service.create(accountID: "account-1", name: "Duplicate")
  precondition(created == "40000000-0000-4000-8000-000000000002")
  for status in [401, 403] {
    AuthHTTPStub.reply = { _ in (status, Data("private-upstream-body".utf8)) }
    await controller.reload()
    precondition(controller.presentation.state == .refused)
    precondition(controller.presentation.decks.isEmpty && controller.presentation.deck == nil)
  }
  await session.signOut()
  do {
    _ = try await service.browse(accountID: "account-1")
    preconditionFailure("A signed-out session cannot read decks")
  } catch SessionFailure.unauthenticated {}
}

private func deckRequestBody(_ request: URLRequest) throws -> Data {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { return Data() }
  stream.open()
  defer { stream.close() }
  var body = Data()
  var buffer = [UInt8](repeating: 0, count: 1024)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    if count < 0 { throw DeckFailure.unavailable }
    if count == 0 { break }
    body.append(contentsOf: buffer.prefix(count))
  }
  return body
}
