import Foundation

public struct CardName: Sendable, Equatable {
  public let oracleId: String
  public let name: String
}

public struct CardNameIndex: Sendable {
  public static let resultLimit = 10
  private static let apostrophes = CharacterSet(charactersIn: "'\u{2019}")

  private struct Card: Sendable {
    let name: CardName
    let nameKey: String
    let faceKeys: [String]
  }

  private struct Match {
    let rank: Int
    let key: String
    let name: CardName
  }

  private let cards: [Card]
  private let printingsByOracle: [String: [Int]]

  public init(printings: [GalleryPrinting]) {
    var cards: [Card] = []
    var printingsByOracle: [String: [Int]] = [:]
    for (index, printing) in printings.enumerated() {
      if printingsByOracle[printing.oracleId] == nil {
        cards.append(Card(
          name: CardName(oracleId: printing.oracleId, name: printing.name),
          nameKey: Self.normalized(printing.name),
          faceKeys: printing.faceNames.map(Self.normalized).filter { !$0.isEmpty }
        ))
      }
      printingsByOracle[printing.oracleId, default: []].append(index)
    }
    self.cards = cards
    self.printingsByOracle = printingsByOracle
  }

  public func search(_ text: String) -> [CardName] {
    let query = Self.normalized(text)
    guard !query.isEmpty else { return [] }
    let matches = cards.compactMap { card -> Match? in
      let byName = Self.rank(of: card.nameKey, for: query).map { Match(rank: $0 * 2, key: card.nameKey, name: card.name) }
      let byFace = card.faceKeys.compactMap { key in
        Self.rank(of: key, for: query).map { Match(rank: $0 * 2 + 1, key: key, name: card.name) }
      }
      return ([byName].compactMap { $0 } + byFace).min { ($0.rank, $0.key) < ($1.rank, $1.key) }
    }
    return matches
      .sorted { ($0.rank, $0.key, $0.name.name) < ($1.rank, $1.key, $1.name.name) }
      .prefix(Self.resultLimit)
      .map(\.name)
  }

  public func printings(oracleId: String) -> [Int] {
    (printingsByOracle[oracleId] ?? []).reversed()
  }

  static func normalized(_ text: String) -> String {
    let folded = text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    let kept = folded.unicodeScalars
      .filter { !apostrophes.contains($0) }
      .map { CharacterSet.alphanumerics.contains($0) ? Character($0) : " " }
    return String(kept).split(separator: " ").joined(separator: " ")
  }

  private static func rank(of key: String, for query: String) -> Int? {
    if key == query { return 0 }
    if key.hasPrefix(query) { return 1 }
    if key.contains(" " + query) { return 2 }
    return nil
  }
}
