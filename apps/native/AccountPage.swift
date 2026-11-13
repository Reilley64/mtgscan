import GoogleSignIn
import UIKit

@MainActor private var accountPage: AccountPage?

@_cdecl("mtgscan_auth_attach")
@MainActor func attachAccount(_ pointer: UnsafeMutableRawPointer) {
  let host = Unmanaged<UIView>.fromOpaque(pointer).takeUnretainedValue()
  let page = AccountPage()
  accountPage = page
  host.addSubview(page)
  host.accessibilityElements = [page]
}

@_cdecl("mtgscan_auth_bounds")
@MainActor func accountBounds(_ x: Double, _ y: Double, _ width: Double, _ height: Double) {
  accountPage?.frame = CGRect(x: x, y: y, width: width, height: height)
}

@_cdecl("mtgscan_auth_text_size")
@MainActor func accountTextSize() -> Double {
  UIFont.preferredFont(forTextStyle: .title2).pointSize
}

@_cdecl("mtgscan_auth_open_url")
@MainActor func openAuthURL(_ value: UnsafePointer<CChar>) {
  guard let url = URL(string: String(cString: value)) else { return }
  _ = GIDSignIn.sharedInstance.handle(url)
}

@MainActor
private final class AccountPage: UIView {
  private let layout = AccountLayout()
  private var controller: SessionController?
  private var provider: NativeSignIn?
  private var collectionPage: CollectionPage?
  private var catalogPage: CatalogPage?
  private var showingCatalog = false
  private var timer: Timer?
  private let idleTimer = TestAppIdleTimer(bundleIdentifier: Bundle.main.bundleIdentifier) {
    UIApplication.shared.isIdleTimerDisabled = $0
  }
  private lazy var authentication = Authentication(
    onApple: { [weak self] in self?.signIn(.apple) },
    onGoogle: { [weak self] in self?.signIn(.google) },
    onSignOut: { [weak self] in
      Task { await self?.controller?.signOut() }
    },
    onRetry: { [weak self] in
      Task { await self?.controller?.resume() }
    })

  init() {
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(authentication)
    if let config = try? PublicConfiguration.load() {
      let provider = NativeSignIn(config: config, presenter: nil)
      self.provider = provider
      let controller = SessionController(
        provider: provider, store: KeychainSessionStore(),
        auth: SupabaseSessionService(config: config), api: AccountAPI(origin: config.apiURL))
      self.controller = controller
      let collection = CollectionController(
        api: SessionCollectionService(
          session: controller, api: CollectionAPI(origin: config.apiURL)))
      let collectionPage = CollectionPage(
        controller: collection,
        onCatalog: { [weak self] in
          self?.endEditing(true)
          self?.showingCatalog = true
          self?.display()
          Task { await self?.catalogPage?.refresh() }
        },
        onSignOut: { [weak controller] in
          Task { await controller?.signOut() }
        })
      self.collectionPage = collectionPage
      addSubview(collectionPage)
      let catalog = CatalogController(
        api: SessionCatalogService(session: controller, api: CatalogAPI(origin: config.apiURL)))
      let catalogPage = CatalogPage(controller: catalog) { [weak self] in
        self?.endEditing(true)
        self?.showingCatalog = false
        self?.display()
      }
      self.catalogPage = catalogPage
      addSubview(catalogPage)
      controller.onAccountChange = { [weak self, weak collection] accountID in
        if let collection, collection.setAccount(accountID), accountID != nil {
          Task { await collection.reload() }
        }
        self?.catalogPage?.setAccount(accountID)
        if accountID == nil { self?.showingCatalog = false }
      }
      controller.onAccountChange?(controller.presentation.accountID)
      controller.onChange = { [weak self] in self?.display() }
    }
    display()
    NotificationCenter.default.addObserver(
      self, selector: #selector(foreground), name: UIApplication.didBecomeActiveNotification,
      object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(background), name: UIApplication.willResignActiveNotification,
      object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification,
      object: nil)
    Task { await controller?.resume() }
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    layout.frame = bounds
    collectionPage?.frame = bounds
    catalogPage?.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { foreground() } else { background() }
  }

  private func signIn(_ selected: Provider) {
    provider?.presenter = window?.rootViewController
    Task { await controller?.signIn(selected) }
  }

  private func display() {
    let accountID = controller?.presentation.accountID
    collectionPage?.isHidden = accountID == nil || showingCatalog
    catalogPage?.isHidden = accountID == nil || !showingCatalog
    layout.isHidden = accountID != nil
    authentication.display(
      controller?.presentation ?? SessionPresentation(), configured: controller != nil)
  }

  @objc private func foreground() {
    idleTimer.setActive(UIApplication.shared.applicationState == .active)
    timer?.invalidate()
    Task {
      await controller?.resume()
      if showingCatalog { await catalogPage?.refresh() }
    }
    timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
      Task { @MainActor in await self?.controller?.refreshIfNeeded() }
    }
  }

  @objc private func background() {
    idleTimer.setActive(false)
    timer?.invalidate()
    timer = nil
  }
}
