import Foundation

struct UserTagSummary: Decodable, Equatable {
  let userTagID: String
  let name: String
  let copyCount: Int

  enum CodingKeys: String, CodingKey {
    case userTagID = "user_tag_id"
    case name
    case copyCount = "copy_count"
  }
}

struct OrganizationFailure: Error, Decodable {
  let code: String
  let field: String?
}

@MainActor
protocol OrganizationService {
  func list(accountID: String, deleted: Bool) async throws -> [UserTagSummary]
  func create(accountID: String, name: String) async throws -> CollectionUserTag
  func rename(accountID: String, tagID: String, name: String) async throws
  func delete(accountID: String, tagID: String) async throws
  func restore(accountID: String, tagID: String) async throws
  func setTag(accountID: String, copyID: String, tagID: String, tagged: Bool) async throws
  func protect(accountID: String, copyID: String, protected: Bool) async throws
}

@MainActor
final class SessionOrganizationService: OrganizationService {
  private let session: SessionController
  private let origin: URL
  private let http: URLSession

  init(session: SessionController, origin: URL, http: URLSession = NoRedirectSession.make()) {
    self.session = session
    self.origin = origin
    self.http = http
  }

  private struct Request: Encodable {
    let action: String
    var copyID: String?
    var userTagID: String?
    var name: String?
    var protected: Bool?
    var tagged: Bool?
    var deleted: Bool?

    enum CodingKeys: String, CodingKey {
      case action, name, protected, tagged, deleted
      case copyID = "copy_id"
      case userTagID = "user_tag_id"
    }
  }

  private struct Tags: Decodable { let items: [UserTagSummary] }
  private struct Refused: Decodable { let error: OrganizationFailure }

  func list(accountID: String, deleted: Bool) async throws -> [UserTagSummary] {
    let data = try await send(accountID, Request(action: "list_user_tags", deleted: deleted))
    return try JSONDecoder().decode(Tags.self, from: data).items
  }

  func create(accountID: String, name: String) async throws -> CollectionUserTag {
    let data = try await send(accountID, Request(action: "create_user_tag", name: name))
    return try JSONDecoder().decode(CollectionUserTag.self, from: data)
  }

  func rename(accountID: String, tagID: String, name: String) async throws {
    _ = try await send(
      accountID, Request(action: "rename_user_tag", userTagID: tagID, name: name))
  }

  func delete(accountID: String, tagID: String) async throws {
    _ = try await send(accountID, Request(action: "delete_user_tag", userTagID: tagID))
  }

  func restore(accountID: String, tagID: String) async throws {
    _ = try await send(accountID, Request(action: "restore_user_tag", userTagID: tagID))
  }

  func setTag(accountID: String, copyID: String, tagID: String, tagged: Bool) async throws {
    _ = try await send(
      accountID,
      Request(action: "set_copy_user_tag", copyID: copyID, userTagID: tagID, tagged: tagged))
  }

  func protect(accountID: String, copyID: String, protected: Bool) async throws {
    _ = try await send(
      accountID, Request(action: "set_copy_protected", copyID: copyID, protected: protected))
  }

  private func send(_ accountID: String, _ body: Request) async throws -> Data {
    try await session.withAccessToken(for: accountID) { token in
      var request = URLRequest(url: self.origin.appending(path: "api/v1/collection/actions"))
      request.httpMethod = "POST"
      request.httpBody = try JSONEncoder().encode(body)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.cachePolicy = .reloadIgnoringLocalCacheData
      let (data, response) = try await self.http.data(for: request)
      guard let response = response as? HTTPURLResponse else { throw CollectionFailure.unavailable }
      switch response.statusCode {
      case 200: return data
      case 401: throw CollectionFailure.unauthenticated
      case 403: throw CollectionFailure.forbidden
      case 400:
        throw try JSONDecoder().decode(Refused.self, from: data).error
      default: throw CollectionFailure.unavailable
      }
    }
  }
}
