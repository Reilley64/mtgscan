import UIKit

@MainActor
final class CollectionPage: UIView, UIScrollViewDelegate {
  private let layout = AccountLayout()
  private let header = UIView()
  private let headerBackdrop = UIVisualEffectView(
    effect: UIBlurEffect(style: .systemChromeMaterial))
  private let controller: CollectionController
  private let organization: OrganizationController?
  private var picker: UserTagPicker?
  private var more: UIButton?
  private let images: any CardImages
  private lazy var close = CollectionControls.close { [weak self] in
    self?.closePage()
  }
  private var selectedCopyID: String?
  private var showingPicker = false
  private lazy var browser = CollectionBrowser(
    images: images,
    onOpen: { [weak self] id in Task { await self?.controller.open(id) } },
    onClose: { [weak self] in Task { await self?.controller.closeCopy() } },
    onRetry: { [weak self] in Task { await self?.controller.reload() } },
    onSignOut: onSignOut,
    onTags: { [weak self] in
      guard let self, let copy = controller.presentation.copy else { return }
      Task { await self.organization?.open(copy) }
    })
  private let onSignOut: () -> Void

  init(
    controller: CollectionController, organization: OrganizationController? = nil,
    images: (any CardImages)? = nil,
    onSignOut: @escaping () -> Void
  ) {
    self.controller = controller
    self.organization = organization
    self.images = images ?? HTTPSCardImages()
    self.onSignOut = onSignOut
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(browser)
    if let organization {
      let picker = UserTagPicker(controller: organization) { [weak controller, weak organization] in
        Task {
          await controller?.reload()
          await organization?.reload()
        }
      }
      self.picker = picker
      layout.content.addArrangedSubview(picker)
      organization.onChange = { [weak self] in self?.display() }
      organization.onMutation = { [weak controller] in controller?.invalidateOrganization() }
      organization.onRefusal = { [weak controller] in controller?.refuseOrganization() }
      controller.onCopyChange = { [weak organization] in organization?.reconcile($0) }
    }
    layout.keyboardDismissMode = .interactive
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
    let top =
      !header.isHidden && (picker?.isHidden == false || browser.hero == nil) ? header.frame.maxY : 0
    let bottom =
      picker?.isHidden == false
      ? min(bounds.maxY, keyboardLayoutGuide.layoutFrame.minY) : bounds.maxY
    layout.frame = CGRect(x: 0, y: top, width: bounds.width, height: max(0, bottom - top))
    headerBackdrop.frame = header.bounds
    close.frame = CGRect(x: 0, y: 0, width: Tokens.touchTarget, height: Tokens.touchTarget)
    more?.frame = CGRect(
      x: max(0, bounds.width - Tokens.touchTarget), y: 0, width: Tokens.touchTarget,
      height: Tokens.touchTarget)
    layout.layoutIfNeeded()
    updateHeaderEffect()
  }

  private func display() {
    let state = controller.presentation
    organization?.setAccount(controller.currentAccountID)
    if state.state == .missing, organization?.presentation.copyID != nil {
      endEditing(true)
      organization?.close()
    }
    let picking = organization?.presentation.copyID != nil
    CollectionControls.configureBack(close, showing: picking)
    browser.isHidden = picking
    picker?.isHidden = !picking
    picker?.display()
    browser.display(state)
    more?.removeFromSuperview()
    more = nil
    if !picking, let organization, let copy = state.copy,
      copy.protected || (copy.deck == nil && copy.heldFor == nil)
    {
      let title = copy.protected ? "Unprotect" : "Protect"
      let button = OrganizationControls.more(
        enabled: !organization.presentation.busy,
        items: [
          OrganizationMenuItem(title: title, symbol: copy.protected ? "shield.slash" : "shield") {
            Task { await organization.protect(copy) }
          }
        ])
      more = button
      header.addSubview(button)
    }
    if let title = organization?.presentation.protectionError,
      let presenter = window?.rootViewController, presenter.presentedViewController == nil
    {
      organization?.clearProtectionError()
      OrganizationControls.alert(title: title, presenter: presenter)
    }
    header.isHidden = state.selectedCopyID == nil
    if selectedCopyID != state.selectedCopyID || showingPicker != picking {
      selectedCopyID = state.selectedCopyID
      showingPicker = picking
      layout.setContentOffset(.zero, animated: false)
    }
    setNeedsLayout()
    updateHeaderEffect()
  }

  private func closePage() {
    if organization?.presentation.copyID != nil {
      endEditing(true)
      organization?.close()
    } else {
      Task { await controller.closeCopy() }
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) { updateHeaderEffect() }

  private func updateHeaderEffect() {
    let heroBelowHeader =
      organization?.presentation.copyID == nil
      && (browser.hero.map {
        $0.convert($0.bounds, to: self).maxY > header.frame.maxY
      } ?? true)
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
      closePage()
    }
  }
}
