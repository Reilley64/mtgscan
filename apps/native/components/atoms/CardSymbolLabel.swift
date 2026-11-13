import UIKit

@MainActor
private final class CardSymbolText: UILabel {
  private let source: String

  init(_ text: String) {
    source = text
    super.init(frame: .zero)
    AuthControls.configureLabel(self, text: text)
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (label: CardSymbolText, _: UITraitCollection) in
      CardSymbolLabel.update(label, text: label.source)
    }
    CardSymbolLabel.update(self, text: source)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    CardSymbolLabel.update(self, text: source)
  }
}

@MainActor
enum CardSymbolLabel {
  static func make(_ text: String) -> UILabel { CardSymbolText(text) }

  fileprivate static func update(_ label: UILabel, text: String) {
    label.font = UIFont.preferredFont(forTextStyle: .body, compatibleWith: label.traitCollection)
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
        let size = UIFontMetrics(forTextStyle: .body).scaledValue(
          for: PresentationData.manaSymbolSize, compatibleWith: label.traitCollection)
        attachment.image = draw(symbol, size: size)
        let width = symbol.half ? size / 2 : size
        attachment.bounds = CGRect(
          x: 0, y: label.font.descender, width: width, height: size)
        result.append(NSAttributedString(attachment: attachment))
      } else {
        result.append(NSAttributedString(string: token))
      }
      previous = NSMaxRange(match.range)
    }
    result.append(NSAttributedString(string: source.substring(from: previous)))
    label.attributedText = result
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
        let scale = size / PresentationData.manaSymbolSize
        let fontSize = symbol.glyphFontSize * scale
        let inset = PresentationData.manaSymbolSplitInset * scale
        let font = UIFont(name: "Mana", size: fontSize) ?? UIFont.systemFont(ofSize: fontSize)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: glyphColor]
        let dimensions = (glyph as NSString).size(withAttributes: attributes)
        let origin =
          split
          ? CGPoint(
            x: index == 0 ? inset : size - dimensions.width - inset,
            y: index == 0 ? inset : size - dimensions.height - inset)
          : CGPoint(x: (size - dimensions.width) / 2, y: (size - dimensions.height) / 2)
        (glyph as NSString).draw(at: origin, withAttributes: attributes)
      }
    }
  }
}
