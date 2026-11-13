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
