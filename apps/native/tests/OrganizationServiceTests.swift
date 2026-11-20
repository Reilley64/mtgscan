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
  let origin = URL(string: "https://api.test")!
  let collection = CollectionController(
    api: SessionCollectionService(session: session, api: CollectionAPI(origin: origin, http: http)))
  collection.setAccount(session.presentation.accountID)
  let fixture = try Data(
    contentsOf: URL(fileURLWithPath: "crates/api/fixtures/collection-copy.json"))
  let copyID = try JSONDecoder().decode(CollectionCopy.self, from: fixture).copyID
  AuthHTTPStub.reply = { request in
    precondition(request.httpMethod == "GET")
    precondition(request.url?.path == "/api/v1/collection/copies/\(copyID)")
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    return (200, fixture)
  }
  await collection.open(copyID)
  guard let copy = collection.presentation.copy else {
    preconditionFailure("Expected the selected copy before opening User tags")
  }
  let service = SessionOrganizationService(session: session, origin: origin, http: http)
  let picker = OrganizationController(api: service)
  picker.setAccount(session.presentation.accountID)
  AuthHTTPStub.reply = { request in
    precondition(request.httpMethod == "POST")
    precondition(request.url?.path == "/api/v1/collection/actions" && request.url?.query == nil)
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    return (200, Data(#"{"items":[{"user_tag_id":"tag","name":"Signed","copy_count":2}]}"#.utf8))
  }
  await picker.open(copy)
  precondition(picker.presentation.copyID == copyID)
  precondition(picker.presentation.selectedUserTagIDs == Set(copy.userTags.map(\.userTagID)))
  precondition(
    picker.presentation.tags == [
      UserTagSummary(userTagID: "tag", name: "Signed", copyCount: 2)
    ])
  AuthHTTPStub.reply = { _ in
    (400, Data(#"{"error":{"code":"user_tag_exists","field":"name"}}"#.utf8))
  }
  do {
    try await service.rename(accountID: "account-1", userTagID: "tag", name: "Signed")
    preconditionFailure("A duplicate name must retain its field error")
  } catch let failure as OrganizationFailure {
    precondition(failure.code == "user_tag_exists" && failure.field == "name")
  }
  AuthHTTPStub.reply = { _ in (401, Data("private upstream body".utf8)) }
  do {
    try await service.protect(accountID: "account-1", copyID: copyID, protected: false)
    preconditionFailure("An expired credential must refuse protection")
  } catch CollectionFailure.unauthenticated {}
  AuthHTTPStub.reply = { _ in
    preconditionFailure("Only the current signed-in account can send Organizer requests")
  }
  do {
    try await service.protect(accountID: "account-2", copyID: copyID, protected: false)
    preconditionFailure("A different account must not send protection requests")
  } catch SessionFailure.unauthenticated {}
  await session.signOut()
  do {
    _ = try await service.list(accountID: "account-1", deleted: false)
    preconditionFailure("A signed-out account must not send Organizer requests")
  } catch SessionFailure.unauthenticated {}
  print("Organizer service unit checks passed with the current session and exact-copy reader.")
}
