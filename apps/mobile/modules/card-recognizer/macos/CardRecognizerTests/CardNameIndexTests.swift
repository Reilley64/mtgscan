import CardRecognizer
import Foundation
import Testing

private func printings(_ rows: [[String: Any]]) throws -> [GalleryPrinting] {
  let filled = rows.enumerated().map { index, row in
    [
      "id": "printing-\(index)", "oracleId": row["name"] ?? "", "illustrationId": NSNull(), "set": "set",
      "collectorNumber": "\(index)", "frame": "2015", "finishes": ["nonfoil"], "basicLand": false,
    ].merging(row) { $1 }
  }
  return try JSONDecoder().decode([GalleryPrinting].self, from: JSONSerialization.data(withJSONObject: filled))
}

private func names(_ index: CardNameIndex, _ text: String) -> [String] {
  index.search(text).map(\.name)
}

@Test("ranks an exact name first, then names that start with the text, then names with a word that starts with it")
func ranksExactNamesThenPrefixesThenWords() throws {
  let index = CardNameIndex(printings: try printings([
    ["name": "Lightning Bolt"], ["name": "Bolt"], ["name": "Boltwing Marauder"], ["name": "Firebolt"],
  ]))
  #expect(names(index, "bolt") == ["Bolt", "Boltwing Marauder", "Lightning Bolt"])
}

@Test("matches card names ignoring case, accents, and punctuation")
func matchesIgnoringCaseAccentsAndPunctuation() throws {
  let index = CardNameIndex(printings: try printings([
    ["name": "Lim-Dûl's Vault"], ["name": "Jace, the Mind Sculptor"], ["name": "Séance"],
  ]))
  #expect(names(index, "LIM DULS") == ["Lim-Dûl's Vault"])
  #expect(names(index, "jace the mind") == ["Jace, the Mind Sculptor"])
  #expect(names(index, "seance") == ["Séance"])
  #expect(names(index, "mind sculptor") == ["Jace, the Mind Sculptor"])
}

@Test("matches the face names of a card with two faces")
func matchesFaceNames() throws {
  let index = CardNameIndex(printings: try printings([
    ["name": "Fire // Ice", "oracleId": "fire-ice", "faceNames": ["Fire", "Ice"]],
    ["name": "Icy Manipulator"],
  ]))
  #expect(names(index, "ice") == ["Fire // Ice"])
}

@Test("ranks a card name before a face name that matches the same way")
func ranksCardNamesBeforeFaceNames() throws {
  let index = CardNameIndex(printings: try printings([
    ["name": "Emeritus of Conflict // Lightning Bolt", "faceNames": ["Emeritus of Conflict", "Lightning Bolt"]],
    ["name": "Lightning Bolt"],
    ["name": "Lightning Axe"],
  ]))
  #expect(names(index, "lightning bolt") == ["Lightning Bolt", "Emeritus of Conflict // Lightning Bolt"])
  #expect(names(index, "light") == ["Lightning Axe", "Lightning Bolt", "Emeritus of Conflict // Lightning Bolt"])
}

@Test("lists each card once and returns at most 10 names")
func listsEachCardOnceAndAtMostTen() throws {
  let rows = (0 ..< 12).map { ["name": "Goblin \($0 + 10)"] } + [["name": "Goblin 10", "oracleId": "Goblin 10"]]
  let index = CardNameIndex(printings: try printings(rows))
  let found = names(index, "goblin")
  #expect(found.count == 10)
  #expect(Set(found).count == 10)
}

@Test("does not match a misspelled name")
func doesNotMatchAMisspelledName() throws {
  let index = CardNameIndex(printings: try printings([["name": "Counterspell"]]))
  #expect(names(index, "countrspell").isEmpty)
  #expect(names(index, "  ").isEmpty)
}

@Test("lists every printing of a card newest first")
func listsEveryPrintingNewestFirst() throws {
  let all = try printings([["name": "Sol Ring"], ["name": "Counterspell"], ["name": "Sol Ring"]])
  let index = CardNameIndex(printings: all)
  #expect(index.printings(oracleId: "Sol Ring").map { all[$0].id } == ["printing-2", "printing-0"])
}

@Test("reads a printing list row without finishes as a printing with no finishes")
func readsAnOlderPrintingListRow() throws {
  let data = Data(#"[{"id":"a","oracleId":"o","illustrationId":null,"name":"Alpha","set":"lea","collectorNumber":"1","frame":"1993"}]"#.utf8)
  let printing = try #require(try JSONDecoder().decode([GalleryPrinting].self, from: data).first)
  #expect(printing.finishes.isEmpty)
  #expect(printing.faceNames.isEmpty)
  #expect(printing.basicLand == false)
}
