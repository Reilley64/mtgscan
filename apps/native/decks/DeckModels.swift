import Foundation

enum DeckPriority: String, Codable, CaseIterable {
  case high, medium, low
  var title: String { rawValue.capitalized }
}

struct DeckCommander: Decodable, Equatable {
  let copyID: String
  let name: String
  let artCropURI: String?
  enum CodingKeys: String, CodingKey {
    case copyID = "copy_id"
    case name
    case artCropURI = "art_crop_uri"
  }
}

struct DeckEvaluation: Decodable, Equatable {
  let validity: String
  let validityStale: Bool
  let estimatedBracket: Int
  let bracketStale: Bool
  enum CodingKeys: String, CodingKey {
    case validity
    case validityStale = "validity_stale"
    case estimatedBracket = "estimated_bracket"
    case bracketStale = "bracket_stale"
  }
  var validityTitle: String {
    switch validity {
    case "valid": return "Valid"
    case "invalid": return "Invalid"
    default: return "Cannot be determined"
    }
  }
}

struct DeckSummary: Decodable, Equatable {
  let deckID: String
  let name: String
  let priority: DeckPriority
  let cardCount: Int
  let commanders: [DeckCommander]
  let lastUsedAt: String
  let revision: Int
  let evaluation: DeckEvaluation?
  let needsYouCount: Int?
  enum CodingKeys: String, CodingKey {
    case deckID = "deck_id"
    case name, priority
    case cardCount = "card_count"
    case commanders
    case lastUsedAt = "last_used_at"
    case revision, evaluation
    case needsYouCount = "needs_you_count"
  }
}

struct DeckContents: Decodable, Equatable {
  let summary: DeckSummary
  let createdAt: String
  let cards: [DeckCard]
  let basicLands: [DeckBasicLand]
  enum CodingKeys: String, CodingKey {
    case createdAt = "created_at"
    case cards
    case basicLands = "basic_lands"
  }
  init(from decoder: any Decoder) throws {
    summary = try DeckSummary(from: decoder)
    let fields = try decoder.container(keyedBy: CodingKeys.self)
    createdAt = try fields.decode(String.self, forKey: .createdAt)
    cards = try fields.decode([DeckCard].self, forKey: .cards)
    basicLands = try fields.decode([DeckBasicLand].self, forKey: .basicLands)
  }
}

struct DeckCard: Decodable, Equatable {
  let copyID: String
  let printingID: String
  let name: String
  let set: String
  let collectorNumber: String
  let rarity: String
  let imageURIs: [String]
  let finish: String
  let condition: String
  let language: String
  let protected: Bool
  let price: DeckPrice?
  let role: String
  let commanderAt: String?
  let addedAt: String
  let typeLine: String
  let manaValue: Double
  let colors: [String]
  let plannedOut: Bool
  enum CodingKeys: String, CodingKey {
    case copyID = "copy_id"
    case printingID = "printing_id"
    case name, set
    case collectorNumber = "collector_number"
    case rarity
    case imageURIs = "image_uris"
    case finish, condition, language, protected, price, role
    case commanderAt = "commander_at"
    case addedAt = "added_at"
    case typeLine = "type_line"
    case manaValue = "mana_value"
    case colors
    case plannedOut = "planned_out"
  }
}

struct DeckPrice: Decodable, Equatable {
  let currency: String
  let amount: String
  let finish: String
  let stale: Bool
}

struct DeckBasicLand: Decodable, Equatable {
  let oracleID: String?
  let name: String
  let imageURIs: [String]
  let count: Int
  enum CodingKeys: String, CodingKey {
    case oracleID = "oracle_id"
    case name
    case imageURIs = "image_uris"
    case count
  }
}

enum DeckMetadataChange: Equatable {
  case rename(String)
  case priority(DeckPriority)
  case used
}

enum DeckNameInput {
  static func checked(_ input: String) -> String? {
    let name = input.trimmingCharacters(in: .whitespacesAndNewlines)
    return !name.isEmpty && name.unicodeScalars.count <= PresentationData.deckNameLength
      && !name.contains("\0") ? name : nil
  }
}
