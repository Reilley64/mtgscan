import Foundation

@MainActor
final class CollectionAPI {
  private let origin: URL
  private let http: URLSession

  init(origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.origin = origin
    self.http = http
  }

  private struct BrowseResult: Decodable {
    let copies: [CollectionCopy]
  }

  private struct SearchRefusal: Decodable {
    struct FieldError: Decodable {
      let code: String
      let field: String?
      let message: String?
    }
    let error: FieldError
  }

  func search(query: CollectionSearchQuery, cursor: String?, accessToken: String) async throws
    -> CollectionSearchPage
  {
    try await read(
      path: "api/v1/collection/copies", query: query.json(cursor: cursor), accessToken: accessToken,
      as: CollectionSearchPage.self)
  }

  func searchOptions(accessToken: String) async throws -> CollectionSearchOptions {
    try await read(
      path: "api/v1/collection/search-options", accessToken: accessToken,
      as: CollectionSearchOptions.self)
  }

  func browse(accessToken: String) async throws -> [CollectionCopy] {
    try await read(
      path: "api/v1/collection/copies", accessToken: accessToken, as: BrowseResult.self
    ).copies
  }

  func copy(copyID: String, accessToken: String) async throws -> CollectionCopy {
    guard let id = UUID(uuidString: copyID) else { throw CollectionFailure.notFound }
    return try await read(
      path: "api/v1/collection/copies/\(id.uuidString.lowercased())", accessToken: accessToken,
      as: CollectionCopy.self)
  }

  private func read<T: Decodable>(
    path: String, query: String? = nil, accessToken: String, as type: T.Type
  ) async throws -> T {
    var url = origin.appending(path: path)
    if let query {
      var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
      components.queryItems = [URLQueryItem(name: "query", value: query)]
      components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(
        of: "+", with: "%2B")
      url = components.url!
    }
    var request = URLRequest(url: url)
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw CollectionFailure.unavailable }
    switch response.statusCode {
    case 200: return try JSONDecoder().decode(type, from: data)
    case 401: throw CollectionFailure.unauthenticated
    case 403: throw CollectionFailure.forbidden
    case 404: throw CollectionFailure.notFound
    case 400, 503:
      if query != nil, let reply = try? JSONDecoder().decode(SearchRefusal.self, from: data) {
        let error = reply.error
        switch (response.statusCode, error.code) {
        case (400, "invalid_argument"), (400, "invalid_cursor"), (503, "data_unavailable"):
          throw CollectionFailure.query(
            code: error.code, field: error.field, message: error.message)
        default: break
        }
      }
      throw CollectionFailure.unavailable
    default: throw CollectionFailure.unavailable
    }
  }
}

@MainActor
final class SessionCollectionService: CollectionService {
  private let session: SessionController
  private let api: CollectionAPI

  init(session: SessionController, api: CollectionAPI) {
    self.session = session
    self.api = api
  }

  func search(accountID: String, query: CollectionSearchQuery, cursor: String?) async throws
    -> CollectionSearchPage
  {
    try await session.withAccessToken(for: accountID) { token in
      try await api.search(query: query, cursor: cursor, accessToken: token)
    }
  }

  func searchOptions(accountID: String) async throws -> CollectionSearchOptions {
    try await session.withAccessToken(for: accountID) { token in
      try await api.searchOptions(accessToken: token)
    }
  }

  func browse(accountID: String) async throws -> [CollectionCopy] {
    try await session.withAccessToken(for: accountID) { token in
      try await api.browse(accessToken: token)
    }
  }

  func copy(accountID: String, copyID: String) async throws -> CollectionCopy {
    try await session.withAccessToken(for: accountID) { token in
      try await api.copy(copyID: copyID, accessToken: token)
    }
  }
}
