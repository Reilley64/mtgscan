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
  static let fullReadingStrength = 3
  static let titleCandidates = 10
  static let machineReadableFrame = "2015"
  static let candidateCount = 5

  enum Failure: Error {
    case unreadableImage
    case rectificationFailed
  }

  static func recognize(
    photo: URL,
    quad: MTGCardQuad,
    catalog: MTGCardCatalog,
    cropOutput: URL?,
    excluded: Set<Int> = []
  ) throws -> MTGRecognition {
    var stageMs: [String: Double] = [:]
    var startedAt = ProcessInfo.processInfo.systemUptime
    guard let image = MTGCardRectifier.loadOrientedImage(at: photo) else { throw Failure.unreadableImage }
    guard let card = MTGCardRectifier.rectify(
      image,
      normalizedQuad: quad.portraitOrdered(imageWidth: image.extent.width, imageHeight: image.extent.height),
      width: readWidth,
      height: readHeight
    ) else { throw Failure.rectificationFailed }
    stageMs["rectify"] = elapsed(since: &startedAt)
    return try recognize(card: card, catalog: catalog, cropOutput: cropOutput, stageMs: stageMs, excluded: excluded)
  }

  static func recognize(
    crop: URL,
    catalog: MTGCardCatalog,
    cropOutput: URL?,
    excluded: Set<Int> = []
  ) throws -> MTGRecognition {
    guard let image = MTGCardRectifier.loadOrientedImage(at: crop),
          let card = MTGCardRectifier.context.createCGImage(image, from: image.extent)
    else { throw Failure.unreadableImage }
    return try recognize(card: card, catalog: catalog, cropOutput: cropOutput, stageMs: [:], excluded: excluded)
  }

  static func recognize(
    card uprightCandidate: CGImage,
    catalog: MTGCardCatalog,
    cropOutput: URL?,
    stageMs initialStageMs: [String: Double],
    excluded: Set<Int> = []
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
    var bothScores = catalog.similarities(to: [uprightVector, turnedVector])
    for index in excluded {
      bothScores[0][index] = -1
      bothScores[1][index] = -1
    }
    let uprightScores = bothScores[0]
    let turnedScores = bothScores[1]
    let uprightBest = uprightScores.max() ?? 0
    let turnedBest = turnedScores.max() ?? 0
    stageMs["search"] = elapsed(since: &startedAt)
    let titles = Set(
      (catalog.top(titleCandidates, of: uprightScores) + catalog.top(titleCandidates, of: turnedScores))
        .map { titleKey(catalog.printings[$0].name) }
        .filter { !$0.isEmpty }
    )
    func evidence(_ candidate: MTGCollectorLine) -> Int {
      candidate.lines.contains { line in
        let key = titleKey(line)
        return !key.isEmpty && titles.contains(key)
      } ? -1 : candidate.strength
    }
    let preferTurned = turnedBest > uprightBest
    let confident = abs(turnedBest - uprightBest) > orientationMargin
    let preferred = MTGCollectorLineReader.read(card: preferTurned ? turned : uprightCandidate, setCodes: catalog.setCodes)
    var isTurned = preferTurned
    var reading = preferred
    var readMs = preferred.durationMs
    if !(confident && evidence(preferred) == fullReadingStrength) {
      let other = MTGCollectorLineReader.read(card: preferTurned ? uprightCandidate : turned, setCodes: catalog.setCodes)
      readMs += other.durationMs
      if evidence(other) > evidence(preferred) {
        isTurned = !preferTurned
        reading = other
      }
    }
    if evidence(reading) < 0 {
      reading = MTGCollectorLine(lines: reading.lines, durationMs: reading.durationMs)
    }
    stageMs["read"] = readMs
    let scores = isTurned ? turnedScores : uprightScores
    let small = isTurned ? turnedSmall : uprightSmall
    let shortlist = catalog.top(shortlistSize, of: scores)
    if let cropOutput, let data = MTGCardRectifier.jpegData(small, quality: 0.9) {
      try data.write(to: cropOutput)
    }
    let topSimilarity = scores[shortlist[0]]
    var expanded = shortlist
    var included = Set(shortlist).union(excluded)
    for index in shortlist.prefix(illustrationExpansion) {
      guard let illustration = catalog.printings[index].illustrationId else { continue }
      for sibling in catalog.printingsByIllustration[illustration] ?? [] where !included.contains(sibling) {
        included.insert(sibling)
        expanded.append(sibling)
      }
    }
    expanded.sort { scores[$0] > scores[$1] }
    let (decision, first) = decide(
      ranked: expanded, scores: scores, topSimilarity: topSimilarity, reading: reading, catalog: catalog,
      excluded: excluded
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
    catalog: MTGCardCatalog,
    excluded: Set<Int> = []
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
    let setCode = reading.setCode ?? reading.setToken.flatMap { token in
      let nearby = Set(ranked.compactMap { index -> String? in
        let printing = catalog.printings[index]
        guard shortlistNames.contains(printing.oracleId),
              printing.set.count == token.count,
              zip(printing.set, token).filter({ $0 != $1 }).count <= 1
        else { return nil }
        return printing.set
      })
      return nearby.count == 1 ? nearby.first : nil
    }
    let readLabel = [setCode?.uppercased(), reading.collectorNumber].compactMap { $0 }.joined(separator: " ")

    if let setCode, let number = reading.collectorNumber {
      guard let read = catalog.index(set: setCode, collectorNumber: number), !excluded.contains(read) else {
        return abstain("collector line \(readLabel) names no printing in the catalog")
      }
      if shortlistNames.contains(catalog.printings[read].oracleId) {
        return accept(read, "collector line \(readLabel) matches a card in the image shortlist")
      }
      return abstain("collector line \(readLabel) names a card the image does not support", first: read)
    }

    func contradicts(_ index: Int) -> Bool {
      let printing = catalog.printings[index]
      if let setCode, printing.set != setCode { return true }
      if let number = reading.collectorNumber,
         MTGCardCatalog.key(set: printing.set, collectorNumber: printing.collectorNumber)
           != MTGCardCatalog.key(set: printing.set, collectorNumber: number) {
        return true
      }
      return false
    }

    if let setCode {
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

    let siblings = (catalog.printings[top].illustrationId.flatMap { catalog.printingsByIllustration[$0] } ?? [top])
      .filter { !excluded.contains($0) }
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
    if contradicts(top) {
      return abstain("only printing of its art, but collector line \(readLabel) does not match it")
    }
    if catalog.printings[top].frame == machineReadableFrame && readLabel.isEmpty {
      return abstain("only printing of its art, but its collector line was not read")
    }
    let margin = scores[top] - scores[rival]
    if margin < unreadArtMargin {
      return abstain("only printing of its art, but the next art is \(format(margin)) behind; at least \(format(unreadArtMargin)) is required")
    }
    return accept(top, "only printing of its art, next art \(format(margin)) behind")
  }

  static func titleKey(_ text: String) -> String {
    let front = text.components(separatedBy: " // ").first ?? text
    let letters = front.lowercased().filter { $0.isLetter }
    return letters.count >= 4 ? letters : ""
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
