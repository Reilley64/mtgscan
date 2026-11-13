import Foundation

enum DeckGrouping: String, CaseIterable {
  case type = "Type"
  case manaValue = "Mana value"
  case color = "Color"
  case rarity = "Rarity"
  case none = "None"
}

enum DeckSort: String, CaseIterable {
  case name = "Name"
  case manaValue = "Mana value"
  case price = "Price"
  case added = "Recently added"
}

struct DeckTile {
  let id: String
  let name: String
  let imageURI: String?
  let copy: DeckCard?
  var copyID: String? { copy?.copyID }
}

struct DeckGroup {
  let title: String
  let tiles: [DeckTile]
}

enum DeckOrdering {
  static func commanders(_ deck: DeckContents) -> [DeckCard] {
    deck.cards.filter { $0.role == "commander" }.sorted {
      if $0.commanderAt != $1.commanderAt { return ($0.commanderAt ?? "") < ($1.commanderAt ?? "") }
      return $0.copyID < $1.copyID
    }
  }

  static func groups(_ deck: DeckContents, grouping: DeckGrouping, sort: DeckSort, ascending: Bool)
    -> [DeckGroup]
  {
    var tiles = deck.cards.filter { $0.role == "main" }.map {
      DeckTile(id: $0.copyID, name: $0.name, imageURI: $0.imageURIs.first, copy: $0)
    }
    for land in deck.basicLands {
      guard let id = land.oracleID, land.count > 0 else { continue }
      tiles += (0..<land.count).map {
        DeckTile(id: "\(id):\($0)", name: land.name, imageURI: land.imageURIs.first, copy: nil)
      }
    }
    tiles.sort { ordered($0, $1, sort: sort, ascending: ascending) }
    let titles: [String]
    switch grouping {
    case .type: titles = PresentationData.deckTypeTitles
    case .manaValue:
      titles =
        (0..<PresentationData.highestDeckManaValue).map(String.init) + [
          "\(PresentationData.highestDeckManaValue)+", "Lands",
        ]
    case .color:
      titles =
        ["W", "U", "B", "R", "G"].compactMap { PresentationData.deckColors[$0] } + [
          "Multicolor", "Colorless",
        ]
    case .rarity:
      titles = ["mythic", "rare", "uncommon", "common", "special"].compactMap {
        PresentationData.deckRarities[$0]
      }
    case .none: titles = ["Main deck"]
    }
    return titles.compactMap { title in
      let matches = tiles.filter { group($0, by: grouping) == title }
      return matches.isEmpty ? nil : DeckGroup(title: title, tiles: matches)
    }
  }

  private static func typeGroup(_ tile: DeckTile) -> String {
    guard let copy = tile.copy else { return "Lands" }
    let words = copy.typeLine.components(separatedBy: CharacterSet.letters.inverted)
    return zip(PresentationData.deckTypes, PresentationData.deckTypeTitles).first {
      words.contains($0.0)
    }?.1 ?? "Lands"
  }

  private static func group(_ tile: DeckTile, by grouping: DeckGrouping) -> String {
    switch grouping {
    case .type: return typeGroup(tile)
    case .manaValue:
      if typeGroup(tile) == "Lands" { return "Lands" }
      let value = Int(floor(tile.copy?.manaValue ?? 0))
      return value >= PresentationData.highestDeckManaValue
        ? "\(PresentationData.highestDeckManaValue)+" : String(value)
    case .color:
      let colors = tile.copy?.colors ?? []
      if colors.count > 1 { return "Multicolor" }
      return colors.first.flatMap { PresentationData.deckColors[$0] } ?? "Colorless"
    case .rarity: return PresentationData.deckRarities[tile.copy?.rarity ?? "common"] ?? "Special"
    case .none: return "Main deck"
    }
  }

  private static func ordered(_ a: DeckTile, _ b: DeckTile, sort: DeckSort, ascending: Bool) -> Bool
  {
    let comparison: ComparisonResult
    switch sort {
    case .name: comparison = a.name.localizedStandardCompare(b.name)
    case .manaValue:
      let left = a.copy?.manaValue ?? 0
      let right = b.copy?.manaValue ?? 0
      comparison =
        left == right ? .orderedSame : left < right ? .orderedAscending : .orderedDescending
    case .price:
      let left = a.copy?.price.flatMap {
        Decimal(string: $0.amount, locale: Locale(identifier: "en_US_POSIX"))
      }
      let right = b.copy?.price.flatMap {
        Decimal(string: $0.amount, locale: Locale(identifier: "en_US_POSIX"))
      }
      if (left == nil) != (right == nil) { return left != nil }
      comparison =
        left == right
        ? .orderedSame : (left ?? 0) < (right ?? 0) ? .orderedAscending : .orderedDescending
    case .added:
      let left = a.copy?.addedAt
      let right = b.copy?.addedAt
      if (left == nil) != (right == nil) { return left != nil }
      comparison = (left ?? "").compare(right ?? "")
    }
    if comparison != .orderedSame {
      return ascending ? comparison == .orderedAscending : comparison == .orderedDescending
    }
    let byName = a.name.localizedStandardCompare(b.name)
    return byName == .orderedSame ? a.id < b.id : byName == .orderedAscending
  }
}
