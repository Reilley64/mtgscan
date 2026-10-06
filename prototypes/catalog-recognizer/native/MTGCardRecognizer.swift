import CoreGraphics
import CoreImage
import Foundation

struct MTGRecognitionCandidate: Codable {
  let scryfallId: String
  let oracleId: String
  let name: String
  let set: String
  let collectorNumber: String
  let score: Double
}

struct MTGRecognitionDecision: Codable {
  let accepted: Bool
  let scryfallId: String?
  let reasons: [String]
}

struct MTGRecognitionReading: Codable {
  let setCode: String?
  let collectorNumber: String?
  let premiumMark: Bool
  let lines: [String]
}

struct MTGRecognition: Codable {
  let candidates: [MTGRecognitionCandidate]
  let decision: MTGRecognitionDecision
  let reading: MTGRecognitionReading
  let rotation: Int
  let topSimilarity: Double
  let stageMs: [String: Double]
}

enum MTGCardRecognizer {
  static let embedWidth = 488
  static let embedHeight = 680
  static let readWidth = 1191
  static let readHeight = 1664
  static let shortlistSize = 50
  static let illustrationExpansion = 10
  static let notACardSimilarity: Float = 0.5
  static let unreadArtMargin: Float = 0.03
  static let orientationMargin: Float = 0.03
  static let candidateCount = 5

  enum Failure: Error {
    case unreadableImage
    case rectificationFailed
  }

  static func recognize(photo: URL, quad: MTGCardQuad, catalog: MTGCardCatalog, cropOutput: URL?) throws -> MTGRecognition {
    var stageMs: [String: Double] = [:]
    var startedAt = ProcessInfo.processInfo.systemUptime
    guard let image = MTGCardRectifier.loadOrientedImage(at: photo) else { throw Failure.unreadableImage }
    guard let card = MTGCardRectifier.rectify(
      image, normalizedQuad: quad.portraitOrdered(), width: readWidth, height: readHeight
    ) else { throw Failure.rectificationFailed }
    stageMs["rectify"] = elapsed(since: &startedAt)
    return try recognize(card: card, catalog: catalog, cropOutput: cropOutput, stageMs: stageMs)
  }

  static func recognize(crop: URL, catalog: MTGCardCatalog, cropOutput: URL?) throws -> MTGRecognition {
    guard let image = MTGCardRectifier.loadOrientedImage(at: crop),
          let card = MTGCardRectifier.context.createCGImage(image, from: image.extent)
    else { throw Failure.unreadableImage }
    return try recognize(card: card, catalog: catalog, cropOutput: cropOutput, stageMs: [:])
  }

  static func recognize(
    card uprightCandidate: CGImage,
    catalog: MTGCardCatalog,
    cropOutput: URL?,
    stageMs initialStageMs: [String: Double]
  ) throws -> MTGRecognition {
    var stageMs = initialStageMs
    var startedAt = ProcessInfo.processInfo.systemUptime
    guard let turned = MTGCardRectifier.rotatedHalfTurn(uprightCandidate),
          let uprightSmall = MTGCardRectifier.resized(uprightCandidate, width: embedWidth, height: embedHeight),
          let turnedSmall = MTGCardRectifier.resized(turned, width: embedWidth, height: embedHeight)
    else { throw Failure.rectificationFailed }
    stageMs["resize"] = elapsed(since: &startedAt)
    let uprightVector = try MTGCardEmbedder.featurePrint(of: uprightSmall)
    let turnedVector = try MTGCardEmbedder.featurePrint(of: turnedSmall)
    stageMs["embed"] = elapsed(since: &startedAt)
    let uprightScores = catalog.similarities(to: uprightVector)
    let turnedScores = catalog.similarities(to: turnedVector)
    let uprightBest = uprightScores.max() ?? 0
    let turnedBest = turnedScores.max() ?? 0
    stageMs["search"] = elapsed(since: &startedAt)
    let isTurned: Bool
    let reading: MTGCollectorLine
    if abs(turnedBest - uprightBest) > orientationMargin {
      isTurned = turnedBest > uprightBest
      reading = MTGCollectorLineReader.read(card: isTurned ? turned : uprightCandidate, setCodes: catalog.setCodes)
      stageMs["read"] = reading.durationMs
    } else {
      let uprightReading = MTGCollectorLineReader.read(card: uprightCandidate, setCodes: catalog.setCodes)
      let turnedReading = MTGCollectorLineReader.read(card: turned, setCodes: catalog.setCodes)
      stageMs["read"] = uprightReading.durationMs + turnedReading.durationMs
      if uprightReading.strength != turnedReading.strength {
        isTurned = turnedReading.strength > uprightReading.strength
      } else {
        isTurned = turnedBest > uprightBest
      }
      reading = isTurned ? turnedReading : uprightReading
    }
    let scores = isTurned ? turnedScores : uprightScores
    let small = isTurned ? turnedSmall : uprightSmall
    let shortlist = catalog.top(shortlistSize, of: scores)
    if let cropOutput, let data = MTGCardRectifier.jpegData(small, quality: 0.9) {
      try data.write(to: cropOutput)
    }
    let topSimilarity = scores[shortlist[0]]
    var expanded = shortlist
    var included = Set(shortlist)
    for index in shortlist.prefix(illustrationExpansion) {
      guard let illustration = catalog.printings[index].illustrationId else { continue }
      for sibling in catalog.printingsByIllustration[illustration] ?? [] where !included.contains(sibling) {
        included.insert(sibling)
        expanded.append(sibling)
      }
    }
    expanded.sort { scores[$0] > scores[$1] }
    let (decision, first) = decide(
      ranked: expanded, scores: scores, topSimilarity: topSimilarity, reading: reading, catalog: catalog
    )
    var ordered = expanded
    if let first {
      ordered.removeAll { $0 == first }
      ordered.insert(first, at: 0)
    }
    let candidates = ordered.prefix(candidateCount).map { index -> MTGRecognitionCandidate in
      let printing = catalog.printings[index]
      return MTGRecognitionCandidate(
        scryfallId: printing.id,
        oracleId: printing.oracleId,
        name: printing.name,
        set: printing.set,
        collectorNumber: printing.collectorNumber,
        score: (Double(scores[index]) * 1000).rounded() / 1000
      )
    }
    return MTGRecognition(
      candidates: Array(candidates),
      decision: decision,
      reading: MTGRecognitionReading(
        setCode: reading.setCode,
        collectorNumber: reading.collectorNumber,
        premiumMark: reading.premiumMark,
        lines: reading.lines
      ),
      rotation: isTurned ? 180 : 0,
      topSimilarity: Double(topSimilarity),
      stageMs: stageMs
    )
  }

  static func decide(
    ranked: [Int],
    scores: [Float],
    topSimilarity: Float,
    reading: MTGCollectorLine,
    catalog: MTGCardCatalog
  ) -> (MTGRecognitionDecision, Int?) {
    func accept(_ index: Int, _ reason: String) -> (MTGRecognitionDecision, Int?) {
      (MTGRecognitionDecision(accepted: true, scryfallId: catalog.printings[index].id, reasons: [reason]), index)
    }
    func abstain(_ reason: String, first: Int? = nil) -> (MTGRecognitionDecision, Int?) {
      (MTGRecognitionDecision(accepted: false, scryfallId: nil, reasons: [reason]), first)
    }
    guard topSimilarity >= notACardSimilarity else {
      return abstain("not a card: best image similarity \(format(topSimilarity)) is below \(format(notACardSimilarity))")
    }
    let top = ranked[0]
    let topName = catalog.printings[top].oracleId
    let shortlistNames = Set(ranked.prefix(illustrationExpansion).map { catalog.printings[$0].oracleId })
    let readLabel = [reading.setCode?.uppercased(), reading.collectorNumber].compactMap { $0 }.joined(separator: " ")

    if let setCode = reading.setCode, let number = reading.collectorNumber,
       let read = catalog.index(set: setCode, collectorNumber: number) {
      if shortlistNames.contains(catalog.printings[read].oracleId) {
        return accept(read, "collector line \(readLabel) matches a card in the image shortlist")
      }
      return abstain("collector line \(readLabel) names a card the image does not support", first: read)
    }

    if let setCode = reading.setCode {
      let matches = ranked.filter {
        catalog.printings[$0].set == setCode && catalog.printings[$0].oracleId == topName
      }
      if matches.count == 1 {
        return accept(matches[0], "set \(setCode.uppercased()) leaves one printing of the top card")
      }
      if matches.count > 1 {
        return abstain("set \(setCode.uppercased()) leaves \(matches.count) printings of the top card", first: matches[0])
      }
    }

    let siblings = catalog.printings[top].illustrationId.flatMap { catalog.printingsByIllustration[$0] } ?? [top]
    if siblings.count > 1 {
      let note = readLabel.isEmpty ? "no collector line was read" : "collector line read only \(readLabel)"
      return abstain("\(siblings.count) printings share this art and \(note)")
    }
    let topIllustration = catalog.printings[top].illustrationId
    guard let rival = ranked.dropFirst().first(where: {
      topIllustration == nil || catalog.printings[$0].illustrationId != topIllustration
    }) else {
      return abstain("only printing of its art, but no other art was compared")
    }
    let margin = scores[top] - scores[rival]
    if margin < unreadArtMargin {
      return abstain("only printing of its art, but the next art is \(format(margin)) behind; at least \(format(unreadArtMargin)) is required")
    }
    return accept(top, "only printing of its art, next art \(format(margin)) behind")
  }

  private static func format(_ value: Float) -> String {
    String(format: "%.3f", value)
  }

  private static func elapsed(since startedAt: inout TimeInterval) -> Double {
    let now = ProcessInfo.processInfo.systemUptime
    defer { startedAt = now }
    return ((now - startedAt) * 1000 * 10).rounded() / 10
  }
}
