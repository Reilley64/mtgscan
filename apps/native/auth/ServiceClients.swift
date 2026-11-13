import Foundation

struct PublicConfiguration: Decodable {
  let supabaseURL: URL
  let publishableKey: String
  let apiURL: URL
  let googleIOSClientID: String
  let googleServerClientID: String

  static func load() throws -> Self {
    guard let url = Bundle.main.url(forResource: "PublicConfiguration", withExtension: "json")
    else {
      throw SessionFailure.configuration
    }
    let config = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    for origin in [config.supabaseURL, config.apiURL] {
      guard origin.scheme == "https", origin.host != nil, origin.user == nil,
        origin.password == nil, origin.query == nil, origin.fragment == nil,
        origin.path.isEmpty || origin.path == "/"
      else { throw SessionFailure.configuration }
    }
    guard config.publishableKey.hasPrefix("sb_publishable_") else {
      throw SessionFailure.configuration
    }
    return config
  }
}

final class NoRedirectSession: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  static func make() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 15
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    return URLSession(
      configuration: configuration, delegate: NoRedirectSession(), delegateQueue: nil)
  }
}

@MainActor
final class SupabaseSessionService: SessionService {
  private let config: PublicConfiguration
  private let http: URLSession

  init(config: PublicConfiguration, http: URLSession = NoRedirectSession.make()) {
    self.config = config
    self.http = http
  }

  func exchange(_ credential: ProviderCredential) async throws -> StoredSession {
    var body = ["provider": credential.provider.rawValue, "id_token": credential.idToken]
    if let nonce = credential.nonce { body["nonce"] = nonce }
    return try await token(grant: "id_token", body: body)
  }

  func refresh(_ token: String) async throws -> StoredSession {
    try await self.token(grant: "refresh_token", body: ["refresh_token": token])
  }

  func revoke(_ token: String) async throws {
    let url = config.supabaseURL.appending(path: "auth/v1/logout")
      .appending(queryItems: [URLQueryItem(name: "scope", value: "local")])
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let (_, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse,
      (200..<300).contains(response.statusCode) || response.statusCode == 401
    else { throw SessionFailure.unavailable }
  }

  private struct TokenReply: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: TimeInterval?
    let expiresIn: TimeInterval
    let tokenType: String
  }

  private func token(grant: String, body: [String: String]) async throws -> StoredSession {
    let url = config.supabaseURL.appending(path: "auth/v1/token")
      .appending(queryItems: [URLQueryItem(name: "grant_type", value: grant)])
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw SessionFailure.unavailable }
    guard response.statusCode == 200 else {
      if [400, 401, 403, 422].contains(response.statusCode) {
        throw SessionFailure.unauthenticated
      }
      throw SessionFailure.unavailable
    }
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    let value = try decoder.decode(TokenReply.self, from: data)
    guard !value.accessToken.isEmpty, !value.refreshToken.isEmpty,
      value.tokenType.lowercased() == "bearer", value.expiresIn > 0
    else { throw SessionFailure.unauthenticated }
    let now = Date().timeIntervalSince1970
    let expiresAt = value.expiresAt ?? now + value.expiresIn
    guard expiresAt > now else { throw SessionFailure.unauthenticated }
    return StoredSession(
      accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: expiresAt)
  }
}

@MainActor
final class AccountAPI: CurrentAccountService {
  private let origin: URL
  private let http: URLSession

  init(origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.origin = origin
    self.http = http
  }

  private struct Reply: Decodable {
    let accountID: UUID

    enum CodingKeys: String, CodingKey {
      case accountID = "account_id"
    }
  }

  func currentAccount(accessToken: String) async throws -> String {
    var request = URLRequest(url: origin.appending(path: "api/v1/account"))
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response) = try await http.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw SessionFailure.unavailable }
    if [401, 403].contains(response.statusCode) { throw SessionFailure.unauthenticated }
    guard response.statusCode == 200 else { throw SessionFailure.unavailable }
    return try JSONDecoder().decode(Reply.self, from: data).accountID.uuidString.lowercased()
  }
}
