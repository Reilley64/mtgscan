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

private func choice(
  ranked imageRanking: [(printing: Printing, similarity: Float)],
  reading: CollectorLine = CollectorLine(),
  thresholds: RecognizerThresholds = FeaturePrint.thresholds
) throws -> (decision: RecognitionDecision, artMargin: Float?) {
  let gallery = try fixtureGallery(
    printings: imageRanking.map { ranked in
      let printing = ranked.printing
      let id = "\(printing.set)-\(printing.collectorNumber)"
      return [
        "id": id, "oracleId": printing.name, "illustrationId": printing.art ?? id, "name": printing.name,
        "set": printing.set, "collectorNumber": printing.collectorNumber, "frame": printing.frame,
      ]
    },
    vectors: [Float16](repeating: 0, count: imageRanking.count * FeaturePrint.dimension),
    thresholds: thresholds
  )
  let result = CardRecognizer.choose(
    ranked: Array(imageRanking.indices),
    scores: imageRanking.map(\.similarity),
    reading: reading,
    gallery: gallery,
    excluded: []
  )
  return (result.decision, result.artMargin)
}

private let lightningBoltM10 = Printing(name: "Lightning Bolt", set: "m10", collectorNumber: "146")
private let lightningBolt2XM = Printing(name: "Lightning Bolt", set: "2xm", collectorNumber: "129")
private let shock = Printing(name: "Shock", set: "m19", collectorNumber: "156")
private let counterspell = Printing(name: "Counterspell", set: "7ed", collectorNumber: "67", frame: "1997")

@Test("an accept on a collector line that names a card printing in the image shortlist has the collector line basis")
func anAcceptOnTheCollectorLineHasTheCollectorLineBasis() throws {
  let result = try choice(
    ranked: [(lightningBoltM10, 0.82), (lightningBolt2XM, 0.80), (shock, 0.75)],
    reading: CollectorLine(setCode: "2xm", collectorNumber: "129")
  )
  #expect(result.decision.accepted)
  #expect(result.decision.basis == .collectorLine)
  #expect(abs(try #require(result.artMargin) - 0.02) < 0.0001)
}

@Test("an accept on a set code that leaves one card printing of the top card has the set code basis")
func anAcceptOnTheSetCodeHasTheSetCodeBasis() throws {
  let result = try choice(
    ranked: [(lightningBoltM10, 0.82), (shock, 0.77), (lightningBolt2XM, 0.76)],
    reading: CollectorLine(setCode: "2xm")
  )
  #expect(result.decision.accepted)
  #expect(result.decision.basis == .setCode)
  #expect(abs(try #require(result.artMargin) - 0.05) < 0.0001)
}

@Test("an accept on the only card printing of its art has the unique art basis")
func anAcceptOnTheOnlyCardPrintingOfItsArtHasTheUniqueArtBasis() throws {
  let result = try choice(ranked: [(counterspell, 0.70), (shock, 0.60)])
  #expect(result.decision.accepted)
  #expect(result.decision.basis == .uniqueArt)
  #expect(abs(try #require(result.artMargin) - 0.10) < 0.0001)
}

@Test("the only card printing of its art abstains when the next art is closer than the art margin of the gallery version")
func theOnlyCardPrintingOfItsArtAbstainsUnderTheArtMarginOfTheGalleryVersion() throws {
  let wider = RecognizerThresholds(
    notACard: FeaturePrint.thresholds.notACard,
    orientationMargin: FeaturePrint.thresholds.orientationMargin,
    artMargin: 0.12
  )
  let result = try choice(ranked: [(counterspell, 0.70), (shock, 0.60)], thresholds: wider)
  #expect(!result.decision.accepted)
  #expect(result.decision.reasons == ["only printing of its art, but the next art is 0.100 behind; at least 0.120 is required"])
}

@Test("an abstain has no basis and keeps the art margin to the best other art")
func anAbstainHasNoBasis() throws {
  let firstPrinting = Printing(name: "Counterspell", set: "7ed", collectorNumber: "67", art: "counterspell-art")
  let reprint = Printing(name: "Counterspell", set: "8ed", collectorNumber: "71", art: "counterspell-art")
  let result = try choice(ranked: [(firstPrinting, 0.70), (reprint, 0.69), (shock, 0.62)])
  #expect(!result.decision.accepted)
  #expect(result.decision.basis == nil)
  #expect(abs(try #require(result.artMargin) - 0.08) < 0.0001)
}

@Test("a recognition that compared no other art has no art margin")
func aRecognitionThatComparedNoOtherArtHasNoArtMargin() throws {
  let firstPrinting = Printing(name: "Counterspell", set: "7ed", collectorNumber: "67", art: "counterspell-art")
  let reprint = Printing(name: "Counterspell", set: "8ed", collectorNumber: "71", art: "counterspell-art")
  let result = try choice(ranked: [(firstPrinting, 0.70), (reprint, 0.69)])
  #expect(!result.decision.accepted)
  #expect(result.artMargin == nil)
}
