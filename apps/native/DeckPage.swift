import UIKit

@MainActor
final class DeckPage: UIView, UIGestureRecognizerDelegate {
  private let controller: DeckController
  private let copies: CollectionController
  private let images: any CardImages
  private let onCollection: () -> Void
  private let onSignOut: () -> Void
  private let layout = AccountLayout()
  private let header = UIStackView()
  private let ordering = UIStackView()
  private var selectedDeckID: String?
  var onNavigationChange: ((Bool) -> Void)?
  private var copyIsOpen = false
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
      self?.copyIsOpen = false
      self?.display()
      Task { await self?.controller.reload() }
    },
    onDeck: { [weak self] id in
      guard let self else { return }
      self.copyIsOpen = false
      Task {
        await self.copies.closeCopy()
        await self.controller.open(id)
      }
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
    ordering.alignment = .trailing
    addSubview(layout)
    layout.content.addArrangedSubview(browser)
    addSubview(header)
    addSubview(ordering)
    addSubview(copyPage)
    controller.onChange = { [weak self] in self?.display() }
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
    layout.frame = CGRect(
      x: 0, y: headerHeight, width: bounds.width, height: max(0, bounds.height - headerHeight))
    let orderSize = ordering.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    ordering.frame = CGRect(
      x: max(0, bounds.width - orderSize.width - Tokens.lg),
      y: max(headerHeight, bounds.height - orderSize.height - Tokens.lg), width: orderSize.width,
      height: orderSize.height)
    layout.contentInset.bottom = ordering.isHidden ? 0 : orderSize.height + Tokens.lg
    copyPage.frame = bounds
  }

  private func display() {
    let state = controller.presentation
    if state.state == .signedOut || state.state == .refused
      || (state.state == .loading && state.selectedDeckID == nil)
    {
      namePrompt?.dismiss(animated: false)
      copyIsOpen = false
    }
    copyPage.isHidden = !copyIsOpen
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
    header.addArrangedSubview(title)
    header.addArrangedSubview(UIStackView())
    if let deck = state.deck {
      let rename = UIAction(title: "Rename") { [weak self] _ in self?.name(rename: true) }
      let priorities = DeckPriority.allCases.map { priority in
        UIAction(title: priority.title, state: deck.summary.priority == priority ? .on : .off) {
          [weak self] _ in Task { await self?.controller.setPriority(priority) }
        }
      }
      let more = DeckControls.menu(
        title: "More", symbol: "ellipsis",
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
        UIAction(title: sort.rawValue, state: controller.sort == sort ? .on : .off) {
          [weak self] _ in self?.controller.sort(by: sort)
        }
      }
      let group = DeckControls.menu(
        title: "Group", symbol: "rectangle.3.group",
        menu: UIMenu(title: "Group by", children: groups))
      group.accessibilityValue = controller.grouping.rawValue
      let sort = DeckControls.menu(
        title: "Sort", symbol: "arrow.up.arrow.down",
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
    copyIsOpen = true
    copyPage.isHidden = false
    Task { await copies.open(id) }
  }

  private func openCollection() {
    Task {
      await controller.close()
      onCollection()
    }
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
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
