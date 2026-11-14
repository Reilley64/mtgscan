import UIKit

@MainActor
final class CardGrid: UIStackView {
  init(_ cards: [UIView]) {
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
    for start in stride(from: 0, to: cards.count, by: 3) {
      let row = UIStackView()
      row.spacing = Tokens.sm
      row.distribution = .fillEqually
      row.alignment = .top
      for card in cards[start..<min(start + 3, cards.count)] { row.addArrangedSubview(card) }
      for _ in row.arrangedSubviews.count..<3 { row.addArrangedSubview(UIStackView()) }
      addArrangedSubview(row)
    }
  }

  required init(coder: NSCoder) { fatalError() }
}
