import Foundation

struct CollectionCopy: Decodable, Equatable {
  let copyID: String
  let printing: CollectionPrinting
  let finish: String
  let condition: String
  let language: String
  let protected: Bool
  let addedAt: String
  let currentPrice: CollectionPrice?
  let purchaseDayUsdCents: Int?
  let userTags: [CollectionUserTag]
  let deck: CollectionDeck?
  let heldFor: CollectionDeck?

  enum CodingKeys: String, CodingKey {
    case copyID = "copy_id"
    case printing, finish, condition, language, protected
    case addedAt = "added_at"
    case currentPrice = "current_price"
    case purchaseDayUsdCents = "purchase_day_usd_cents"
    case userTags = "user_tags"
    case deck
    case heldFor = "held_for"
  }
}

struct CollectionPrinting: Decodable, Equatable {
  let printingID: String
  let name: String
  let setCode: String
  let setName: String
  let collectorNumber: String
  let rarity: String
  let imageURIs: [String]
  let artCropURI: String?
  let artist: String?
  let typeLine: String
  let manaCost: String
  let commanderLegality: String
  let faces: [CollectionFace]

  enum CodingKeys: String, CodingKey {
    case printingID = "printing_id"
    case name
    case setCode = "set_code"
    case setName = "set_name"
    case collectorNumber = "collector_number"
    case rarity
    case imageURIs = "image_uris"
    case artCropURI = "art_crop_uri"
    case artist
    case typeLine = "type_line"
    case manaCost = "mana_cost"
    case commanderLegality = "commander_legality"
    case faces
  }
}

struct CollectionFace: Decodable, Equatable {
  let name: String
  let oracleText: String
  enum CodingKeys: String, CodingKey {
    case name
    case oracleText = "oracle_text"
  }
}

struct CollectionPrice: Decodable, Equatable {
  let usdCents: Int
  let stale: Bool
  enum CodingKeys: String, CodingKey {
    case usdCents = "usd_cents"
    case stale
  }
}

struct CollectionUserTag: Decodable, Equatable {
  let userTagID: String
  let name: String
  enum CodingKeys: String, CodingKey {
    case userTagID = "user_tag_id"
    case name
  }
}

struct CollectionDeck: Decodable, Equatable {
  let deckID: String
  let name: String
  let commanderArtCropURI: String?
  let role: String?
  enum CodingKeys: String, CodingKey {
    case deckID = "deck_id"
    case name
    case commanderArtCropURI = "commander_art_crop_uri"
    case role
  }
}

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
  let decks: [CollectionDeck]
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
