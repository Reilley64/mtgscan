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
    let keys: [String]
  }

  private let cards: [Card]
  private let printingsByOracle: [String: [Int]]

  public init(printings: [GalleryPrinting]) {
    var cards: [Card] = []
    var printingsByOracle: [String: [Int]] = [:]
    for (index, printing) in printings.enumerated() {
      if printingsByOracle[printing.oracleId] == nil {
        let keys = ([printing.name] + printing.faceNames).map(Self.normalized).filter { !$0.isEmpty }
        cards.append(Card(name: CardName(oracleId: printing.oracleId, name: printing.name), keys: keys))
      }
      printingsByOracle[printing.oracleId, default: []].append(index)
    }
    self.cards = cards.sorted { $0.name.name < $1.name.name }
    self.printingsByOracle = printingsByOracle
  }

  public func search(_ text: String) -> [CardName] {
    let query = Self.normalized(text)
    guard !query.isEmpty else { return [] }
    var ranked: [[CardName]] = [[], [], []]
    for card in cards {
      guard let rank = card.keys.compactMap({ Self.rank(of: $0, for: query) }).min() else { continue }
      ranked[rank].append(card.name)
    }
    return Array(ranked.joined().prefix(Self.resultLimit))
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
