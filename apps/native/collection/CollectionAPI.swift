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
    path: String, accessToken: String, as type: T.Type
  ) async throws -> T {
    var request = URLRequest(url: origin.appending(path: path))
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
