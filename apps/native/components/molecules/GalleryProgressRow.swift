import UIKit

@MainActor
final class GalleryProgressRow: UIStackView {
  private let bar = GalleryControls.progress()
  private let amount = AuthControls.label("", style: .footnote)

  init() {
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
    addArrangedSubview(bar)
    addArrangedSubview(amount)
  }

  required init(coder: NSCoder) { fatalError() }

  func display(done: Int64, total: Int64, text: String) {
    bar.progress = total > 0 ? Float(min(max(done, 0), total)) / Float(total) : 0
    bar.accessibilityValue = text
    amount.text = text
  }
}
