import UIKit

@MainActor
final class CollectionPage: UIView, UIScrollViewDelegate, UIAdaptivePresentationControllerDelegate {
  private let layout = AccountLayout()
  private let header = UIView()
  private let headerBackdrop = UIVisualEffectView(
    effect: UIBlurEffect(style: .systemChromeMaterial))
  private let controller: CollectionController
  private let images: any CardImages
  private let searchModel = CollectionSearchModel()
  private var pendingSearch: Task<Void, Never>?
  private var editing = false
  private var filtersOpen = false
  private var filtersSheet: UIViewController?
  private var filtersBody: CollectionFilters?
  private var accountRevision = -1
  private var scrollRevision = -1
  private var options = CollectionSearchOptions()
  private var sortButton: UIButton?
  private lazy var search = CollectionSearch(
    onCommand: { [weak self] in self?.command($0) },
    onFilters: { [weak self] in self?.openFilters() },
    onEditing: { [weak self] editing in
      self?.editing = editing
      self?.display()
    },
    onSignOut: onSignOut)
  private lazy var chips = CollectionSearchChips(onCommand: { [weak self] in self?.command($0) })
  private lazy var close = CollectionControls.close { [weak self] in
    Task { await self?.controller.closeCopy() }
  }
  private var selectedCopyID: String?
  private lazy var browser = CollectionBrowser(
    images: images,
    onOpen: { [weak self] id in
      self?.endEditing(true)
      Task { await self?.controller.open(id) }
    },
    onClose: { [weak self] in Task { await self?.controller.closeCopy() } },
    onRetry: { [weak self] in Task { await self?.controller.reload() } },
    onSignOut: onSignOut,
    onMore: { [weak self] in Task { await self?.controller.loadMore() } })
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
    layout.content.addArrangedSubview(chips)
    layout.content.addArrangedSubview(browser)
    addSubview(search)
    addSubview(header)
    header.addSubview(close)
    layout.delegate = self
    layout.keyboardDismissMode = .onDrag
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
      (view: CollectionPage, _: UITraitCollection) in view.display()
    }
    let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(goBack(_:)))
    back.edges = .left
    addGestureRecognizer(back)
    NotificationCenter.default.addObserver(
      self, selector: #selector(keyboardChanged),
      name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(keyboardChanged), name: UIResponder.keyboardDidHideNotification,
      object: nil)
    display()
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    header.frame = CGRect(x: 0, y: 0, width: bounds.width, height: Tokens.touchTarget)
    let searchHeight = search.systemLayoutSizeFitting(
      CGSize(width: bounds.width, height: 0), withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    ).height
    search.frame = CGRect(x: 0, y: 0, width: bounds.width, height: searchHeight)
    let top =
      !search.isHidden
      ? searchHeight : !header.isHidden && browser.hero == nil ? header.frame.maxY : 0
    let keyboard = keyboardLayoutGuide.layoutFrame
    let bottom = editing && keyboard.height > 0 ? min(bounds.height, keyboard.minY) : bounds.height
    layout.frame = CGRect(x: 0, y: top, width: bounds.width, height: max(0, bottom - top))
    headerBackdrop.frame = header.bounds
    close.frame = CGRect(x: 0, y: 0, width: Tokens.touchTarget, height: Tokens.touchTarget)
    sortButton?.frame = CGRect(
      x: max(0, bounds.width - Tokens.floatingButton - Tokens.lg),
      y: max(top, bounds.height - Tokens.floatingButton - Tokens.lg), width: Tokens.floatingButton,
      height: Tokens.floatingButton)
    layout.layoutIfNeeded()
    updateHeaderEffect()
  }

  private func display() {
    var state = controller.presentation
    if accountRevision != state.accountRevision {
      accountRevision = state.accountRevision
      pendingSearch?.cancel()
      searchModel.reset()
      editing = false
      endEditing(true)
      filtersSheet?.dismiss(animated: false)
      filtersOpen = false
      filtersSheet = nil
      filtersBody = nil
    }
    let optionsChanged = options != state.searchOptions
    options = state.searchOptions
    searchModel.update(options: options, field: state.queryError?.field)
    if state.state == .queryRefused, let message = searchModel.output.refusalMessage {
      state.queryError = CollectionQueryError(
        code: state.queryError?.code ?? "invalid_argument", field: state.queryError?.field,
        message: message)
    }
    let detail = state.selectedCopyID != nil
    search.isHidden = detail
    chips.isHidden = detail
    header.isHidden = !detail
    search.display(searchModel.output)
    chips.display(searchModel.output)
    chips.isHidden = detail || searchModel.output.chipLabels.isEmpty
    let suggesting = !detail && editing && !searchModel.output.suggestions.isEmpty
    if suggesting {
      browser.displaySuggestions(searchModel.output.suggestions) { [weak self] index in
        self?.command(["kind": "suggestion", "index": index])
      }
    } else {
      browser.display(state)
    }
    if selectedCopyID != state.selectedCopyID || scrollRevision != state.scrollRevision {
      selectedCopyID = state.selectedCopyID
      scrollRevision = state.scrollRevision
      layout.setContentOffset(.zero, animated: false)
    }
    sortButton?.removeFromSuperview()
    sortButton = nil
    if !detail && !suggesting && !(editing && !searchModel.output.state.text.isEmpty)
      && !filtersOpen && state.state == .loaded
    {
      let output = searchModel.output!
      let button = CollectionSearchControls.menu(
        label: "Sort, \(output.sortLabel)", symbol: "arrow.up.arrow.down",
        active: output.sorts.contains { $0.selected && $0.sort != "relevance" },
        choices: output.sorts.map { choice in
          CollectionMenuChoice(
            title: choice.title, selected: choice.selected,
            action: { [weak self] in self?.command(["kind": "sort", "sort": choice.sort]) },
            symbol: choice.direction.map { $0 == "desc" ? "arrow.down" : "arrow.up" })
        })
      sortButton = button
      addSubview(button)
    }
    setNeedsLayout()
    updateHeaderEffect()
    if optionsChanged
      && (state.state == .queryRefused || (state.state == .failed && state.queryError != nil))
      && searchModel.output.refusedIndex == nil
    {
      scheduleSearch(immediate: true)
    }
  }

  private func command(_ command: [String: Any], deferred: Bool = false) {
    let count = searchModel.output.chipLabels.count
    searchModel.update(command: command, options: options)
    search.display(searchModel.output)
    chips.display(searchModel.output)
    filtersBody?.display(searchModel.output)
    if !deferred {
      let immediate =
        command["kind"] as? String != "text" || count != searchModel.output.chipLabels.count
      scheduleSearch(immediate: immediate)
    }
    display()
  }

  private func scheduleSearch(immediate: Bool) {
    pendingSearch?.cancel()
    let output = searchModel.output!
    let query = CollectionSearchQuery(json: output.queryJSON)
    pendingSearch = Task { [weak self] in
      if !immediate { try? await Task.sleep(for: .milliseconds(300)) }
      guard !Task.isCancelled, let self, !filtersOpen else { return }
      pendingSearch = nil
      if let message = output.refusalMessage {
        controller.refuseSearch(query, message: message)
      } else {
        await controller.search(query, searching: output.searching)
      }
    }
  }

  private func openFilters() {
    guard !filtersOpen, let host = window?.rootViewController, host.presentedViewController == nil
    else { return }
    filtersOpen = true
    pendingSearch?.cancel()
    endEditing(true)
    let sheet = UIViewController()
    sheet.view.backgroundColor = Tokens.background
    let content = AccountLayout()
    content.translatesAutoresizingMaskIntoConstraints = false
    sheet.view.addSubview(content)
    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: sheet.view.safeAreaLayoutGuide.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: sheet.view.safeAreaLayoutGuide.trailingAnchor),
      content.topAnchor.constraint(equalTo: sheet.view.safeAreaLayoutGuide.topAnchor),
      content.bottomAnchor.constraint(equalTo: sheet.view.safeAreaLayoutGuide.bottomAnchor),
    ])
    let body = CollectionFilters(
      onCommand: { [weak self] in self?.command($0, deferred: true) },
      onClose: { [weak self, weak sheet] in sheet?.dismiss(animated: true) { self?.finishFilters() }
      })
    content.content.addArrangedSubview(body)
    body.display(searchModel.output)
    filtersBody = body
    filtersSheet = sheet
    sheet.sheetPresentationController?.detents = [.medium(), .large()]
    sheet.sheetPresentationController?.prefersGrabberVisible = true
    sheet.presentationController?.delegate = self
    host.present(sheet, animated: true)
    display()
  }

  private func finishFilters() {
    filtersOpen = false
    filtersSheet = nil
    filtersBody = nil
    scheduleSearch(immediate: true)
    display()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finishFilters()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) { endEditing(true) }
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    updateHeaderEffect()
    if scrollView.contentSize.height > scrollView.bounds.height
      && scrollView.contentOffset.y + scrollView.bounds.height >= scrollView.contentSize.height
        - Tokens.lg
      && !editing && !filtersOpen
    {
      Task { await controller.loadMore() }
    }
  }

  private func updateHeaderEffect() {
    let heroBelowHeader =
      browser.hero.map { $0.convert($0.bounds, to: self).maxY > header.frame.maxY } ?? true
    let hidden = controller.presentation.selectedCopyID == nil || heroBelowHeader
    if #available(iOS 26.0, *) {
      layout.topEdgeEffect.isHidden = hidden
    } else {
      headerBackdrop.isHidden = hidden
    }
  }

  @objc private func keyboardChanged() { setNeedsLayout() }

  @objc private func goBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
    if gesture.state == .ended, gesture.translation(in: self).x > Tokens.touchTarget,
      controller.presentation.selectedCopyID != nil
    {
      Task { await controller.closeCopy() }
    }
  }
}
