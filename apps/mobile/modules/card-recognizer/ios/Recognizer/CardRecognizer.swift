import CoreGraphics
import CoreImage
import Foundation

public enum CardRecognizer {
  public static let embedWidth = 488
  public static let embedHeight = 680
  public static let readWidth = 1191
  public static let readHeight = 1664
  static let shortlistSize = 50
  static let illustrationExpansion = 10
  static let notACardSimilarity: Float = 0.5
  static let unreadArtMargin: Float = 0.03
  static let orientationMargin: Float = 0.03
  static let fullReadingStrength = 3
  static let titleCandidates = 10
  static let machineReadableFrame = "2015"
  static let listSet = "plst"
  static let artCheckDepth = 5
  static let candidateCount = 5

  public static func recognize(
    photo: URL,
    outline: CardOutline,
    gallery: Gallery,
    excluded: Set<Int> = []
  ) throws(RecognitionFailure) -> Recognition {
    var startedAt = ProcessInfo.processInfo.systemUptime
    let card = try CardRectifier.rectifiedCard(photo: photo, outline: outline)
    let stageMs = ["rectify": elapsed(since: &startedAt)]
    return try recognize(card: card, gallery: gallery, stageMs: stageMs, excluded: excluded)
  }

  public static func recognize(
    card uprightCandidate: CGImage,
    gallery: Gallery,
    stageMs initialStageMs: [String: Double] = [:],
    excluded: Set<Int> = []
  ) throws(RecognitionFailure) -> Recognition {
    var stageMs = initialStageMs
    var startedAt = ProcessInfo.processInfo.systemUptime
    guard let turned = CardRectifier.rotatedHalfTurn(uprightCandidate),
          let uprightSmall = CardRectifier.resized(uprightCandidate, width: embedWidth, height: embedHeight),
          let turnedSmall = CardRectifier.resized(turned, width: embedWidth, height: embedHeight)
    else { throw .rectificationFailed }
    stageMs["resize"] = elapsed(since: &startedAt)
    let uprightVector: [Float]
    let turnedVector: [Float]
    do {
      uprightVector = try FeaturePrint.vector(of: uprightSmall)
      turnedVector = try FeaturePrint.vector(of: turnedSmall)
    } catch {
      throw .unreadablePhoto
    }
    stageMs["embed"] = elapsed(since: &startedAt)
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
    let confident = abs(turnedBest - uprightBest) > orientationMargin
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
    guard topSimilarity >= notACardSimilarity else {
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
    let (decision, decided) = decide(
      ranked: expanded, scores: scores, reading: reading, gallery: gallery, excluded: excluded
    )
    let first = decided ?? expanded[0]
    let twins = sameTextTwins(of: first, gallery: gallery).filter { !excluded.contains($0) }
    let leading = [first] + twins
    let ordered = leading + expanded.filter { !leading.contains($0) }
    let candidates = ordered.prefix(max(candidateCount, leading.count + 1)).map { index in
      let printing = gallery.printings[index]
      return RecognitionCandidate(
        printingId: printing.id,
        oracleId: printing.oracleId,
        name: printing.name,
        setCode: printing.set,
        collectorNumber: printing.collectorNumber,
        similarity: (Double(scores[index]) * 1000).rounded() / 1000
      )
    }
    return .card(CardRecognition(
      candidates: Array(candidates),
      decision: decision,
      reading: CollectorLineReading(
        setCode: reading.setCode,
        collectorNumber: reading.collectorNumber,
        premiumMark: reading.premiumMark
      ),
      sameTextTwinCount: twins.count,
      topSimilarity: Double(topSimilarity),
      rotation: isTurned ? 180 : 0,
      stageMs: stageMs
    ))
  }

  static func decide(
    ranked: [Int],
    scores: [Float],
    reading: CollectorLine,
    gallery: Gallery,
    excluded: Set<Int>
  ) -> (RecognitionDecision, Int?) {
    func accept(_ index: Int, _ reasons: String...) -> (RecognitionDecision, Int?) {
      (RecognitionDecision(accepted: true, reasons: reasons), index)
    }
    func abstain(_ reason: String, first: Int? = nil) -> (RecognitionDecision, Int?) {
      (RecognitionDecision(accepted: false, reasons: [reason]), first)
    }
    let top = ranked[0]
    let topName = gallery.printings[top].oracleId
    let shortlistNames = Set(ranked.prefix(illustrationExpansion).map { gallery.printings[$0].oracleId })
    let setCode = reading.setCode ?? reading.setToken.flatMap { token in
      let nearby = Set(ranked.compactMap { index -> String? in
        let printing = gallery.printings[index]
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
      guard let read = gallery.index(set: setCode, collectorNumber: number), !excluded.contains(read) else {
        return abstain("collector line \(readLabel) names no printing in the gallery")
      }
      let imageArts = Set(ranked.prefix(artCheckDepth).compactMap { gallery.printings[$0].illustrationId })
      if shortlistNames.contains(gallery.printings[read].oracleId),
         let readArt = gallery.printings[read].illustrationId, !imageArts.contains(readArt) {
        return abstain("collector line \(readLabel) names a printing whose art the image does not match", first: ranked[0])
      }
      if shortlistNames.contains(gallery.printings[read].oracleId) {
        let twins = sameTextTwins(of: read, gallery: gallery).filter { !excluded.contains($0) }
        let reason = "collector line \(readLabel) matches a card in the image shortlist"
        guard !twins.isEmpty else { return accept(read, reason) }
        let names = twins.prefix(3).map {
          "\(gallery.printings[$0].set.uppercased()) \(gallery.printings[$0].collectorNumber)"
        }.joined(separator: ", ")
        return accept(read, reason, "\(twins.count) same-text twins print the same collector line: \(names)")
      }
      return abstain("collector line \(readLabel) names a card the image does not support", first: read)
    }

    func contradicts(_ index: Int) -> Bool {
      let printing = gallery.printings[index]
      if let setCode, printing.set != setCode { return true }
      if let number = reading.collectorNumber,
         Gallery.key(set: printing.set, collectorNumber: printing.collectorNumber)
           != Gallery.key(set: printing.set, collectorNumber: number) {
        return true
      }
      return false
    }

    if let setCode {
      let matches = ranked.filter {
        gallery.printings[$0].set == setCode && gallery.printings[$0].oracleId == topName
      }
      if matches.count == 1 {
        return accept(matches[0], "set \(setCode.uppercased()) leaves one printing of the top card")
      }
      if matches.count > 1 {
        return abstain("set \(setCode.uppercased()) leaves \(matches.count) printings of the top card", first: matches[0])
      }
    }

    let siblings = (gallery.printings[top].illustrationId.flatMap { gallery.printingsByIllustration[$0] } ?? [top])
      .filter { !excluded.contains($0) }
    if siblings.count > 1 {
      let note = readLabel.isEmpty ? "no collector line was read" : "collector line read only \(readLabel)"
      return abstain("\(siblings.count) printings share this art and \(note)")
    }
    let topIllustration = gallery.printings[top].illustrationId
    guard let rival = ranked.dropFirst().first(where: {
      topIllustration == nil || gallery.printings[$0].illustrationId != topIllustration
    }) else {
      return abstain("only printing of its art, but no other art was compared")
    }
    if contradicts(top) {
      return abstain("only printing of its art, but collector line \(readLabel) does not match it")
    }
    if gallery.printings[top].frame == machineReadableFrame && readLabel.isEmpty {
      return abstain("only printing of its art, but its collector line was not read")
    }
    let margin = scores[top] - scores[rival]
    if margin < unreadArtMargin {
      return abstain("only printing of its art, but the next art is \(format(margin)) behind; at least \(format(unreadArtMargin)) is required")
    }
    return accept(top, "only printing of its art, next art \(format(margin)) behind")
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

  public static func titleKey(_ text: String) -> String {
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
