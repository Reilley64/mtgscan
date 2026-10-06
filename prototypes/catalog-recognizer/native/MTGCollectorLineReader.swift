import CoreGraphics
import Foundation
import Vision

struct MTGCollectorLine {
  var setCode: String?
  var collectorNumber: String?
  var premiumMark = false
  var lines: [String] = []
  var durationMs = 0.0

  var strength: Int {
    (setCode == nil ? 0 : 2) + (collectorNumber == nil ? 0 : 1)
  }
}

enum MTGCollectorLineReader {
  static let stripTop = 0.84
  static let minimumStripHeight = 300.0

  static func read(card: CGImage, setCodes: Set<String>) -> MTGCollectorLine {
    let stripHeight = Double(card.height) * (1 - stripTop)
    let scale = max(1, (minimumStripHeight / stripHeight).rounded(.up))
    guard let strip = MTGCardRectifier.cropped(card, top: stripTop, bottom: 1, scale: scale) else {
      return MTGCollectorLine()
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

  static func parse(lines: [String], setCodes: Set<String>) -> MTGCollectorLine {
    var result = MTGCollectorLine(lines: lines)
    let setPattern = try! NSRegularExpression(pattern: #"([A-Z0-9]{3,5})\s*([•·.*★☆\-])\s*([A-Z]{2})\b"#)
    let fractionPattern = try! NSRegularExpression(pattern: #"\b(\d{1,4})\s*/\s*\d{2,4}\b"#)
    let rarityPattern = try! NSRegularExpression(pattern: #"(?:^|\s)[CURMSLTP]\s*(\d{3,5})\b"#)
    for line in lines {
      let upper = line.uppercased()
      let range = NSRange(upper.startIndex..., in: upper)
      for match in setPattern.matches(in: upper, range: range) {
        guard let codeRange = Range(match.range(at: 1), in: upper),
              let markRange = Range(match.range(at: 2), in: upper)
        else { continue }
        let code = upper[codeRange].lowercased()
        if setCodes.contains(code) {
          result.setCode = code
          result.premiumMark = ["*", "★", "☆"].contains(String(upper[markRange]))
        }
      }
    }
    for line in lines {
      let range = NSRange(line.startIndex..., in: line)
      let isCopyright = line.range(of: #"wiz|coast|™|©"#, options: [.regularExpression, .caseInsensitive]) != nil
      if let match = fractionPattern.firstMatch(in: line, range: range),
         let numberRange = Range(match.range(at: 1), in: line) {
        result.collectorNumber = normalizedNumber(String(line[numberRange]))
        break
      }
      if !isCopyright,
         let match = rarityPattern.firstMatch(in: line, range: range),
         let numberRange = Range(match.range(at: 1), in: line) {
        result.collectorNumber = normalizedNumber(String(line[numberRange]))
        break
      }
    }
    return result
  }

  private static func normalizedNumber(_ text: String) -> String {
    let trimmed = text.drop { $0 == "0" }
    return trimmed.isEmpty ? "0" : String(trimmed)
  }
}
