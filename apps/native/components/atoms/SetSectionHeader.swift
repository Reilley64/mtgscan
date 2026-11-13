import UIKit

@MainActor
enum SetSectionHeader {
  static func make(name: String, count: String, share: Double, complete: Bool, spoken: String)
    -> UIStackView
  {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = Tokens.xs
    let title = AuthControls.label(complete ? "\(name) ✓" : name, style: .headline)
    title.textColor = Tokens.primary
    stack.addArrangedSubview(title)
    stack.addArrangedSubview(AuthControls.label(count, style: .caption1))
    let progress = UIProgressView(progressViewStyle: .bar)
    progress.progress = Float(share)
    progress.progressTintColor = Tokens.primary
    progress.trackTintColor = Tokens.line
    progress.heightAnchor.constraint(equalToConstant: Tokens.progressBar).isActive = true
    stack.addArrangedSubview(progress)
    stack.isAccessibilityElement = true
    stack.accessibilityLabel = spoken
    stack.accessibilityTraits = .header
    return stack
  }

  static func loading(_ label: String, rows: Int) -> UIStackView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = Tokens.sm
    for _ in 0..<rows {
      let banner = UIView()
      banner.backgroundColor = Tokens.line
      banner.layer.cornerRadius = Tokens.corner
      banner.heightAnchor.constraint(equalToConstant: Tokens.setBanner).isActive = true
      stack.addArrangedSubview(banner)
    }
    stack.isAccessibilityElement = true
    stack.accessibilityLabel = label
    if !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(
        withDuration: 0.8, delay: 0, options: [.repeat, .autoreverse, .allowUserInteraction]
      ) {
        stack.alpha = Tokens.dimmed
      }
    }
    return stack
  }
}
