@testable import CardRecognizer
import Foundation
import Testing

private struct Printing {
  let name: String
  let set: String
  let collectorNumber: String
}

private func gallery(of printings: [Printing]) throws -> Gallery {
  try fixtureGallery(
    printings: printings.map { printing in
      let id = "\(printing.set)-\(printing.collectorNumber)"
      return [
        "id": id, "oracleId": printing.name, "illustrationId": id, "name": printing.name, "set": printing.set,
        "collectorNumber": printing.collectorNumber, "frame": "2015",
      ]
    },
    vectors: [Float16](repeating: 0, count: printings.count * fixtureModel.vectorSize)
  )
}

private func recognition(
  imageRanking: [Printing],
  alsoInGallery: [Printing] = [],
  collectorLine: (set: String, number: String)
) throws -> (accepted: Bool, candidates: [String]) {
  let gallery = try gallery(of: imageRanking + alsoInGallery)
  let ranked = Array(imageRanking.indices)
  let scores = ranked.map { 0.627 - Float($0) * 0.01 } + alsoInGallery.map { _ in Float(0.3) }
  let choice = CardRecognizer.choose(
    ranked: ranked,
    scores: scores,
    reading: CollectorLine(setCode: collectorLine.set, collectorNumber: collectorLine.number),
    gallery: gallery,
    excluded: []
  )
  let candidates = choice.candidates.map {
    "\(gallery.printings[$0].name) \(gallery.printings[$0].set.uppercased()) \(gallery.printings[$0].collectorNumber)"
  }
  return (choice.decision.accepted, candidates)
}

private let bigScore = Printing(name: "Big Score", set: "sld", collectorNumber: "7096")
private let swordOfTruthAndJustice = Printing(name: "Sword of Truth and Justice", set: "sld", collectorNumber: "1096")
private let otherImageCandidates = [
  Printing(name: "Lich", set: "30a", collectorNumber: "109"),
  Printing(name: "Fireball", set: "30a", collectorNumber: "149"),
  Printing(name: "Channel", set: "30a", collectorNumber: "102"),
]

@Test("a misread collector line that names a card the image does not support shows the image's top card printing first")
func misreadCollectorLineShowsTheImagesTopCardPrintingFirst() throws {
  let result = try recognition(
    imageRanking: [bigScore] + otherImageCandidates,
    alsoInGallery: [swordOfTruthAndJustice],
    collectorLine: ("sld", "1096")
  )
  #expect(!result.accepted)
  #expect(result.candidates.first == "Big Score SLD 7096")
  #expect(result.candidates.contains("Sword of Truth and Justice SLD 1096"))
}

@Test("a collector line one character from one card printing of its set with the art of a top 5 image candidate shows that card printing first")
func collectorLineOneCharacterFromOneCardPrintingWithATopArtShowsItFirst() throws {
  let bigScoreElsewhere = Printing(name: "Big Score", set: "snc", collectorNumber: "102")
  let result = try recognition(
    imageRanking: [bigScoreElsewhere, bigScore] + otherImageCandidates,
    alsoInGallery: [swordOfTruthAndJustice],
    collectorLine: ("sld", "1096")
  )
  #expect(!result.accepted)
  #expect(result.candidates.first == "Big Score SLD 7096")
  #expect(result.candidates.contains("Sword of Truth and Justice SLD 1096"))
}

@Test("a collector line one character from two card printings of its set with the art of a top 5 image candidate shows the image's top card printing first")
func collectorLineOneCharacterFromTwoCardPrintingsWithATopArtShowsTheImagesTopCardPrintingFirst() throws {
  let bigScoreElsewhere = Printing(name: "Big Score", set: "snc", collectorNumber: "102")
  let otherSecretLairCard = Printing(name: "Lightning Bolt", set: "sld", collectorNumber: "1097")
  let result = try recognition(
    imageRanking: [bigScoreElsewhere, bigScore, otherSecretLairCard] + otherImageCandidates,
    alsoInGallery: [swordOfTruthAndJustice],
    collectorLine: ("sld", "1096")
  )
  #expect(!result.accepted)
  #expect(result.candidates.first == "Big Score SNC 102")
  #expect(result.candidates.contains("Sword of Truth and Justice SLD 1096"))
}

@Test("a collector line one character from a card printing whose art is not among the top 5 image candidates shows the image's top card printing first")
func collectorLineOneCharacterFromACardPrintingOutsideTheTopArtsShowsTheImagesTopCardPrintingFirst() throws {
  let bigScoreElsewhere = Printing(name: "Big Score", set: "snc", collectorNumber: "102")
  let result = try recognition(
    imageRanking: [bigScoreElsewhere] + otherImageCandidates + [Printing(name: "Mox Pearl", set: "30a", collectorNumber: "254"), bigScore],
    alsoInGallery: [swordOfTruthAndJustice],
    collectorLine: ("sld", "1096")
  )
  #expect(!result.accepted)
  #expect(result.candidates.first == "Big Score SNC 102")
  #expect(result.candidates.contains("Sword of Truth and Justice SLD 1096"))
}
