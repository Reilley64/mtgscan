import UIKit

@MainActor
final class ScrollHeaderEffect {
  private let header: UIView
  private let scrollView: UIScrollView
  private let backdrop = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))

  init(header: UIView, scrollView: UIScrollView) {
    self.header = header
    self.scrollView = scrollView
    if #available(iOS 26.0, *) {
      let interaction = UIScrollEdgeElementContainerInteraction()
      interaction.scrollView = scrollView
      interaction.edge = .top
      header.addInteraction(interaction)
      scrollView.topEdgeEffect.style = .soft
    } else {
      header.insertSubview(backdrop, at: 0)
    }
  }

  func update(hidden: Bool) {
    if #available(iOS 26.0, *) {
      scrollView.topEdgeEffect.isHidden = hidden
    } else {
      backdrop.frame = header.bounds
      backdrop.isHidden = hidden
    }
  }
}
