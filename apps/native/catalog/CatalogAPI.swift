import Foundation

@MainActor
final class CatalogAPI {
  private let origin: URL
  private let http: URLSession

  init(origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.origin = origin
    self.http = http
  }

  func search(query: CatalogQuery, accessToken: String) async throws -> CatalogSearchPage {
    try await read(path: "search", query: query, accessToken: accessToken)
  }

  func cards(oracleID: String?, printingID: String?, accessToken: String) async throws
    -> CatalogCardsPage
  {
    var fields: [String: CatalogValue] = [:]
    if let oracleID { fields["oracle_ids"] = .list([oracleID]) }
    if let printingID { fields["printing_ids"] = .list([printingID]) }
    return try await read(
      path: "cards", query: CatalogQuery(fields: fields), accessToken: accessToken)
  }

  func printings(oracleID: String, ownedOnly: Bool, cursor: String?, accessToken: String)
    async throws -> CatalogPrintingsPage
  {
    var fields: [String: CatalogValue] = [
      "oracle_id": .text(oracleID), "owned_only": .boolean(ownedOnly),
    ]
    if let cursor { fields["cursor"] = .text(cursor) }
    return try await read(
      path: "printings", query: CatalogQuery(fields: fields), accessToken: accessToken)
  }

  func tags(text: String, accessToken: String) async throws -> CatalogTagsPage {
    try await read(
      path: "oracle-tags", query: CatalogQuery(fields: ["text": .text(text)]),
      accessToken: accessToken)
  }

  private struct ErrorReply: Decodable {
    let error: FieldError
    struct FieldError: Decodable {
      let code: String
      let field: String?
    }
  }

  private func read<T: Decodable>(path: String, query: CatalogQuery, accessToken: String)
    async throws -> T
  {
    var request = URLRequest(url: origin.appending(path: "api/v1/catalog/\(path)"))
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(query)
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw CatalogFailure.unavailable }
    switch response.statusCode {
    case 200: return try CatalogDecoding.decoder().decode(T.self, from: data)
    case 401, 403: throw CatalogFailure.refused
    case 404: throw CatalogFailure.notFound
    default:
      if let reply = try? JSONDecoder().decode(ErrorReply.self, from: data),
        ["invalid_argument", "invalid_cursor"].contains(reply.error.code)
      {
        throw CatalogFailure.invalid(code: reply.error.code, field: reply.error.field)
      }
      throw CatalogFailure.unavailable
    }
  }
}

@MainActor
final class SessionCatalogService: CatalogService {
  private let session: SessionController
  private let api: CatalogAPI

  init(session: SessionController, api: CatalogAPI) {
    self.session = session
    self.api = api
  }

  func search(accountID: String, query: CatalogQuery) async throws -> CatalogSearchPage {
    try await session.withAccessToken(for: accountID) { token in
      try await api.search(query: query, accessToken: token)
    }
  }

  func cards(accountID: String, oracleID: String?, printingID: String?) async throws
    -> CatalogCardsPage
  {
    try await session.withAccessToken(for: accountID) { token in
      try await api.cards(oracleID: oracleID, printingID: printingID, accessToken: token)
    }
  }

  func printings(accountID: String, oracleID: String, ownedOnly: Bool, cursor: String?) async throws
    -> CatalogPrintingsPage
  {
    try await session.withAccessToken(for: accountID) { token in
      try await api.printings(
        oracleID: oracleID, ownedOnly: ownedOnly, cursor: cursor, accessToken: token)
    }
  }

  func tags(accountID: String, text: String) async throws -> CatalogTagsPage {
    try await session.withAccessToken(for: accountID) { token in
      try await api.tags(text: text, accessToken: token)
    }
  }
}
