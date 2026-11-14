import UIKit

@MainActor
final class DeckPage: UIView, UIGestureRecognizerDelegate, UIScrollViewDelegate {
  private let controller: DeckController
  private let copies: CollectionController
  private let images: any CardImages
  private let onCollection: () -> Void
  private let onSignOut: () -> Void
  private let layout = AccountLayout(topPadding: 0)
  private let header = UIStackView()
  private lazy var headerEffect = ScrollHeaderEffect(header: header, scrollView: layout)
  private var headerTitle: UILabel?
  private let ordering = UIStackView()
  private var selectedDeckID: String?
  private var selectedCopyID: String?
  var onNavigationChange: ((Bool) -> Void)?
  private var copyIsOpen: Bool { controller.presentation.selectedCopyID != nil }
  private weak var namePrompt: UIAlertController?
  private lazy var browser = DeckBrowser(
    images: images,
    onOpen: { [weak self] id in Task { await self?.controller.open(id) } },
    onCopy: { [weak self] id in self?.openCopy(id) },
    onCreate: { [weak self] in self?.name(rename: false) },
    onRetry: { [weak self] in Task { await self?.controller.reload() } },
    onCollection: { [weak self] in self?.openCollection() })
  private lazy var copyPage = CollectionPage(
    controller: copies, images: images,
    onClose: { [weak self] in
      self?.controller.closeCopy()
      Task { await self?.controller.reload() }
    },
    onDeck: { [weak self] id in
      guard let self else { return }
      Task { await self.controller.open(id) }
    }, onSignOut: onSignOut)

  init(
    controller: DeckController, copies: CollectionController, images: (any CardImages)? = nil,
    onCollection: @escaping () -> Void, onSignOut: @escaping () -> Void
  ) {
    self.controller = controller
    self.copies = copies
    self.images = images ?? HTTPSCardImages()
    self.onCollection = onCollection
    self.onSignOut = onSignOut
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    header.axis = .horizontal
    header.spacing = Tokens.sm
    header.alignment = .center
    ordering.axis = .horizontal
    ordering.spacing = Tokens.sm
    ordering.alignment = .center
    addSubview(layout)
    layout.content.addArrangedSubview(browser)
    layout.delegate = self
    browser.onLayout = { [weak self] in self?.updateHeaderEffect() }
    addSubview(header)
    _ = headerEffect
    addSubview(ordering)
    addSubview(copyPage)
    controller.onChange = { [weak self] in self?.display() }
    copyPage.onNavigationChange = { [weak self] _ in self?.updateCopyVisibility() }
    let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(goBack(_:)))
    back.edges = .left
    back.delegate = self
    addGestureRecognizer(back)
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: DeckPage, _: UITraitCollection) in view.display()
    }
    display()
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    let headerHeight = max(
      Tokens.touchTarget,
      header.systemLayoutSizeFitting(
        CGSize(width: bounds.width, height: UIView.layoutFittingCompressedSize.height)
      ).height)
    header.frame = CGRect(x: 0, y: 0, width: bounds.width, height: headerHeight)
    let top = browser.banner == nil ? headerHeight + Tokens.lg : 0
    layout.frame = CGRect(
      x: 0, y: top, width: bounds.width, height: max(0, bounds.height - top))
    let orderSize = ordering.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    ordering.frame = CGRect(
      x: max(0, bounds.width - orderSize.width - Tokens.lg),
      y: max(headerHeight, bounds.height - orderSize.height - Tokens.lg), width: orderSize.width,
      height: orderSize.height)
    layout.contentInset.bottom =
      ordering.isHidden ? 0 : CGFloat(PresentationData.floatingButtonClearance) - Tokens.lg
    copyPage.frame = bounds
    layout.layoutIfNeeded()
    updateHeaderEffect()
  }

  private func display() {
    let state = controller.presentation
    if state.state == .signedOut || state.state == .refused
      || (state.state == .loading && state.selectedDeckID == nil)
    {
      namePrompt?.dismiss(animated: false)
    }
    if selectedCopyID != state.selectedCopyID {
      selectedCopyID = state.selectedCopyID
      if let id = selectedCopyID {
        let interaction = controller.interactionID
        Task {
          guard controller.interactionID == interaction,
            controller.presentation.selectedCopyID == id
          else { return }
          await copies.open(id)
        }
      }
    }
    updateCopyVisibility()
    browser.display(
      state, grouping: controller.grouping, sort: controller.sort, ascending: controller.ascending)
    for stack in [header, ordering] {
      for view in stack.arrangedSubviews {
        stack.removeArrangedSubview(view)
        view.removeFromSuperview()
      }
    }
    if state.selectedDeckID != nil {
      header.addArrangedSubview(
        CollectionControls.close { [weak self] in Task { await self?.controller.close() } })
    }
    let title = AuthControls.label(
      state.selectedDeckID == nil ? "Decks" : state.deck?.summary.name ?? "", style: .headline)
    title.accessibilityTraits.insert(.header)
    title.numberOfLines = 1
    title.lineBreakMode = .byTruncatingTail
    headerTitle = title
    header.addArrangedSubview(title)
    header.addArrangedSubview(UIStackView())
    if let deck = state.deck {
      let rename = UIAction(title: "Rename") { [weak self] _ in self?.name(rename: true) }
      let priorities = DeckPriority.allCases.map { priority in
        UIAction(title: priority.title, state: deck.summary.priority == priority ? .on : .off) {
          [weak self] _ in Task { await self?.controller.setPriority(priority) }
        }
      }
      let more = DeckControls.more(
        menu: UIMenu(children: [rename, UIMenu(title: "Priority", children: priorities)]))
      more.isEnabled = !state.writing
      header.addArrangedSubview(more)
    } else if state.selectedDeckID == nil {
      let create = AuthControls.button("Create deck") { [weak self] in self?.name(rename: false) }
      create.isEnabled = !state.writing && state.state != .refused && state.state != .signedOut
      header.addArrangedSubview(create)
    }
    ordering.isHidden = (state.deck?.summary.cardCount ?? 0) == 0
    if !ordering.isHidden {
      let groups = DeckGrouping.allCases.map { group in
        UIAction(title: group.rawValue, state: controller.grouping == group ? .on : .off) {
          [weak self] _ in self?.controller.group(by: group)
        }
      }
      let sorts = DeckSort.allCases.map { sort in
        DeckControls.sortChoice(
          title: sort.rawValue, selected: controller.sort == sort, ascending: controller.ascending
        ) { [weak self] in self?.controller.sort(by: sort) }
      }
      let group = DeckControls.floatingMenu(
        title: "Group", symbol: "rectangle.3.group", active: controller.grouping != .type,
        menu: UIMenu(title: "Group by", children: groups))
      group.accessibilityValue = controller.grouping.rawValue
      let sort = DeckControls.floatingMenu(
        title: "Sort", symbol: "arrow.up.arrow.down",
        active: controller.sort != .name || !controller.ascending,
        menu: UIMenu(title: "Sort by", children: sorts))
      sort.accessibilityValue =
        "\(controller.sort.rawValue), \(controller.ascending ? "ascending" : "descending")"
      ordering.addArrangedSubview(group)
      ordering.addArrangedSubview(sort)
    }
    if selectedDeckID != state.selectedDeckID {
      selectedDeckID = state.selectedDeckID
      onNavigationChange?(selectedDeckID != nil)
      layout.setContentOffset(.zero, animated: false)
    }
    if let failure = state.writeFailure, let presenter = window?.rootViewController,
      presenter.presentedViewController == nil
    {
      controller.clearWriteFailure()
      presenter.present(DeckControls.failureAlert(title: failure), animated: true)
    }
    setNeedsLayout()
    updateHeaderEffect()
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) { updateHeaderEffect() }

  private func updateHeaderEffect() {
    let passed =
      browser.banner.map {
        $0.bounds.height > 0 && $0.convert($0.bounds, to: self).maxY <= header.frame.maxY
      } ?? false
    let hideTitle = browser.banner != nil && !passed
    if headerTitle?.isHidden != hideTitle {
      headerTitle?.isHidden = hideTitle
      setNeedsLayout()
    }
    headerEffect.update(hidden: !passed)
  }

  private func name(rename: Bool) {
    guard let presenter = window?.rootViewController, presenter.presentedViewController == nil
    else { return }
    let context = controller.interactionID
    let alert = DeckControls.nameAlert(
      title: rename ? "Rename deck" : "New deck",
      name: rename ? controller.presentation.deck?.summary.name ?? "" : "",
      save: rename ? "Save" : "Create", limit: PresentationData.deckNameLength,
      checked: DeckNameInput.checked
    ) { [weak self] name in
      Task {
        guard let self, self.controller.interactionID == context else { return }
        if rename {
          await self.controller.rename(name)
        } else {
          await self.controller.create(name)
        }
      }
    }
    namePrompt = alert
    presenter.present(alert, animated: true)
  }

  private func openCopy(_ id: String) {
    controller.openCopy(id)
  }

  private func updateCopyVisibility() {
    copyPage.isHidden =
      !copyIsOpen || copies.presentation.selectedCopyID != controller.presentation.selectedCopyID
  }

  private func openCollection() {
    controller.showGallery()
    onCollection()
    Task { await controller.reload() }
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    !copyIsOpen && controller.presentation.selectedDeckID != nil
  }

  @objc private func goBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
    if gesture.state == .ended, gesture.translation(in: self).x > Tokens.touchTarget, !copyIsOpen,
      controller.presentation.selectedDeckID != nil
    {
      Task { await controller.close() }
    }
  }
}
