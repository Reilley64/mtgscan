import Foundation

struct NativeSheenStop {
  let rgba: [Double]
  let location: Double
}

enum SymbolCircle {
  case none
  case untap
  case colors([String])
}

struct NativeCardSymbol {
  let spoken: String
  let glyphs: [String]
  let circle: SymbolCircle
  let half: Bool
}

enum CardSymbols {
  static func spokenText(_ text: String) -> String {
    let regex = try! NSRegularExpression(pattern: "\\{[^{}]+\\}")
    let source = text as NSString
    var output = ""
    var previous = 0
    let matches = regex.matches(in: text, range: NSRange(location: 0, length: source.length))
    for (index, match) in matches.enumerated() {
      output += source.substring(
        with: NSRange(location: previous, length: match.range.location - previous))
      let token = source.substring(with: match.range)
      output += PresentationData.symbols[token]?.spoken ?? token
      previous = NSMaxRange(match.range)
      if index + 1 < matches.count, matches[index + 1].range.location == previous,
        PresentationData.symbols[token] != nil,
        PresentationData.symbols[source.substring(with: matches[index + 1].range)] != nil
      {
        output += " "
      }
    }
    return output + source.substring(from: previous)
  }

}
