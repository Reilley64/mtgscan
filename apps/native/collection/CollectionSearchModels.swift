import Foundation

struct CollectionSearchQuery: Equatable {
  var json = "{}"

  func json(cursor: String?) throws -> String {
    guard var fields = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    else { throw CollectionFailure.unavailable }
    if let cursor { fields["cursor"] = cursor }
    return String(
      decoding: try JSONSerialization.data(withJSONObject: fields, options: .sortedKeys),
      as: UTF8.self)
  }
}

struct CollectionBasicLand: Decodable, Equatable {
  let oracleID: String
  let name: String
  let imageURIs: [String]

  enum CodingKeys: String, CodingKey {
    case oracleID = "oracle_id"
    case name
    case imageURIs = "image_uris"
  }
}

struct CollectionSearchDeck: Codable, Equatable {
  let deckID: String
  let name: String

  enum CodingKeys: String, CodingKey {
    case deckID = "deck_id"
    case name
  }
}

struct CollectionSearchOptions: Decodable, Equatable {
  var decks: [CollectionSearchDeck] = []
  var userTags: [String] = []

  enum CodingKeys: String, CodingKey {
    case decks
    case userTags = "user_tags"
  }
}

struct CollectionSearchPage: Decodable {
  let copies: [CollectionCopy]
  let basicLands: [CollectionBasicLand]?
  let totalCount: Int?
  let nextCursor: String?
  let searchOptions: CollectionSearchOptions?

  init(
    copies: [CollectionCopy], basicLands: [CollectionBasicLand]? = nil, totalCount: Int? = nil,
    nextCursor: String? = nil, searchOptions: CollectionSearchOptions? = nil
  ) {
    self.copies = copies
    self.basicLands = basicLands
    self.totalCount = totalCount
    self.nextCursor = nextCursor
    self.searchOptions = searchOptions
  }

  enum CodingKeys: String, CodingKey {
    case copies
    case basicLands = "basic_lands"
    case totalCount = "total_count"
    case nextCursor = "next_cursor"
    case searchOptions = "search_options"
  }
}

struct CollectionQueryError: Equatable {
  let code: String
  let field: String?
  let message: String
}
