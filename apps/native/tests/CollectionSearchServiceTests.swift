import Foundation

@MainActor
enum CollectionSearchServiceTests {
  static func run() async throws {
    let settings = URLSessionConfiguration.ephemeral
    settings.protocolClasses = [AuthHTTPStub.self]
    let http = URLSession(configuration: settings)
    defer { http.invalidateAndCancel() }
    let api = CollectionAPI(origin: URL(string: "https://api.test")!, http: http)
    let session = SessionController(
      provider: NativeProvider(), store: MemoryKeychain(), auth: AuthService(),
      api: AccountService(), now: { 1000 })
    let service = SessionCollectionService(session: session, api: api)
    let query = CollectionSearchQuery(json: #"{"text":"A+B & 100% café","tags_exclude":["storm"]}"#)

    try await searchNeedsTheCurrentAccount(service, query: query, accountID: "account-1")
    await session.signIn(.apple)
    try await searchNeedsTheCurrentAccount(service, query: query, accountID: "another-account")
    try await pagesPreserveCopiesBasicLandsAndCursors(service, query: query)
    try await refusalsPreserveTheirFieldAndMessage(service, query: query)
    try await browseRepliesAreNotSearchPages(service, query: query)
    await session.signOut()
    print("Collection search transport unit checks passed.")
  }

  private static func searchNeedsTheCurrentAccount(
    _ service: SessionCollectionService, query: CollectionSearchQuery, accountID: String
  ) async throws {
    AuthHTTPStub.reply = { _ in preconditionFailure("A mismatched session cannot make a request") }
    do {
      _ = try await service.search(accountID: accountID, query: query, cursor: nil)
      preconditionFailure("Collection search requires the current account")
    } catch SessionFailure.unauthenticated {}
  }

  private static func pagesPreserveCopiesBasicLandsAndCursors(
    _ service: SessionCollectionService, query: CollectionSearchQuery
  ) async throws {
    let copy = try String(
      contentsOfFile: "crates/api/fixtures/collection-copy.json", encoding: .utf8)
    let copyID = "10000000-0000-4000-8000-000000000001"
    let nextCopyID = "10000000-0000-4000-8000-000000000002"
    let searchID = "10000000-0000-4000-8000-000000000003"
    let landID = "20000000-0000-4000-8000-000000000002"
    let firstPage = Data(
      """
      {"copies": [\(copy)], "search_id": "\(searchID)", "total_count": 2, "next_cursor": "next-page",
      "basic_lands": [{"oracle_id": "\(landID)", "name": "Island", "image_uris": []}],
      "search_options": {
        "decks": [{"deck_id": "40000000-0000-4000-8000-000000000001", "name": "Atraxa",
                   "commander_art_crop_uri": "https://example.test/commander.jpg", "role": null}],
        "user_tags": ["Trade binder"],
        "user_tag_details": [{"user_tag_id": "30000000-0000-4000-8000-000000000002",
                              "name": "Trade binder", "copy_count": 0}]
      }, "rules_data_as_of": "2026-11-20", "rules_stale": false,
      "prices_observed_at": null, "prices_stale": true}
      """.utf8)
    AuthHTTPStub.reply = { request in
      try assertSearchRequest(request, cursor: nil)
      return (200, firstPage)
    }
    let first = try await service.search(accountID: "account-1", query: query, cursor: nil)
    precondition(first.copies.map(\.copyID) == [copyID])
    precondition(first.basicLands?.map(\.oracleID) == [landID])
    precondition(first.searchID == searchID && first.totalCount == 2)
    precondition(first.nextCursor == "next-page")
    precondition(first.searchOptions?.decks.first?.name == "Atraxa")
    precondition(
      first.searchOptions?.decks.first?.commanderArtCropURI == "https://example.test/commander.jpg")
    precondition(first.searchOptions?.userTags == ["Trade binder"])
    precondition(first.searchOptions?.userTagDetails.first?.copyCount == 0)

    let nextCopy = copy.replacingOccurrences(of: copyID, with: nextCopyID)
    let lastPage = Data(
      """
      {"copies": [\(nextCopy)], "search_id": "\(searchID)", "total_count": null,
       "next_cursor": null, "basic_lands": null, "search_options": null,
       "rules_data_as_of": "2026-11-20", "rules_stale": false,
       "prices_observed_at": null, "prices_stale": true}
      """.utf8)
    AuthHTTPStub.reply = { request in
      try assertSearchRequest(request, cursor: "next-page")
      return (200, lastPage)
    }
    let next = try await service.search(
      accountID: "account-1", query: query, cursor: first.nextCursor)
    precondition(next.searchID == searchID && next.nextCursor == nil)
    precondition(next.copies.map(\.copyID) == [nextCopyID])
    precondition(next.totalCount == nil && next.basicLands == nil && next.searchOptions == nil)
  }

  private nonisolated static func assertSearchRequest(_ request: URLRequest, cursor: String?) throws
  {
    precondition(request.httpMethod == "GET" && request.httpBody == nil)
    precondition(request.url?.path == "/api/v1/collection/copies")
    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer access")
    let url = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
    precondition(url.percentEncodedQuery?.contains("+") == false, "A form parser reads + as space")
    precondition(url.queryItems?.map(\.name) == ["query"])
    let json = url.queryItems!.first!.value!
    let fields = try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    let expectedKeys = ["text", "tags_exclude"] + (cursor == nil ? [] : ["cursor"])
    precondition(Set(fields.keys) == Set(expectedKeys))
    precondition(fields["text"] as? String == "A+B & 100% café")
    precondition(fields["tags_exclude"] as? [String] == ["storm"])
    precondition(fields["cursor"] as? String == cursor)
  }

  private static func refusalsPreserveTheirFieldAndMessage(
    _ service: SessionCollectionService, query: CollectionSearchQuery
  ) async throws {
    let refusals: [(Int, String, String?, String?)] = [
      (400, "invalid_argument", "tags_exclude[0]", "No Oracle tag named \"storm\"."),
      (400, "invalid_cursor", "cursor", "The cursor is not valid. Start the search again."),
      (503, "data_unavailable", nil, nil),
    ]
    for (status, code, field, message) in refusals {
      var error: [String: Any] = ["code": code, "field": field as Any? ?? NSNull()]
      error["message"] = message
      let body = try JSONSerialization.data(withJSONObject: ["error": error])
      AuthHTTPStub.reply = { _ in (status, body) }
      do {
        _ = try await service.search(accountID: "account-1", query: query, cursor: nil)
        preconditionFailure("A refused query is not an empty page")
      } catch CollectionFailure.query(let actualCode, let actualField, let actualMessage) {
        precondition(actualCode == code && actualField == field && actualMessage == message)
      }
    }
  }

  private static func browseRepliesAreNotSearchPages(
    _ service: SessionCollectionService, query: CollectionSearchQuery
  ) async throws {
    AuthHTTPStub.reply = { _ in (200, Data(#"{"copies":[]}"#.utf8)) }
    do {
      _ = try await service.search(accountID: "account-1", query: query, cursor: nil)
      preconditionFailure("A browse reply cannot become a successful search page")
    } catch DecodingError.keyNotFound {}

    AuthHTTPStub.reply = { _ in
      (400, Data(#"{"error":{"code":"invalid_request","field":"query"}}"#.utf8))
    }
    do {
      _ = try await service.search(accountID: "account-1", query: query, cursor: nil)
      preconditionFailure("A backend without the search contract cannot return a page")
    } catch CollectionFailure.unavailable {}
  }
}
