import Foundation

@MainActor
final class DeckAPI {
  private let origin: URL
  private let http: URLSession

  init(origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.origin = origin
    self.http = http
  }

  private struct Gallery: Decodable { let items: [DeckSummary] }
  private struct Created: Decodable {
    let deckID: String
    enum CodingKeys: String, CodingKey { case deckID = "deck_id" }
  }

  func browse(accessToken: String) async throws -> [DeckSummary] {
    let data = try await request(path: "api/v1/decks", accessToken: accessToken)
    return try JSONDecoder().decode(Gallery.self, from: data).items
  }

  func contents(deckID: String, accessToken: String) async throws -> DeckContents {
    let data = try await request(path: path(deckID), accessToken: accessToken)
    return try JSONDecoder().decode(DeckContents.self, from: data)
  }

  func create(name: String, accessToken: String) async throws -> String {
    let data = try await request(
      path: "api/v1/decks", accessToken: accessToken, body: ["name": name])
    let created = try JSONDecoder().decode(Created.self, from: data)
    guard let id = UUID(uuidString: created.deckID) else { throw DeckFailure.unavailable }
    return id.uuidString.lowercased()
  }

  func metadata(deckID: String, change: DeckMetadataChange, accessToken: String) async throws {
    let body: [String: String]
    switch change {
    case .rename(let name): body = ["action": "rename", "name": name]
    case .priority(let priority): body = ["action": "priority", "priority": priority.rawValue]
    case .used: body = ["action": "used"]
    }
    _ = try await request(path: path(deckID) + "/metadata", accessToken: accessToken, body: body)
  }

  private func path(_ id: String) throws -> String {
    guard let id = UUID(uuidString: id) else { throw DeckFailure.notFound }
    return "api/v1/decks/\(id.uuidString.lowercased())"
  }

  private func request(path: String, accessToken: String, body: [String: String]? = nil)
    async throws -> Data
  {
    var request = URLRequest(url: origin.appending(path: path))
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONEncoder().encode(body)
    }
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw DeckFailure.unavailable }
    switch response.statusCode {
    case 200, 201: return data
    case 400: throw DeckFailure.invalidArgument
    case 401: throw DeckFailure.unauthenticated
    case 403: throw DeckFailure.forbidden
    case 404: throw DeckFailure.notFound
    default: throw DeckFailure.unavailable
    }
  }
}

@MainActor
final class SessionDeckService: DeckService {
  private let session: SessionController
  private let api: DeckAPI

  init(session: SessionController, api: DeckAPI) {
    self.session = session
    self.api = api
  }

  func browse(accountID: String) async throws -> [DeckSummary] {
    try await session.withAccessToken(for: accountID) { try await self.api.browse(accessToken: $0) }
  }

  func contents(accountID: String, deckID: String) async throws -> DeckContents {
    try await session.withAccessToken(for: accountID) {
      try await self.api.contents(deckID: deckID, accessToken: $0)
    }
  }

  func create(accountID: String, name: String) async throws -> String {
    try await session.withAccessToken(for: accountID) {
      try await self.api.create(name: name, accessToken: $0)
    }
  }

  func metadata(accountID: String, deckID: String, change: DeckMetadataChange) async throws {
    try await session.withAccessToken(for: accountID) {
      try await self.api.metadata(deckID: deckID, change: change, accessToken: $0)
    }
  }
}
