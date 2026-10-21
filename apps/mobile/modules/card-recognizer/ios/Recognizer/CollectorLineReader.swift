import CoreGraphics
import Foundation
import Vision

public struct CollectorLine: Sendable, Equatable {
  public var setCode: String?
  public var setTokens: [String] = []
  public var collectorNumber: String?
  public var numberBeforeRarity = false
  public var premiumMark = false
  public var lines: [String] = []
  public var durationMs = 0.0

  var strength: Int {
    (setCode == nil && setTokens.isEmpty ? 0 : 2) + (collectorNumber == nil ? 0 : 1)
  }

  public func setCode(among sets: Set<String>) -> String? {
    if let setCode { return setCode }
    let matches = setTokens.flatMap { token in
      sets.compactMap { set in SetCodeMatch.level(of: token, for: set).map { (level: $0, set: set) } }
    }
    guard let bestLevel = matches.map(\.level).min() else { return nil }
    let best = Set(matches.filter { $0.level == bestLevel }.map(\.set))
    return best.count == 1 ? best.first : nil
  }
}

enum SetCodeMatch {
  private static let lookAlikes: [Character: Character] = [
    "o": "0", "i": "1", "l": "1", "t": "1", "s": "5", "z": "2", "b": "8", "g": "6",
  ]

  static func level(of token: String, for set: String) -> Int? {
    if token == set { return 0 }
    let read = Array(token.map { lookAlikes[$0] ?? $0 })
    let code = Array(set.map { lookAlikes[$0] ?? $0 })
    if read == code { return 1 }
    if read.count >= 2, read.count == code.count - 1, Array(code.dropFirst()) == read { return 2 }
    if read.count >= 3, Array(read.dropLast()) == code { return 2 }
    if read.count >= 3, read.count == code.count, zip(read, code).filter({ $0 != $1 }).count == 1 { return 3 }
    return nil
  }
}

public enum CollectorLineReader {
  static let stripTop = 0.84
  static let minimumStripHeight = 300.0
  private static let separators = #"[•·.*★☆\-+#~%°]"#
  private static let setPattern = expression(#"([A-Z0-9]{3,5})\s*([•·.*★☆\-])\s*([A-Z]{2})\b"#)
  private static let englishPattern = expression(
    #"(?:^|[^A-Z0-9])([A-Z0-9]{1,5}(?: ?[A-Z0-9]{1,3})?)(?:\s*"# + separators + #"\s*[0-9]?|\s+[0-9]?)EN\b"#
  )
  private static let joinedEnglishPattern = expression(#"^\s*([A-Z0-9]{3})EN\b"#)
  private static let otherLanguagePattern = expression(
    #"(?:^|[^A-Z0-9])([A-Z0-9]{2,5}(?: ?[A-Z0-9]{1,3})?)\s*"# + separators + #"\s*(?:ES|FR|DE|IT|PT|JP|JA|KR|KO|RU|CS|CT|PH)\b"#
  )
  private static let fractionPattern = expression(#"\b(\d{1,4})\s*/\s*\d{2,3}(?!\d)"#)
  private static let rarityFirstPattern = expression(#"(?:^|\s)[CURMSLTP]\s*(\d{3,5})\b"#)
  private static let numberFirstPattern = expression(#"^\s*(\d{1,4})\s+[CURMSLTP]\s*$"#)
  private static let numberOnlyPattern = expression(#"^\s*(\d{1,4})\s*$"#)
  private static let premiumMarks: Set<String> = ["*", "★", "☆"]
  private static let cyrillicLookAlikes: [Character: Character] = [
    "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "К": "K", "М": "M", "О": "O", "Р": "P", "Т": "T", "Х": "X",
    "У": "Y", "І": "I", "Ѕ": "S", "а": "a", "в": "b", "с": "c", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o",
    "р": "p", "т": "t", "х": "x", "у": "y",
  ]

  private static func expression(_ pattern: String) -> NSRegularExpression {
    try! NSRegularExpression(pattern: pattern)
  }

  static func read(card: CGImage, setCodes: Set<String>) -> CollectorLine {
    let stripHeight = Double(card.height) * (1 - stripTop)
    let scale = max(1, (minimumStripHeight / stripHeight).rounded(.up))
    guard let strip = CardRectifier.cropped(card, top: stripTop, bottom: 1, scale: scale) else {
      return CollectorLine()
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let startedAt = ProcessInfo.processInfo.systemUptime
    try? VNImageRequestHandler(cgImage: strip, options: [:]).perform([request])
    let durationMs = (ProcessInfo.processInfo.systemUptime - startedAt) * 1000
    let observations = (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    var result = parse(lines: lines, setCodes: setCodes)
    result.durationMs = durationMs
    return result
  }

  public static func parse(lines: [String], setCodes: Set<String>) -> CollectorLine {
    var result = CollectorLine(lines: lines)
    let latinLines = lines.map { String($0.map { cyrillicLookAlikes[$0] ?? $0 }) }
    var languageLines = Set<Int>()
    for (index, line) in latinLines.enumerated() {
      let upper = line.uppercased()
      for (code, premium) in setPatternMatches(in: upper) {
        if setCodes.contains(code) {
          result.setCode = code
          result.premiumMark = premium
        } else if result.setCode == nil {
          result.premiumMark = premium
        }
      }
      let tokens = languageLineTokens(in: line)
      if !tokens.isEmpty { languageLines.insert(index) }
      result.setTokens += tokens.filter { !result.setTokens.contains($0) }
    }
    let patterns: [(NSRegularExpression, Bool)] = [
      (fractionPattern, true),
      (rarityFirstPattern, false),
      (numberFirstPattern, false),
      (numberOnlyPattern, false),
    ]
    for (pattern, allowedOnCopyright) in patterns {
      for (index, line) in latinLines.enumerated() where !languageLines.contains(index) {
        let range = NSRange(line.startIndex..., in: line)
        let isCopyright = line.range(of: #"wiz|coast|™|©"#, options: [.regularExpression, .caseInsensitive]) != nil
        guard allowedOnCopyright || !isCopyright,
              let match = pattern.firstMatch(in: line, range: range),
              let numberRange = Range(match.range(at: 1), in: line)
        else { continue }
        result.collectorNumber = Gallery.withoutLeadingZeros(String(line[numberRange]))
        result.numberBeforeRarity = pattern === numberFirstPattern
        return result
      }
    }
    return result
  }

  private static func setPatternMatches(in upper: String) -> [(code: String, premium: Bool)] {
    setPattern.matches(in: upper, range: NSRange(upper.startIndex..., in: upper)).compactMap { match in
      guard let codeRange = Range(match.range(at: 1), in: upper),
            let markRange = Range(match.range(at: 2), in: upper)
      else { return nil }
      return (upper[codeRange].lowercased(), premiumMarks.contains(String(upper[markRange])))
    }
  }

  private static func languageLineTokens(in line: String) -> [String] {
    let upper = line.uppercased()
    let matches = [englishPattern, otherLanguagePattern].map { (pattern: $0, text: upper) }
      + [(pattern: joinedEnglishPattern, text: line)]
    return matches.flatMap { pattern, text in
      pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
        guard let tokenRange = Range(match.range(at: 1), in: text) else { return nil }
        let token = text[tokenRange].filter { $0 != " " }.lowercased()
        return token.count >= 2 ? String(token.suffix(5)) : nil
      }
    }
  }
}
