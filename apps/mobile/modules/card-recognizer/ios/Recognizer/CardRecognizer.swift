import CoreGraphics
import CoreImage
import Foundation

public enum CardRecognizer {
  public static let readWidth = 1191
  public static let readHeight = 1664
  static let smallWidth = 488
  static let smallHeight = 680
  static let shortlistSize = 50
  static let illustrationExpansion = 10
  static let fullReadingStrength = 3
  static let titleCandidates = 10
  static let machineReadableFrame = "2015"
  static let framesWithoutSetCode: Set<String> = ["1993", "1997", "2003"]
  static let listSet = "plst"
  static let artCheckDepth = 5
  static let candidateCount = 5

  public static func recognize(
    photo: URL,
    outline: CardOutline,
    gallery: Gallery,
    excluded: Set<Int> = [],
    trainingCropDirectory: URL? = nil
  ) throws(RecognitionFailure) -> Recognition {
    var startedAt = ProcessInfo.processInfo.systemUptime
    let card = try CardRectifier.rectifiedCard(photo: photo, outline: outline)
    let stageMs = ["rectify": elapsed(since: &startedAt)]
    return try recognize(card: card, gallery: gallery, stageMs: stageMs, excluded: excluded, trainingCropDirectory: trainingCropDirectory)
  }

  public static func recognize(
    card uprightCandidate: CGImage,
    gallery: Gallery,
    stageMs initialStageMs: [String: Double] = [:],
    excluded: Set<Int> = [],
    trainingCropDirectory: URL? = nil
  ) throws(RecognitionFailure) -> Recognition {
    var stageMs = initialStageMs
    var startedAt = ProcessInfo.processInfo.systemUptime
    guard let turned = CardRectifier.rotatedHalfTurn(uprightCandidate),
          let uprightSmall = small(uprightCandidate),
          let turnedSmall = small(turned)
    else { throw .rectificationFailed }
    stageMs["resize"] = elapsed(since: &startedAt)
    let uprightVector: [Float]
    let turnedVector: [Float]
    do {
      uprightVector = try gallery.compiledModel.featurePrint(of: uprightSmall)
      turnedVector = try gallery.compiledModel.featurePrint(of: turnedSmall)
    } catch {
      throw .unreadablePhoto
    }
    guard uprightVector.count == gallery.dimension, turnedVector.count == gallery.dimension else { throw .unreadablePhoto }
    stageMs["featurePrint"] = elapsed(since: &startedAt)
    var bothScores = gallery.similarities(to: [uprightVector, turnedVector])
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
      (gallery.top(titleCandidates, of: uprightScores) + gallery.top(titleCandidates, of: turnedScores))
        .map { titleKey(gallery.printings[$0].name) }
        .filter { !$0.isEmpty }
    )
    func evidence(_ candidate: CollectorLine) -> Int {
      candidate.lines.contains { line in
        let key = titleKey(line)
        return !key.isEmpty && titles.contains(key)
      } ? -1 : candidate.strength
    }
    let preferTurned = turnedBest > uprightBest
    let confident = abs(turnedBest - uprightBest) > gallery.thresholds.orientationMargin
    let preferred = CollectorLineReader.read(card: preferTurned ? turned : uprightCandidate, setCodes: gallery.setCodes)
    var isTurned = preferTurned
    var reading = preferred
    var readMs = preferred.durationMs
    if !(confident && evidence(preferred) == fullReadingStrength) {
      let other = CollectorLineReader.read(card: preferTurned ? uprightCandidate : turned, setCodes: gallery.setCodes)
      readMs += other.durationMs
      if evidence(other) > evidence(preferred) {
        isTurned = !preferTurned
        reading = other
      }
    }
    if evidence(reading) < 0 {
      reading = CollectorLine(lines: reading.lines, durationMs: reading.durationMs)
    }
    stageMs["read"] = readMs
    let scores = isTurned ? turnedScores : uprightScores
    let shortlist = gallery.top(shortlistSize, of: scores)
    let topSimilarity = scores[shortlist[0]]
    guard topSimilarity >= gallery.thresholds.notACard else {
      return .notACard(NotACardRecognition(topSimilarity: Double(topSimilarity), stageMs: stageMs))
    }
    var expanded = shortlist
    var included = Set(shortlist).union(excluded)
    for index in shortlist.prefix(illustrationExpansion) {
      guard let illustration = gallery.printings[index].illustrationId else { continue }
      for sibling in gallery.printingsByIllustration[illustration] ?? [] where !included.contains(sibling) {
        included.insert(sibling)
        expanded.append(sibling)
      }
    }
    expanded.sort { scores[$0] > scores[$1] }
    let choice = choose(ranked: expanded, scores: scores, reading: reading, gallery: gallery, excluded: excluded)
    let trainingCrop = trainingCropDirectory.flatMap { TrainingCrop.write(isTurned ? turnedSmall : uprightSmall, in: $0) }
    return .card(CardRecognition(
      candidates: choice.candidates.map { RecognitionCandidate(printing: gallery.printings[$0]) },
      decision: choice.decision,
      reading: CollectorLineReading(
        setCode: reading.setCode,
        collectorNumber: reading.collectorNumber,
        premiumMark: reading.premiumMark
      ),
      sameTextTwinCount: choice.sameTextTwinCount,
      topSimilarity: Double(topSimilarity),
      artMargin: choice.artMargin.map(Double.init),
      rotation: isTurned ? 180 : 0,
      trainingCrop: trainingCrop?.absoluteString,
      stageMs: stageMs
    ))
  }

  static func small(_ card: CGImage) -> CGImage? {
    CardRectifier.resized(card, width: smallWidth, height: smallHeight)
  }

  static func choose(
    ranked: [Int],
    scores: [Float],
    reading: CollectorLine,
    gallery: Gallery,
    excluded: Set<Int>
  ) -> (decision: RecognitionDecision, candidates: [Int], sameTextTwinCount: Int, artMargin: Float?) {
    let (decision, shownFirst) = decide(ranked: ranked, scores: scores, reading: reading, gallery: gallery, excluded: excluded)
    let first = shownFirst.first ?? ranked[0]
    let twins = sameTextTwins(of: first, gallery: gallery).filter { !excluded.contains($0) }
    var leading = [first] + twins
    leading += shownFirst.dropFirst().filter { !leading.contains($0) }
    let ordered = leading + ranked.filter { !leading.contains($0) }
    return (
      decision,
      Array(ordered.prefix(max(candidateCount, leading.count + 1))),
      twins.count,
      artMargin(ranked: ranked, scores: scores, gallery: gallery)
    )
  }

  static func artMargin(ranked: [Int], scores: [Float], gallery: Gallery) -> Float? {
    let top = ranked[0]
    let topIllustration = gallery.printings[top].illustrationId
    guard let rival = ranked.dropFirst().first(where: {
      topIllustration == nil || gallery.printings[$0].illustrationId != topIllustration
    }) else { return nil }
    return scores[top] - scores[rival]
  }

  static func decide(
    ranked: [Int],
    scores: [Float],
    reading: CollectorLine,
    gallery: Gallery,
    excluded: Set<Int>
  ) -> (RecognitionDecision, [Int]) {
    func accept(_ index: Int, _ basis: DecisionBasis, _ reasons: String...) -> (RecognitionDecision, [Int]) {
      (RecognitionDecision(basis: basis, reasons: reasons), [index])
    }
    func abstain(_ reasons: String..., shownFirst: [Int] = []) -> (RecognitionDecision, [Int]) {
      (RecognitionDecision(basis: nil, reasons: reasons), shownFirst)
    }
    let top = ranked[0]
    let topOracleId = gallery.printings[top].oracleId
    let shortlistOracleIds = Set(ranked.prefix(illustrationExpansion).map { gallery.printings[$0].oracleId })
    let imageArts = Set(ranked.prefix(artCheckDepth).compactMap { gallery.printings[$0].illustrationId })
    let setCode = reading.setCode(among: Set(ranked.compactMap { index in
      shortlistOracleIds.contains(gallery.printings[index].oracleId) ? gallery.printings[index].set : nil
    }))
    var collectorNumber = reading.collectorNumber
    if reading.numberBeforeRarity, let setCode, let number = collectorNumber,
       let read = gallery.index(set: setCode, collectorNumber: number), !excluded.contains(read),
       !(shortlistOracleIds.contains(gallery.printings[read].oracleId)
         && gallery.printings[read].illustrationId.map(imageArts.contains) == true) {
      collectorNumber = nil
    }
    let readLabel = [setCode?.uppercased(), collectorNumber].compactMap { $0 }.joined(separator: " ")

    if let setCode, let number = collectorNumber {
      guard let read = gallery.index(set: setCode, collectorNumber: number), !excluded.contains(read) else {
        return abstain("collector line \(readLabel) names no printing in the gallery")
      }
      if shortlistOracleIds.contains(gallery.printings[read].oracleId),
         let readArt = gallery.printings[read].illustrationId, !imageArts.contains(readArt) {
        return abstain("collector line \(readLabel) names a printing whose art the image does not match", shownFirst: [ranked[0]])
      }
      if shortlistOracleIds.contains(gallery.printings[read].oracleId) {
        let twins = sameTextTwins(of: read, gallery: gallery).filter { !excluded.contains($0) }
        let reason = "collector line \(readLabel) matches a card in the image shortlist"
        guard !twins.isEmpty else { return accept(read, .collectorLine, reason) }
        let names = twins.prefix(3).map {
          "\(gallery.printings[$0].set.uppercased()) \(gallery.printings[$0].collectorNumber)"
        }.joined(separator: ", ")
        return accept(read, .collectorLine, reason, "\(twins.count) same-text twins print the same collector line: \(names)")
      }
      let unsupportedReason = "collector line \(readLabel) names a card the image does not support"
      let nearby = ranked.filter { index in
        let printing = gallery.printings[index]
        return printing.set == setCode
          && printing.illustrationId.map(imageArts.contains) == true
          && oneCharacterApart(
            Gallery.key(set: setCode, collectorNumber: printing.collectorNumber),
            Gallery.key(set: setCode, collectorNumber: number)
          )
      }
      guard nearby.count == 1 else { return abstain(unsupportedReason, shownFirst: [ranked[0], read]) }
      let near = gallery.printings[nearby[0]]
      return abstain(
        unsupportedReason,
        "\(near.set.uppercased()) \(near.collectorNumber) has the art of a top image candidate and is one character from the collector line",
        shownFirst: [nearby[0], read]
      )
    }

    func contradicts(_ index: Int) -> Bool {
      let printing = gallery.printings[index]
      if let setCode, printing.set != setCode { return true }
      if let number = collectorNumber,
         Gallery.key(set: printing.set, collectorNumber: printing.collectorNumber)
           != Gallery.key(set: printing.set, collectorNumber: number) {
        return true
      }
      return false
    }

    if let setCode {
      let matches = ranked.filter {
        gallery.printings[$0].set == setCode && gallery.printings[$0].oracleId == topOracleId
      }
      if matches.count == 1 {
        let reason = "set \(setCode.uppercased()) leaves one printing of the top card"
        let printingsInSet = (gallery.printingsByOracle[topOracleId] ?? []).filter { gallery.printings[$0].set == setCode }.count
        if printingsInSet > 1 {
          return abstain(
            "set \(setCode.uppercased()) has \(printingsInSet) printings of the top card and no collector number was read",
            shownFirst: matches
          )
        }
        if let rival = ranked.dropFirst().first(where: { gallery.printings[$0].oracleId != topOracleId }),
           scores[top] - scores[rival] < gallery.thresholds.artMargin {
          let required = format(gallery.thresholds.artMargin)
          return abstain(
            "\(reason), but the next card is \(format(scores[top] - scores[rival])) behind; at least \(required) is required",
            shownFirst: matches
          )
        }
        return accept(matches[0], .setCode, reason)
      }
      if matches.count > 1 {
        return abstain("set \(setCode.uppercased()) leaves \(matches.count) printings of the top card", shownFirst: [matches[0]])
      }
    }

    let siblings = (gallery.printings[top].illustrationId.flatMap { gallery.printingsByIllustration[$0] } ?? [top])
      .filter { !excluded.contains($0) }
    if siblings.count > 1 {
      let note = readLabel.isEmpty ? "no collector line was read" : "collector line read only \(readLabel)"
      let reason = "\(siblings.count) printings share this art and \(note)"
      guard setCode == nil, let number = collectorNumber else { return abstain(reason) }
      let numbered = ranked.filter { index in
        let printing = gallery.printings[index]
        return printing.oracleId == topOracleId
          && printing.illustrationId.map(imageArts.contains) == true
          && Gallery.key(set: printing.set, collectorNumber: printing.collectorNumber)
            == Gallery.key(set: printing.set, collectorNumber: number)
      }
      guard numbered.count == 1 else { return abstain(reason) }
      let printing = gallery.printings[numbered[0]]
      return abstain(
        reason,
        "\(printing.set.uppercased()) \(printing.collectorNumber) is the only printing of the top card with that collector number",
        shownFirst: numbered
      )
    }
    guard let margin = artMargin(ranked: ranked, scores: scores, gallery: gallery) else {
      return abstain("only printing of its art, but no other art was compared")
    }
    if contradicts(top) {
      return abstain("only printing of its art, but collector line \(readLabel) does not match it")
    }
    if gallery.printings[top].frame == machineReadableFrame && readLabel.isEmpty {
      return abstain("only printing of its art, but its collector line was not read")
    }
    if margin < gallery.thresholds.artMargin {
      let required = format(gallery.thresholds.artMargin)
      return abstain("only printing of its art, but the next art is \(format(margin)) behind; at least \(required) is required")
    }
    if framesWithoutSetCode.contains(gallery.printings[top].frame), reading.setCode != nil || !reading.setTokens.isEmpty {
      return abstain("only printing of its art, but a set code was read and its frame prints none")
    }
    return accept(top, .uniqueArt, "only printing of its art, next art \(format(margin)) behind")
  }

  static func oneCharacterApart(_ text: String, _ other: String) -> Bool {
    text.count == other.count && zip(text, other).filter { $0 != $1 }.count <= 1
  }

  public static func sameTextTwins(of index: Int, gallery: Gallery) -> [Int] {
    let printing = gallery.printings[index]
    guard let illustration = printing.illustrationId else { return [] }
    func digits(_ number: String) -> String {
      let leading = number.prefix { $0.isNumber }
      return leading.isEmpty ? number.lowercased() : String(leading.drop { $0 == "0" })
    }
    let number = digits(printing.collectorNumber)
    let listNumber = "\(printing.set.uppercased())-\(number)"
    return (gallery.printingsByIllustration[illustration] ?? []).filter { sibling in
      let other = gallery.printings[sibling]
      guard sibling != index else { return false }
      if other.set == listSet { return other.collectorNumber.uppercased() == listNumber }
      return digits(other.collectorNumber) == number
        && (other.set == printing.set || other.set == "p" + printing.set || "p" + other.set == printing.set)
    }
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
