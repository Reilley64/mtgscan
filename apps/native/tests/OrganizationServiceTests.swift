import Foundation

@MainActor
func runOrganizationServiceTests() async throws {
  let settings = URLSessionConfiguration.ephemeral
  settings.protocolClasses = [AuthHTTPStub.self]
  let http = URLSession(configuration: settings)
  defer { http.invalidateAndCancel() }
  let session = SessionController(
    provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(),
    api: AccountService(), now: { 1000 })
  await session.signIn(.apple)
  let service = SessionOrganizationService(
    session: session, origin: URL(string: "https://api.test")!, http: http)
  AuthHTTPStub.reply = { request in
    precondition(request.httpMethod == "POST")
    precondition(request.url?.path == "/api/v1/collection/actions" && request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    return (200, Data(#"{"items":[{"user_tag_id":"tag","name":"Signed","copy_count":2}]}"#.utf8))
  }
  let tags = try await service.list(accountID: "account-1", deleted: false)
  precondition(tags == [UserTagSummary(userTagID: "tag", name: "Signed", copyCount: 2)])
  AuthHTTPStub.reply = { _ in
    (400, Data(#"{"error":{"code":"user_tag_exists","field":"name"}}"#.utf8))
  }
  do {
    try await service.rename(accountID: "account-1", tagID: "tag", name: "Signed")
    preconditionFailure("A duplicate name must retain its field error")
  } catch let failure as OrganizationFailure {
    precondition(failure.code == "user_tag_exists" && failure.field == "name")
  }
  AuthHTTPStub.reply = { _ in (401, Data("private upstream body".utf8)) }
  do {
    try await service.protect(accountID: "account-1", copyID: "copy", protected: true)
    preconditionFailure("An expired credential must refuse protection")
  } catch CollectionFailure.unauthenticated {}
  await session.signOut()
  do {
    _ = try await service.list(accountID: "account-1", deleted: false)
    preconditionFailure("A signed-out account must not send organization requests")
  } catch SessionFailure.unauthenticated {}
}
