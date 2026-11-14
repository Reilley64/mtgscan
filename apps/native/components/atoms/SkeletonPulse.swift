import UIKit

@MainActor
enum SkeletonPulse {
  static func start(_ views: [UIView]) {
    guard !UIAccessibility.isReduceMotionEnabled else { return }
    UIView.animate(
      withDuration: 0.8, delay: 0, options: [.repeat, .autoreverse, .allowUserInteraction]
    ) {
      for view in views { view.alpha = Tokens.dimmed }
    }
  }

  static func stop(_ view: UIView) {
    view.layer.removeAllAnimations()
    view.alpha = 1
  }
}
