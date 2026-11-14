import Foundation

@MainActor
final class SetsAPI {
  private let origin: URL
  private let http: URLSession

  init(origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.origin = origin
    self.http = http
  }

  func sets(text: String, finishView: FinishView, cursor: String?, accessToken: String) async throws
    -> SetList
  {
    var query = [URLQueryItem(name: "finish_view", value: finishView.rawValue)]
    if !text.isEmpty { query.append(URLQueryItem(name: "text", value: text)) }
    if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
    return try await read(path: "api/v1/sets", query: query, accessToken: accessToken)
  }

  func set(code: String, accessToken: String) async throws -> SetDetails {
    guard !code.isEmpty, code.count <= 16,
      code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) })
    else { throw SetsFailure.notFound }
    return try await read(path: "api/v1/sets/\(code)", query: [], accessToken: accessToken)
  }

  private struct Failure: Decodable {
    struct Field: Decodable { let code: String }
    let error: Field
  }

  private func read<Value: Decodable>(path: String, query: [URLQueryItem], accessToken: String)
    async throws -> Value
  {
    guard var url = URLComponents(url: origin.appending(path: path), resolvingAgainstBaseURL: false)
    else { throw SetsFailure.unavailable }
    if !query.isEmpty { url.queryItems = query }
    guard let address = url.url else { throw SetsFailure.unavailable }
    var request = URLRequest(url: address)
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw SetsFailure.unavailable }
    switch response.statusCode {
    case 200: return try JSONDecoder().decode(Value.self, from: data)
    case 401: throw SetsFailure.unauthenticated
    case 403: throw SetsFailure.forbidden
    case 404: throw SetsFailure.notFound
    case 400:
      if (try? JSONDecoder().decode(Failure.self, from: data).error.code) == "invalid_cursor" {
        throw SetsFailure.invalidCursor
      }
      throw SetsFailure.unavailable
    default: throw SetsFailure.unavailable
    }
  }
}

@MainActor
final class SessionSetsService: SetsService {
  private let session: SessionController
  private let api: SetsAPI

  init(session: SessionController, api: SetsAPI) {
    self.session = session
    self.api = api
  }

  func sets(accountID: String, text: String, finishView: FinishView, cursor: String?) async throws
    -> SetList
  {
    try await session.withAccessToken(for: accountID) { token in
      try await api.sets(text: text, finishView: finishView, cursor: cursor, accessToken: token)
    }
  }

  func set(accountID: String, code: String) async throws -> SetDetails {
    try await session.withAccessToken(for: accountID) { token in
      try await api.set(code: code, accessToken: token)
    }
  }
}
