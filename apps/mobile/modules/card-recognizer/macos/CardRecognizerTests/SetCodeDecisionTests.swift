@testable import CardRecognizer
import Foundation
import Testing

private struct Printing {
  let name: String
  let set: String
  let collectorNumber: String
  var art: String? = nil
  var frame = "2015"
}

private func recognition(
  ranked imageRanking: [(printing: Printing, similarity: Float)],
  alsoInGallery: [Printing] = [],
  reading: CollectorLine
) throws -> (decision: RecognitionDecision, candidates: [String]) {
  let printings = imageRanking.map(\.printing) + alsoInGallery
  let gallery = try fixtureGallery(
    printings: printings.map { printing in
      let id = "\(printing.set)-\(printing.collectorNumber)"
      return [
        "id": id, "oracleId": printing.name, "illustrationId": printing.art ?? id, "name": printing.name,
        "set": printing.set, "collectorNumber": printing.collectorNumber, "frame": printing.frame,
      ]
    },
    vectors: [Float16](repeating: 0, count: printings.count * fixtureModel.vectorSize)
  )
  let choice = CardRecognizer.choose(
    ranked: Array(imageRanking.indices),
    scores: imageRanking.map(\.similarity) + alsoInGallery.map { _ in Float(0.3) },
    reading: reading,
    gallery: gallery,
    excluded: []
  )
  let candidates = choice.candidates.map {
    "\(gallery.printings[$0].set.uppercased()) \(gallery.printings[$0].collectorNumber)"
  }
  return (choice.decision, candidates)
}

private func setCodeRecognition(_ tokens: [String], sets: [String]) throws -> (decision: RecognitionDecision, candidates: [String]) {
  let reprints = sets.enumerated().map { index, set in
    (printing: Printing(name: "Shock", set: set, collectorNumber: "\(150 + index)", art: "shock-\(index)"), similarity: Float(0.80) - Float(index) * 0.01)
  }
  return try recognition(
    ranked: reprints + [(Printing(name: "Lightning Bolt", set: "m10", collectorNumber: "146"), 0.70)],
    reading: CollectorLine(setTokens: tokens)
  )
}

@Test("a set code read exactly accepts the printing of the top card in that set")
func aSetCodeReadExactlyAcceptsThePrintingOfTheTopCardInThatSet() throws {
  let result = try setCodeRecognition(["m15"], sets: ["m19", "m16", "m15"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M15 152")
}

@Test("a set code with look-alike characters accepts the printing of the top card in that set")
func aSetCodeWithLookAlikeCharactersAcceptsThePrintingOfTheTopCardInThatSet() throws {
  let result = try setCodeRecognition(["mt5"], sets: ["m19", "m15"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M15 151")
}

@Test("a set code with its first letter dropped accepts the printing of the top card in that set")
func aSetCodeWithItsFirstLetterDroppedAcceptsThePrintingOfTheTopCardInThatSet() throws {
  let result = try setCodeRecognition(["21"], sets: ["m19", "m21"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M21 151")
}

@Test("a set code with its separator read as a character accepts the printing of the top card in that set")
func aSetCodeWithItsSeparatorReadAsACharacterAcceptsThePrintingOfTheTopCardInThatSet() throws {
  let result = try setCodeRecognition(["m210"], sets: ["m19", "m21"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M21 151")
}

@Test("a set code one character from a shortlist set accepts the printing of the top card in that set")
func aSetCodeOneCharacterFromAShortlistSetAcceptsThePrintingOfTheTopCardInThatSet() throws {
  let result = try setCodeRecognition(["120"], sets: ["m19", "m20"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M20 151")
}

@Test("a better match level wins over a worse one")
func aBetterMatchLevelWinsOverAWorseOne() throws {
  let result = try setCodeRecognition(["m15"], sets: ["m16", "m15"])
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M15 151")
}

@Test("a match level that names two sets gives no set code")
func aMatchLevelThatNamesTwoSetsGivesNoSetCode() throws {
  let result = try setCodeRecognition(["21"], sets: ["m21", "j21"])
  #expect(!result.decision.accepted)
  #expect(result.decision.reasons == ["only printing of its art, but its collector line was not read"])
}

@Test("a set code matches only the sets of the image shortlist")
func aSetCodeMatchesOnlyTheSetsOfTheImageShortlist() throws {
  let result = try recognition(
    ranked: [
      (Printing(name: "Shock", set: "m19", collectorNumber: "156", art: "shock"), 0.80),
      (Printing(name: "Shock", set: "10e", collectorNumber: "227", art: "shock"), 0.79),
      (Printing(name: "Lightning Bolt", set: "m10", collectorNumber: "146"), 0.70),
    ],
    alsoInGallery: [Printing(name: "Shock", set: "m21", collectorNumber: "159")],
    reading: CollectorLine(setTokens: ["21"])
  )
  #expect(!result.decision.accepted)
  #expect(result.decision.reasons == ["2 printings share this art and no collector line was read"])
}

private let wallOfFireM14 = Printing(name: "Wall of Fire", set: "m14", collectorNumber: "160", art: "wall-of-fire")
private let wallOfFireM15 = Printing(name: "Wall of Fire", set: "m15", collectorNumber: "136", art: "wall-of-fire")
private let wallOfFireM13 = Printing(name: "Wall of Fire", set: "m13", collectorNumber: "155", art: "wall-of-fire")
private let forestM15 = Printing(name: "Forest", set: "m15", collectorNumber: "269")
private let shockM19 = Printing(name: "Shock", set: "m19", collectorNumber: "156")

@Test("a number read before a rarity letter that names a printing the image does not support is dropped for the set code")
func aNumberReadBeforeARarityLetterThatNamesAnUnsupportedPrintingIsDroppedForTheSetCode() throws {
  let ranked = [(wallOfFireM14, Float(0.80)), (wallOfFireM15, 0.79), (wallOfFireM13, 0.78), (shockM19, 0.70)]
  let result = try recognition(
    ranked: ranked,
    alsoInGallery: [forestM15],
    reading: CollectorLine(setCode: "m15", collectorNumber: "269", numberBeforeRarity: true)
  )
  #expect(result.decision.basis == .setCode)
  #expect(result.candidates.first == "M15 136")
  let fromAFraction = try recognition(
    ranked: ranked,
    alsoInGallery: [forestM15],
    reading: CollectorLine(setCode: "m15", collectorNumber: "269")
  )
  #expect(!fromAFraction.decision.accepted)
  #expect(fromAFraction.decision.reasons == ["collector line M15 269 names a card the image does not support"])
}

@Test("a number with no set code shows the one printing of the top card with that number first and abstains")
func aNumberWithNoSetCodeShowsTheOnePrintingOfTheTopCardWithThatNumberFirstAndAbstains() throws {
  let result = try recognition(
    ranked: [(wallOfFireM14, 0.80), (wallOfFireM13, 0.79), (wallOfFireM15, 0.78), (shockM19, 0.70)],
    reading: CollectorLine(collectorNumber: "136")
  )
  #expect(!result.decision.accepted)
  #expect(result.candidates.first == "M15 136")
  #expect(result.decision.reasons == [
    "3 printings share this art and collector line read only 136",
    "M15 136 is the only printing of the top card with that collector number",
  ])
}

@Test("a number with no set code that two printings of the top card share shows the top image candidate first")
func aNumberWithNoSetCodeThatTwoPrintingsShareShowsTheTopImageCandidateFirst() throws {
  let wallOfFireM12 = Printing(name: "Wall of Fire", set: "m12", collectorNumber: "136", art: "wall-of-fire")
  let result = try recognition(
    ranked: [(wallOfFireM14, 0.80), (wallOfFireM12, 0.79), (wallOfFireM15, 0.78), (shockM19, 0.70)],
    reading: CollectorLine(collectorNumber: "136")
  )
  #expect(!result.decision.accepted)
  #expect(result.candidates.first == "M14 160")
}

@Test("a set code abstains when another card is closer than the art margin")
func aSetCodeAbstainsWhenAnotherCardIsCloserThanTheArtMargin() throws {
  let reverentHoplite = Printing(name: "Reverent Hoplite", set: "thb", collectorNumber: "33")
  let sunlitHoplite = Printing(name: "Sunlit Hoplite", set: "thb", collectorNumber: "35")
  let result = try recognition(
    ranked: [(reverentHoplite, 0.80), (sunlitHoplite, 0.79), (shockM19, 0.70)],
    reading: CollectorLine(setCode: "thb")
  )
  #expect(!result.decision.accepted)
  #expect(result.candidates.first == "THB 33")
  #expect(result.decision.reasons == [
    "set THB leaves one printing of the top card, but the next card is 0.010 behind; at least 0.025 is required",
  ])
}

@Test("a set code read on a card whose top printing has an older frame abstains")
func aSetCodeReadOnACardWhoseTopPrintingHasAnOlderFrameAbstains() throws {
  let clearAPath = Printing(name: "Clear a Path", set: "dgm", collectorNumber: "32", frame: "2003")
  let ranked = [(clearAPath, Float(0.80)), (shockM19, 0.70)]
  let withSetCode = try recognition(ranked: ranked, reading: CollectorLine(setTokens: ["xln"]))
  #expect(!withSetCode.decision.accepted)
  #expect(withSetCode.decision.reasons == ["only printing of its art, but a set code was read and its frame prints none"])
  let unread = try recognition(ranked: ranked, reading: CollectorLine())
  #expect(unread.decision.basis == .uniqueArt)
}

@Test("a set code with no number abstains when its set has two printings of the top card")
func aSetCodeWithNoNumberAbstainsWhenItsSetHasTwoPrintingsOfTheTopCard() throws {
  let charmingPrince = Printing(name: "Charming Prince", set: "eld", collectorNumber: "8")
  let showcase = Printing(name: "Charming Prince", set: "eld", collectorNumber: "335")
  let result = try recognition(
    ranked: [(charmingPrince, 0.80), (shockM19, 0.70)],
    alsoInGallery: [showcase],
    reading: CollectorLine(setCode: "eld")
  )
  #expect(!result.decision.accepted)
  #expect(result.candidates.first == "ELD 8")
  #expect(result.decision.reasons == ["set ELD has 2 printings of the top card and no collector number was read"])
}
