import UIKit

@MainActor
enum CardSymbolLabel {
  static func make(_ text: String) -> UILabel {
    let label = AuthControls.label(text)
    label.accessibilityLabel = CardSymbols.spokenText(text)
    let result = NSMutableAttributedString(string: "")
    let source = text as NSString
    let pattern = try! NSRegularExpression(pattern: "\\{[^{}]+\\}")
    var previous = 0
    for match in pattern.matches(in: text, range: NSRange(location: 0, length: source.length)) {
      result.append(
        NSAttributedString(
          string: source.substring(
            with: NSRange(location: previous, length: match.range.location - previous))))
      let token = source.substring(with: match.range)
      if let symbol = PresentationData.symbols[token] {
        let attachment = NSTextAttachment()
        attachment.image = draw(symbol, size: label.font.lineHeight)
        let width = symbol.half ? label.font.lineHeight / 2 : label.font.lineHeight
        attachment.bounds = CGRect(
          x: 0, y: label.font.descender, width: width, height: label.font.lineHeight)
        result.append(NSAttributedString(attachment: attachment))
      } else {
        result.append(NSAttributedString(string: token))
      }
      previous = NSMaxRange(match.range)
    }
    result.append(NSAttributedString(string: source.substring(from: previous)))
    label.attributedText = result
    return label
  }

  private static func color(_ name: String) -> UIColor {
    switch name {
    case "white": return Tokens.manaWhite
    case "blue": return Tokens.manaBlue
    case "black": return Tokens.manaBlack
    case "red": return Tokens.manaRed
    case "green": return Tokens.manaGreen
    default: return Tokens.manaGeneric
    }
  }

  private static func draw(_ symbol: NativeCardSymbol, size: CGFloat) -> UIImage {
    let output = CGSize(width: symbol.half ? size / 2 : size, height: size)
    return UIGraphicsImageRenderer(size: output).image { renderer in
      let context = renderer.cgContext
      let rect = CGRect(x: 0, y: 0, width: size, height: size)
      context.saveGState()
      switch symbol.circle {
      case .none: break
      case .untap:
        context.setFillColor(Tokens.manaGlyph.cgColor)
        context.fillEllipse(in: rect)
      case .colors(let colors):
        context.addEllipse(in: rect)
        context.clip()
        context.setFillColor(color(colors[0]).cgColor)
        context.fill(rect)
        if colors.count > 1 {
          context.setFillColor(color(colors[1]).cgColor)
          context.move(to: CGPoint(x: size, y: 0))
          context.addLine(to: CGPoint(x: size, y: size))
          context.addLine(to: CGPoint(x: 0, y: size))
          context.closePath()
          context.fillPath()
        }
      }
      context.restoreGState()
      let glyphColor: UIColor
      if case .colors = symbol.circle {
        glyphColor = Tokens.manaGlyph
      } else {
        glyphColor = Tokens.text
      }
      for (index, glyph) in symbol.glyphs.enumerated() {
        let split = symbol.glyphs.count > 1
        let fontSize = size * (split ? 0.42 : 0.75)
        let font = UIFont(name: "Mana", size: fontSize) ?? UIFont.systemFont(ofSize: fontSize)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: glyphColor]
        let dimensions = (glyph as NSString).size(withAttributes: attributes)
        let origin =
          split
          ? CGPoint(
            x: index == 0 ? 1 : size - dimensions.width - 1,
            y: index == 0 ? 0 : size - dimensions.height)
          : CGPoint(x: (size - dimensions.width) / 2, y: (size - dimensions.height) / 2)
        (glyph as NSString).draw(at: origin, withAttributes: attributes)
      }
    }
  }
}
