import Foundation

private func catalogRequestBody(_ request: URLRequest) throws -> Data {
  if let data = request.httpBody { return data }
  guard let stream = request.httpBodyStream else { throw CatalogFailure.unavailable }
  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 1024)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    if count < 0 { throw CatalogFailure.unavailable }
    if count == 0 { break }
    data.append(buffer, count: count)
  }
  return data
}

@MainActor
func runCatalogServiceTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let data = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/catalog-search.json"))
  let api = CatalogAPI(origin: URL(string: "https://api.test")!, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/catalog/search")
    precondition(request.httpMethod == "POST" && request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer credential")
    precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    let query =
      try JSONSerialization.jsonObject(with: catalogRequestBody(request)) as? [String: Any]
    precondition(query?["text"] as? String == "ring")
    precondition(query?["tags_exclude"] as? [String] == ["draw"])
    precondition(query?["owner_id"] == nil && query?["user_id"] == nil)
    return (200, data)
  }
  let page = try await api.search(
    query: CatalogQuery(fields: ["text": .text("ring"), "tags_exclude": .list(["draw"])]),
    accessToken: "credential")
  precondition(page.items[0].owned.freeQuantity == 2)
  precondition(page.nextCursor == "opaque-search-cursor")
  for (path, fixture) in [("cards", "cards"), ("printings", "printings"), ("oracle-tags", "tags")] {
    let reply = try Data(
      contentsOf: URL(fileURLWithPath: "crates/api/fixtures/catalog-\(fixture).json"))
    AuthHTTPStub.reply = { request in
      precondition(request.url?.path == "/api/v1/catalog/\(path)")
      return (200, reply)
    }
    switch path {
    case "cards":
      let cards = try await api.cards(
        oracleID: nil, printingID: "20000000-0000-4000-8000-000000000001", accessToken: "credential"
      )
      precondition(cards.items[0].printing?.artist == "Mark Tedin")
    case "printings":
      let printings = try await api.printings(
        oracleID: "10000000-0000-4000-8000-000000000001", ownedOnly: true, cursor: nil,
        accessToken: "credential")
      precondition(printings.items.map(\.set) == ["c21", "lea"])
    default:
      let tags = try await api.tags(text: "mana", accessToken: "credential")
      precondition(tags.items[0].aliases == ["Mana stone"])
    }
  }
  AuthHTTPStub.reply = { _ in
    (400, Data(#"{"error":{"code":"invalid_argument","field":"tags[0]"}}"#.utf8))
  }
  do {
    _ = try await api.tags(text: "mana", accessToken: "credential")
    preconditionFailure("A refused query must retain its field")
  } catch CatalogFailure.invalid(let code, let field) {
    precondition(code == "invalid_argument" && field == "tags[0]")
  }
  AuthHTTPStub.reply = { _ in (401, Data("private-upstream-diagnostic".utf8)) }
  do {
    _ = try await api.tags(text: "mana", accessToken: "credential")
    preconditionFailure("A refused session must not expose upstream diagnostics")
  } catch CatalogFailure.refused {}
}
