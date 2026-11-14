import Foundation

struct CatalogFilterField {
  enum Kind {
    case list, number, text
    case choice([(value: String, label: String)])
  }
  let key: String
  let label: String
  let kind: Kind

  static let fields: [CatalogFilterField] = [
    .init(key: "names", label: "Names", kind: .list),
    .init(key: "names_exclude", label: "Exclude names", kind: .list),
    .init(key: "types", label: "Types", kind: .list),
    .init(key: "types_exclude", label: "Exclude types", kind: .list),
    .init(key: "colors", label: "Colors", kind: .list),
    .init(key: "colors_exclude", label: "Exclude colors", kind: .list),
    .init(key: "identity_subset_of", label: "Color identity within", kind: .list),
    .init(key: "mana_value_min", label: "Minimum mana value", kind: .number),
    .init(key: "mana_value_max", label: "Maximum mana value", kind: .number),
    .init(key: "power_min", label: "Minimum power", kind: .number),
    .init(key: "power_max", label: "Maximum power", kind: .number),
    .init(key: "toughness_min", label: "Minimum toughness", kind: .number),
    .init(key: "toughness_max", label: "Maximum toughness", kind: .number),
    .init(key: "price_min", label: "Minimum price in USD", kind: .text),
    .init(key: "price_max", label: "Maximum price in USD", kind: .text),
    .init(key: "keywords", label: "Keywords", kind: .list),
    .init(key: "keywords_exclude", label: "Exclude keywords", kind: .list),
    .init(key: "sets", label: "Sets", kind: .list),
    .init(key: "sets_exclude", label: "Exclude sets", kind: .list),
    .init(key: "rarities", label: "Rarities", kind: .list),
    .init(key: "rarities_exclude", label: "Exclude rarities", kind: .list),
    .init(key: "tags", label: "Oracle tag slugs", kind: .list),
    .init(key: "tags_exclude", label: "Exclude Oracle tag slugs", kind: .list),
    .init(
      key: "is_commander", label: "Can be commander",
      kind: .choice([("true", "True"), ("false", "False")])),
    .init(
      key: "is_game_changer", label: "Game Changer",
      kind: .choice([("true", "True"), ("false", "False")])),
    .init(
      key: "sort", label: "Order by",
      kind: .choice([
        ("relevance", "Relevance"), ("name", "Name"), ("mana_value", "Mana value"),
        ("edhrec_rank", "EDHREC rank"), ("price", "Price"), ("release_date", "Release date"),
      ])),
    .init(
      key: "sort_order", label: "Direction",
      kind: .choice([("asc", "Ascending"), ("desc", "Descending")])),
  ]

  func value(_ text: String) -> CatalogValue? {
    if text.isEmpty { return nil }
    switch kind {
    case .list where text == "[]": return .list([])
    case .list:
      return .list(
        text.split(separator: ",", omittingEmptySubsequences: false).map {
          $0.trimmingCharacters(in: .whitespaces)
        })
    case .number:
      guard let number = Double(text), number.isFinite else { return .text(text) }
      return .number(number)
    case .choice where text == "true" || text == "false": return .boolean(text == "true")
    default: return .text(text)
    }
  }
}
