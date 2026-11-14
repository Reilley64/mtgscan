import UIKit

@MainActor
final class SetsPage: UIView, UINavigationControllerDelegate {
  private let controller: SetsController
  private let images: any CardImages
  private let symbols: any SetSymbols
  private let root = UIViewController()
  private lazy var navigation = UINavigationController(rootViewController: root)
  private let onClose: () -> Void
  private var accountRevision: Int

  init(
    controller: SetsController, images: any CardImages, symbols: (any SetSymbols)? = nil,
    onClose: @escaping () -> Void
  ) {
    self.controller = controller
    self.images = images
    self.symbols = symbols ?? HTTPSSetSymbols()
    self.onClose = onClose
    accountRevision = controller.presentation.accountRevision
    super.init(frame: .zero)
    isHidden = true
    root.title = "Collection"
    navigation.delegate = self
    navigation.navigationBar.prefersLargeTitles = true
    navigation.navigationBar.overrideUserInterfaceStyle = .dark
    navigation.navigationBar.tintColor = Tokens.primary
    navigation.navigationBar.titleTextAttributes = [.foregroundColor: Tokens.text]
    navigation.navigationBar.largeTitleTextAttributes = [.foregroundColor: Tokens.text]
    controller.onChange = { [weak self] in
      guard let self else { return }
      (navigation.topViewController as? SetsScreen)?.display()
      if controller.presentation.state == .signedOut
        || accountRevision != controller.presentation.accountRevision
      {
        accountRevision = controller.presentation.accountRevision
        navigation.popToRootViewController(animated: false)
        isHidden = true
      }
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification,
      object: nil)
  }
  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    navigation.view.frame = bounds
  }

  func open() {
    guard let owner = window?.rootViewController, controller.presentation.state != .signedOut else {
      return
    }
    if navigation.parent == nil {
      owner.addChild(navigation)
      addSubview(navigation.view)
      navigation.didMove(toParent: owner)
    }
    controller.openList()
    isHidden = false
    navigation.setViewControllers([root, screen(code: nil)], animated: false)
    setNeedsLayout()
  }

  private func screen(code: String?) -> SetsScreen {
    let screen = SetsScreen(controller: controller, code: code, images: images, symbols: symbols)
    screen.onOpen = { [weak self] code in
      guard let self else { return }
      navigation.pushViewController(self.screen(code: code), animated: true)
    }
    return screen
  }

  func navigationController(
    _ navigationController: UINavigationController, didShow viewController: UIViewController,
    animated: Bool
  ) {
    if viewController === root, navigationController.topViewController === root, !isHidden {
      controller.closeList()
      isHidden = true
      onClose()
    }
  }

  @objc private func foreground() {
    if !isHidden { Task { await controller.reload() } }
  }
}

@MainActor
private final class SetsScreen: UIViewController, UISearchBarDelegate, UIScrollViewDelegate {
  private let controller: SetsController
  private let code: String?
  private let layout = SetsLayout()
  private let browser: SetsBrowser
  private var search: UISearchBar?
  private var finishControl: FinishViewControl?
  private var shownFinish: FinishView?
  private var shownItems: [CardSet] = []
  var onOpen: ((String) -> Void)?

  init(controller: SetsController, code: String?, images: any CardImages, symbols: any SetSymbols) {
    self.controller = controller
    self.code = code
    browser = SetsBrowser(images: images, symbols: symbols)
    super.init(nibName: nil, bundle: nil)
    title = code == nil ? "Sets" : nil
    navigationItem.largeTitleDisplayMode = code == nil ? .always : .never
  }
  required init?(coder: NSCoder) { fatalError() }

  override func loadView() {
    view = layout
    view.backgroundColor = Tokens.background
    layout.scroll.content.addArrangedSubview(browser)
    layout.scroll.delegate = self
    setContentScrollView(layout.scroll, for: .top)
    if code == nil {
      let search = SetNavigation.search(delegate: self)
      search.text = controller.presentation.searchText
      self.search = search
      layout.controls.addArrangedSubview(search)
    }
    browser.onOpen = { [weak self] code in self?.onOpen?(code) }
    browser.onRetry = { [weak self] in Task { await self?.controller.reload() } }
    browser.onChoose = { [weak self] view in Task { await self?.controller.choose(view) } }
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (screen: SetsScreen, _: UITraitCollection) in screen.display()
    }
    display()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    Task {
      if let code {
        if controller.presentation.code != code {
          await controller.open(code)
        } else {
          await controller.reload()
        }
      } else if controller.presentation.code != nil {
        await controller.closeSet()
      } else {
        await controller.reload()
      }
    }
  }

  func display() {
    guard isViewLoaded else { return }
    var state = controller.presentation
    if state.code != code {
      state.code = code
      state.state = .loading
      state.items = []
      state.details = nil
    }
    if code == nil && shownFinish != state.finishView {
      if let finishControl {
        layout.controls.removeArrangedSubview(finishControl)
        finishControl.removeFromSuperview()
      }
      let control = FinishViewControl(
        labels: FinishView.allCases.map(\.label),
        selected: FinishView.allCases.firstIndex(of: state.finishView) ?? 0
      ) { [weak self] index in
        Task { await self?.controller.choose(FinishView.allCases[index]) }
      }
      finishControl = control
      shownFinish = state.finishView
      layout.controls.addArrangedSubview(control)
    }
    let resetScroll =
      code == nil && !shownItems.isEmpty && state.items.isEmpty && state.state == .loading
    shownItems = state.items
    browser.display(state)
    if resetScroll { layout.scroll.setContentOffset(.zero, animated: false) }
    view.setNeedsLayout()
  }

  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
    Task { await controller.search(searchText) }
  }

  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    searchBar.text = ""
    searchBar.resignFirstResponder()
    Task { await controller.search("") }
  }

  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) { searchBar.resignFirstResponder() }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    if code != nil, let banner = browser.arrangedSubviews.first {
      let bottom = banner.convert(banner.bounds, to: view).maxY
      title =
        bottom <= view.safeAreaInsets.top ? controller.presentation.details?.summary.name : nil
    }
    if code == nil,
      scrollView.contentOffset.y + scrollView.bounds.height >= scrollView.contentSize.height
        - scrollView.bounds.height
    {
      Task { await controller.more() }
    }
  }
}
