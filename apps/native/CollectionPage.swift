import UIKit

@MainActor
final class CollectionPage: UIView, UIScrollViewDelegate {
  private let layout = AccountLayout()
  private let header = UIView()
  private let headerBackdrop = UIVisualEffectView(
    effect: UIBlurEffect(style: .systemChromeMaterial))
  private let controller: CollectionController
  private let images: any CardImages
  private lazy var close = CollectionControls.close { [weak self] in
    Task { await self?.controller.closeCopy() }
  }
  private var selectedCopyID: String?
  private var setsPage: SetsPage?
  private lazy var setsButton = SetNavigation.setsButton { [weak self] in self?.setsPage?.open() }
  private lazy var browser = CollectionBrowser(
    images: images,
    onOpen: { [weak self] id in Task { await self?.controller.open(id) } },
    onClose: { [weak self] in Task { await self?.controller.closeCopy() } },
    onRetry: { [weak self] in Task { await self?.controller.reload() } },
    onSignOut: onSignOut, gallery: gallery)
  private let gallery: GalleryStatus?
  private let onSignOut: () -> Void

  init(
    controller: CollectionController, setsController: SetsController? = nil,
    images: (any CardImages)? = nil, gallery: GalleryStatus? = nil,
    onSignOut: @escaping () -> Void
  ) {
    self.controller = controller
    self.images = images ?? HTTPSCardImages()
    self.gallery = gallery
    self.onSignOut = onSignOut
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(browser)
    addSubview(header)
    header.addSubview(close)
    layout.delegate = self
    if #available(iOS 26.0, *) {
      let interaction = UIScrollEdgeElementContainerInteraction()
      interaction.scrollView = layout
      interaction.edge = .top
      header.addInteraction(interaction)
      layout.topEdgeEffect.style = .soft
    } else {
      header.insertSubview(headerBackdrop, at: 0)
    }
    browser.onLayout = { [weak self] in self?.updateHeaderEffect() }
    controller.onChange = { [weak self] in self?.display() }
    if let setsController {
      let setsPage = SetsPage(controller: setsController, images: self.images) {
        [weak controller] in
        Task { await controller?.reload() }
      }
      self.setsPage = setsPage
      addSubview(setsButton)
      addSubview(setsPage)
    }
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
    header.frame = CGRect(x: 0, y: 0, width: bounds.width, height: Tokens.touchTarget)
    let top = !header.isHidden && browser.hero == nil ? header.frame.maxY : 0
    layout.frame = CGRect(x: 0, y: top, width: bounds.width, height: max(0, bounds.height - top))
    setsButton.frame = CGRect(
      x: Tokens.lg, y: bounds.height - safeAreaInsets.bottom - Tokens.lg - Tokens.floatingButton,
      width: Tokens.floatingButton, height: Tokens.floatingButton)
    setsPage?.frame = bounds
    headerBackdrop.frame = header.bounds
    close.frame = CGRect(x: 0, y: 0, width: Tokens.touchTarget, height: Tokens.touchTarget)
    layout.layoutIfNeeded()
    updateHeaderEffect()
  }

  private func display() {
    let state = controller.presentation
    browser.display(state)
    setsButton.isHidden =
      setsPage == nil || state.selectedCopyID != nil || state.state != .loaded
      || state.copies.isEmpty
    header.isHidden = state.selectedCopyID == nil
    if selectedCopyID != state.selectedCopyID {
      selectedCopyID = state.selectedCopyID
      layout.setContentOffset(.zero, animated: false)
    }
    setNeedsLayout()
    updateHeaderEffect()
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) { updateHeaderEffect() }

  private func updateHeaderEffect() {
    let heroBelowHeader =
      browser.hero.map {
        $0.convert($0.bounds, to: self).maxY > header.frame.maxY
      } ?? true
    let hidden = controller.presentation.selectedCopyID == nil || heroBelowHeader
    if #available(iOS 26.0, *) {
      layout.topEdgeEffect.isHidden = hidden
    } else {
      headerBackdrop.isHidden = hidden
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
