import Foundation

struct CollectionSearchQuery: Equatable {
  var json = "{}"

  func json(cursor: String?) throws -> String {
    guard var fields = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    else { throw CollectionFailure.unavailable }
    fields["cursor"] = cursor
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

struct CollectionSearchDeck: Decodable, Equatable {
  let deckID: String
  let name: String
  let commanderArtCropURI: String?

  enum CodingKeys: String, CodingKey {
    case deckID = "deck_id"
    case name
    case commanderArtCropURI = "commander_art_crop_uri"
  }
}

struct CollectionSearchUserTag: Decodable, Equatable {
  let userTagID: String
  let name: String
  let copyCount: Int

  enum CodingKeys: String, CodingKey {
    case userTagID = "user_tag_id"
    case name
    case copyCount = "copy_count"
  }
}

struct CollectionSearchOptions: Decodable, Equatable {
  let decks: [CollectionSearchDeck]
  let userTags: [String]
  let userTagDetails: [CollectionSearchUserTag]

  enum CodingKeys: String, CodingKey {
    case decks
    case userTags = "user_tags"
    case userTagDetails = "user_tag_details"
  }
}

struct CollectionSearchPage: Decodable {
  let searchID: String
  let copies: [CollectionCopy]
  let basicLands: [CollectionBasicLand]?
  let totalCount: Int?
  let nextCursor: String?
  let searchOptions: CollectionSearchOptions?

  enum CodingKeys: String, CodingKey {
    case searchID = "search_id"
    case copies
    case basicLands = "basic_lands"
    case totalCount = "total_count"
    case nextCursor = "next_cursor"
    case searchOptions = "search_options"
  }
}
