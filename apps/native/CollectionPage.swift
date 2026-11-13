import UIKit

@MainActor
final class CollectionPage: UIView {
  private let layout = AccountLayout()
  private let controller: CollectionController
  private let images: any CardImages
  private lazy var close = AuthControls.button("Close") { [weak self] in
    Task { await self?.controller.closeCopy() }
  }
  private var selectedCopyID: String?
  private lazy var browser = CollectionBrowser(
    images: images,
    onOpen: { [weak self] id in Task { await self?.controller.open(id) } },
    onClose: { [weak self] in Task { await self?.controller.closeCopy() } },
    onRetry: { [weak self] in Task { await self?.controller.reload() } },
    onSignOut: onSignOut)
  private let onSignOut: () -> Void

  init(
    controller: CollectionController, images: (any CardImages)? = nil,
    onSignOut: @escaping () -> Void
  ) {
    self.controller = controller
    self.images = images ?? HTTPSCardImages()
    self.onSignOut = onSignOut
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(browser)
    addSubview(close)
    controller.onChange = { [weak self] in self?.display() }
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: CollectionPage, _: UITraitCollection) in
      view.display()
    }
    let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(goBack(_:)))
    back.edges = .left
    addGestureRecognizer(back)
    display()
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    layout.frame = bounds
    close.frame = CGRect(
      x: 0, y: 0, width: max(Tokens.touchTarget, close.intrinsicContentSize.width),
      height: max(Tokens.touchTarget, close.intrinsicContentSize.height))
  }

  private func display() {
    let state = controller.presentation
    browser.display(state)
    close.isHidden = state.selectedCopyID == nil
    if selectedCopyID != state.selectedCopyID {
      selectedCopyID = state.selectedCopyID
      layout.setContentOffset(.zero, animated: false)
    }
  }

  @objc private func goBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
    if gesture.state == .ended, gesture.translation(in: self).x > Tokens.touchTarget,
      controller.presentation.selectedCopyID != nil
    {
      Task { await controller.closeCopy() }
    }
  }
}
