import UIKit

@MainActor
final class CountBadge: UIView {
  private let label: UILabel

  init(count: Int, accessibilityLabel: String) {
    label = AuthControls.label(String(count), style: .caption2)
    super.init(frame: .zero)
    backgroundColor = Tokens.badge
    clipsToBounds = true
    addSubview(label)
    isAccessibilityElement = true
    self.accessibilityLabel = accessibilityLabel
    label.isAccessibilityElement = false
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: CountBadge, _: UITraitCollection) in view.updateFont()
    }
    updateFont()
  }

  required init?(coder: NSCoder) { fatalError() }

  override var intrinsicContentSize: CGSize {
    let text = label.intrinsicContentSize
    let height = max(CGFloat(PresentationData.countBadgeSize), text.height)
    return CGSize(width: max(height, text.width + 2 * Tokens.xs), height: height)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    label.frame = bounds.insetBy(dx: Tokens.xs, dy: 0)
    layer.cornerRadius = bounds.height / 2
  }

  private func updateFont() {
    label.font = UIFontMetrics(forTextStyle: .caption2).scaledFont(
      for: UIFont.systemFont(
        ofSize: CGFloat(PresentationData.countBadgeFontSize),
        weight: UIFont.Weight(rawValue: CGFloat(PresentationData.countBadgeFontWeight))),
      compatibleWith: traitCollection)
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }
}
