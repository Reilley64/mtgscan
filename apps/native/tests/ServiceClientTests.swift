import Foundation

final class AuthHTTPStub: URLProtocol {
  static var reply: (URLRequest) throws -> (Int, Data) = { _ in throw SessionFailure.unavailable }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      let (status, data) = try Self.reply(request)
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

@MainActor
func runServiceClientTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let config = PublicConfiguration(
    supabaseURL: URL(string: "https://project.supabase.co")!, publishableKey: "sb_publishable_unit",
    apiURL: URL(string: "https://api.test")!,
    googleIOSClientID: "ios.apps.googleusercontent.com",
    googleServerClientID: "web.apps.googleusercontent.com")
  let auth = SupabaseSessionService(config: config, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.query == "grant_type=id_token")
    precondition(request.httpMethod == "POST")
    return (
      200,
      Data(
        #"{"access_token":"access","refresh_token":"refresh","expires_in":1000,"expires_at":0,"token_type":"bearer"}"#
          .utf8)
    )
  }
  do {
    _ = try await auth.exchange(
      ProviderCredential(provider: .apple, idToken: "native", nonce: "nonce"))
    preconditionFailure("An already expired exchange must not establish a session")
  } catch SessionFailure.unauthenticated {}

  AuthHTTPStub.reply = { request in
    precondition(request.url?.query == "grant_type=refresh_token")
    return (
      200,
      Data(
        #"{"access_token":"renewed","refresh_token":"rotated","expires_in":1000,"token_type":"bearer"}"#
          .utf8)
    )
  }
  let session = try await auth.refresh("old-refresh")
  precondition(session.accessToken == "renewed" && session.refreshToken == "rotated")

  let api = AccountAPI(origin: config.apiURL, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.url?.path == "/api/v1/account")
    precondition(request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer renewed")
    return (200, Data(#"{"account_id":"00000000-0000-4000-8000-000000000001"}"#.utf8))
  }
  let account = try await api.currentAccount(accessToken: session.accessToken)
  precondition(account == "00000000-0000-4000-8000-000000000001")

  for status in [401, 403] {
    AuthHTTPStub.reply = { _ in (status, Data()) }
    do {
      _ = try await api.currentAccount(accessToken: "refused")
      preconditionFailure("Refused credentials must not establish an account")
    } catch SessionFailure.unauthenticated {}
  }
  AuthHTTPStub.reply = { _ in (503, Data("sensitive upstream error".utf8)) }
  do {
    _ = try await api.currentAccount(accessToken: "token")
    preconditionFailure("An unavailable account service must stay unavailable")
  } catch SessionFailure.unavailable {}
  print("Service-client unit checks passed with an in-memory HTTP capability.")
}
