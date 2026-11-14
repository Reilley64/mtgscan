import Foundation

enum FinishView: String, Codable, CaseIterable {
  case any
  case nonfoil
  case foil

  var label: String {
    switch self {
    case .any: return "Any finish"
    case .nonfoil: return "Nonfoil"
    case .foil: return "Foil"
    }
  }
}

struct FinishValues<Value: Decodable & Equatable>: Decodable, Equatable {
  let any: Value
  let nonfoil: Value
  let foil: Value

  subscript(view: FinishView) -> Value {
    switch view {
    case .any: return any
    case .nonfoil: return nonfoil
    case .foil: return foil
    }
  }
}

struct SetCompletion: Decodable, Equatable {
  let owned: Int
  let size: Int
  var count: String { "\(owned) of \(size)" }
  var share: Double { size > 0 ? Double(owned) / Double(size) : 0 }
  var percent: Int? { size > 0 ? Int(floor(100 * share)) : nil }
  var complete: Bool { size > 0 && owned == size }
  func spoken(_ name: String) -> String {
    [name, count, percent.map { "\($0) percent" }].compactMap { $0 }.joined(separator: ", ")
  }
}

struct CardSet: Decodable, Equatable {
  let code: String
  let name: String
  let releasedAt: String
  let iconSVGURI: String
  let setArtURI: String?
  let completion: FinishValues<SetCompletion>

  enum CodingKeys: String, CodingKey {
    case code, name, completion
    case releasedAt = "released_at"
    case iconSVGURI = "icon_svg_uri"
    case setArtURI = "set_art_uri"
  }
}

struct SetCardPrinting: Decodable, Equatable {
  let printingID: String
  let name: String
  let collectorNumber: String
  let imageURI: String?
  let finishes: [String]
  let counts: FinishValues<Int?>

  enum CodingKeys: String, CodingKey {
    case name, finishes, counts
    case printingID = "printing_id"
    case collectorNumber = "collector_number"
    case imageURI = "image_uri"
  }

  func spoken(_ view: FinishView) -> String {
    let quantity = counts[view] ?? 0
    let ownership =
      quantity == 0 ? "not owned" : quantity == 1 ? "owned" : "owned, \(quantity) copies"
    return "\(name), number \(collectorNumber), \(ownership)"
  }
}

struct SetSection: Decodable, Equatable {
  let name: String
  let completion: FinishValues<SetCompletion>
  let cardPrintings: [SetCardPrinting]

  enum CodingKeys: String, CodingKey {
    case name, completion
    case cardPrintings = "card_printings"
  }
}

struct SetDetails: Decodable, Equatable {
  let summary: CardSet
  let mainSet: [SetCardPrinting]
  let variants: SetSection
  let sections: [SetSection]
  let other: SetSection

  enum CodingKeys: String, CodingKey {
    case variants, sections, other
    case mainSet = "main_set"
  }

  init(from decoder: Decoder) throws {
    summary = try CardSet(from: decoder)
    let values = try decoder.container(keyedBy: CodingKeys.self)
    mainSet = try values.decode([SetCardPrinting].self, forKey: .mainSet)
    variants = try values.decode(SetSection.self, forKey: .variants)
    sections = try values.decode([SetSection].self, forKey: .sections)
    other = try values.decode(SetSection.self, forKey: .other)
  }
}

struct SetList: Decodable, Equatable {
  let items: [CardSet]
  let nextCursor: String?
  enum CodingKeys: String, CodingKey {
    case items
    case nextCursor = "next_cursor"
  }
}
