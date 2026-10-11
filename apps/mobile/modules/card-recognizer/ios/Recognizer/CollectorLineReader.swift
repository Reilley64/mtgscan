import CoreGraphics
import Foundation
import Vision

public struct CollectorLine: Sendable, Equatable {
  public var setCode: String?
  public var setToken: String?
  public var collectorNumber: String?
  public var premiumMark = false
  public var lines: [String] = []
  public var durationMs = 0.0

  var strength: Int {
    (setCode == nil ? 0 : 2) + (collectorNumber == nil ? 0 : 1)
  }
}

public enum CollectorLineReader {
  static let stripTop = 0.84
  static let minimumStripHeight = 300.0
  private static let setPattern = expression(#"([A-Z0-9]{3,5})\s*([•·.*★☆\-])\s*([A-Z]{2})\b"#)
  private static let fractionPattern = expression(#"\b(\d{1,4})\s*/\s*\d{2,3}(?!\d)"#)
  private static let rarityFirstPattern = expression(#"(?:^|\s)[CURMSLTP]\s*(\d{3,5})\b"#)
  private static let numberFirstPattern = expression(#"^\s*(\d{1,4})\s+[CURMSLTP]\s*$"#)
  private static let numberOnlyPattern = expression(#"^\s*(\d{1,4})\s*$"#)
  private static let premiumMarks: Set<String> = ["*", "★", "☆"]

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
    request.customWords = setCodes.map { $0.uppercased() }
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
    for line in lines {
      let upper = line.uppercased()
      let range = NSRange(upper.startIndex..., in: upper)
      for match in setPattern.matches(in: upper, range: range) {
        guard let codeRange = Range(match.range(at: 1), in: upper),
              let markRange = Range(match.range(at: 2), in: upper)
        else { continue }
        let code = upper[codeRange].lowercased()
        let premium = premiumMarks.contains(String(upper[markRange]))
        if setCodes.contains(code) {
          result.setCode = code
          result.setToken = code
          result.premiumMark = premium
        } else if result.setCode == nil {
          result.setToken = code
          result.premiumMark = premium
        }
      }
    }
    let patterns: [(NSRegularExpression, Bool)] = [
      (fractionPattern, true),
      (rarityFirstPattern, false),
      (numberFirstPattern, false),
      (numberOnlyPattern, false),
    ]
    for (pattern, allowedOnCopyright) in patterns {
      for line in lines {
        let range = NSRange(line.startIndex..., in: line)
        let isCopyright = line.range(of: #"wiz|coast|™|©"#, options: [.regularExpression, .caseInsensitive]) != nil
        guard allowedOnCopyright || !isCopyright,
              let match = pattern.firstMatch(in: line, range: range),
              let numberRange = Range(match.range(at: 1), in: line)
        else { continue }
        result.collectorNumber = Gallery.withoutLeadingZeros(String(line[numberRange]))
        return result
      }
    }
    return result
  }
}
