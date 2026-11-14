import Foundation

enum CatalogValue: Encodable, Equatable {
  case text(String)
  case list([String])
  case number(Double)
  case boolean(Bool)

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .text(let value): try container.encode(value)
    case .list(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .boolean(let value): try container.encode(value)
    }
  }
}

struct CatalogQuery: Encodable, Equatable {
  var fields: [String: CatalogValue] = [:]

  func encode(to encoder: Encoder) throws {
    try fields.encode(to: encoder)
  }

  var hasCriteria: Bool {
    fields.keys.contains {
      !["sort", "sort_order", "limit", "cursor", "include_oracle_text"].contains($0)
    }
  }
}

enum CatalogDecoding {
  static func decoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }
}

struct CatalogOwned: Decodable, Equatable {
  let quantity: Int
  let freeQuantity: Int
  let protectedFreeQuantity: Int
}

struct CatalogPrice: Decodable, Equatable {
  let currency: String
  let amount: String
  let finish: String
  let basis: String
}

struct CatalogRow: Decodable, Equatable {
  let oracleId: String
  let name: String
  let manaCost: String
  let manaValue: Double
  let typeLine: String
  let colorIdentity: [String]
  let isGameChanger: Bool
  let canBeCommander: Bool
  let edhrecRank: Int?
  let oracleText: String?
  let priceFrom: CatalogPrice?
  let owned: CatalogOwned
}

struct CatalogSearchPage: Decodable {
  var items: [CatalogRow]
  var nextCursor: String?
  let searchId: String
  let rulesDataAsOf: String
  let rulesStale: Bool
  let pricesObservedAt: String?
  let pricesStale: Bool
}

struct CatalogFace: Decodable, Equatable {
  let name: String
  let manaCost: String
  let typeLine: String
  let oracleText: String
  let colors: [String]
  let power: String?
  let toughness: String?
  let loyalty: String?
}

struct CatalogTagLabel: Decodable, Equatable {
  let slug: String
  let label: String
}

struct CatalogOtherCard: Decodable, Equatable {
  let oracleId: String
  let name: String
}

struct CatalogCombo: Decodable, Equatable {
  let spellbookId: String
  let otherCard: CatalogOtherCard
  let producedFeatures: [String]
  let bracketTag: String
}

struct CatalogCard: Decodable, Equatable {
  let oracleId: String
  let name: String
  let manaCost: String
  let manaValue: Double
  let typeLine: String
  let oracleText: String
  let colors: [String]
  let colorIdentity: [String]
  let keywords: [String]
  let faces: [CatalogFace]
  let commanderLegality: String
  let canBeCommander: Bool
  let isGameChanger: Bool?
  let edhrecRank: Int?
  let releasedAt: String
  let printingCount: Int
  let priceFrom: CatalogPrice?
  let owned: CatalogOwned
  let tags: [CatalogTagLabel]
  let combos: [CatalogCombo]
  var printing: CatalogPrinting?
}

struct CatalogCardsPage: Decodable {
  var items: [CatalogCard]
  let notFound: [String]
  let rulesDataAsOf: String
  let rulesStale: Bool
  let pricesObservedAt: String?
  let pricesStale: Bool
}

struct CatalogPrinting: Decodable, Equatable {
  let printingId: String
  let set: String
  let setName: String
  let collectorNumber: String
  let rarity: String
  let finishes: [String]
  let releasedAt: String
  let imageUris: [String]
  let artCropUri: String?
  let artist: String?
  let ownedQuantity: Int?
}

struct CatalogPrintingsPage: Decodable {
  var items: [CatalogPrinting]
  var nextCursor: String?
  let rulesDataAsOf: String
  let rulesStale: Bool
}

struct CatalogOracleTag: Decodable, Equatable {
  let id: String
  let slug: String
  let label: String
  let aliases: [String]
  let description: String?
  let parentSlugs: [String]
  let cardCount: Int
}

struct CatalogTagsPage: Decodable {
  let items: [CatalogOracleTag]
  let rulesDataAsOf: String
  let rulesStale: Bool
}
