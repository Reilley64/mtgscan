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
final class AccountPage: UIView {
  private let layout = AccountLayout()
  private var controller: SessionController?
  private var provider: NativeSignIn?
  private var collectionPage: CollectionPage?
  private var deckPage: DeckPage?
  private var collection: CollectionController?
  private var decks: DeckController?
  private var selectedTab = 0
  private var collectionPushed = false
  private var deckPushed = false
  private var deckReturnTab: Int?
  private let tabs = NavigationTabs(choices: [
    ("Collection", "rectangle.grid.3x2"), ("Decks", "rectangle.stack"),
  ])
  private var catalogPage: CatalogPage?
  private var showingCatalog = false
  private var timer: Timer?
  private var gallery: GalleryFeature?
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

  convenience init() {
    if let config = try? PublicConfiguration.load() {
      let provider = NativeSignIn(config: config, presenter: nil)
      let controller = SessionController(
        provider: provider, store: KeychainSessionStore(),
        auth: SupabaseSessionService(config: config), api: AccountAPI(origin: config.apiURL))
      let collection = CollectionController(
        api: SessionCollectionService(
          session: controller, api: CollectionAPI(origin: config.apiURL)))
      let gallery = GalleryFeature(config: config) { [weak controller] in
        guard let controller else { throw SessionFailure.unauthenticated }
        return try await controller.accessTokenForRequest()
      }
      let catalog = CatalogController(
        api: SessionCatalogService(session: controller, api: CatalogAPI(origin: config.apiURL)))
      let decks = DeckController(
        api: SessionDeckService(session: controller, api: DeckAPI(origin: config.apiURL)))
      let copies = CollectionController(
        api: SessionCollectionService(
          session: controller, api: CollectionAPI(origin: config.apiURL)))
      self.init(
        controller: controller, collection: collection, gallery: gallery, catalog: catalog,
        decks: decks, copies: copies)
      self.provider = provider
    } else {
      self.init(controller: nil, collection: nil, gallery: nil)
    }
  }

  init(
    controller: SessionController?, collection: CollectionController?, gallery: GalleryFeature?,
    catalog: CatalogController? = nil, decks: DeckController? = nil,
    copies: CollectionController? = nil, images: (any CardImages)? = nil
  ) {
    self.controller = controller
    self.collection = collection
    self.decks = decks
    self.gallery = gallery
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(authentication)
    if let controller, let collection {
      let collectionPage = CollectionPage(
        controller: collection, images: images, gallery: gallery?.view,
        onDeck: decks == nil
          ? nil
          : { [weak self, weak decks] id in
            self?.deckReturnTab = 0
            self?.selectTab(1)
            Task { await decks?.open(id) }
          },
        onCatalog: catalog == nil
          ? nil
          : { [weak self] in
            self?.endEditing(true)
            self?.showingCatalog = true
            self?.display()
            Task { await self?.catalogPage?.refresh() }
          },
        onSignOut: { [weak controller] in
          Task { await controller?.signOut() }
        })
      self.collectionPage = collectionPage
      collectionPage.onNavigationChange = { [weak self] pushed in
        self?.collectionPushed = pushed
        self?.display()
      }
      addSubview(collectionPage)
      if let decks, let copies {
        let deckPage = DeckPage(
          controller: decks, copies: copies, images: images,
          onCollection: { [weak self, weak collection] in
            Task {
              await collection?.closeCopy()
              self?.selectTab(0)
            }
          },
          onSignOut: { [weak controller] in Task { await controller?.signOut() } })
        self.deckPage = deckPage
        deckPage.onNavigationChange = { [weak self] pushed in
          guard let self else { return }
          self.deckPushed = pushed
          if !pushed, let origin = self.deckReturnTab {
            self.deckReturnTab = nil
            self.selectTab(origin)
          } else {
            self.display()
          }
        }
        addSubview(deckPage)
      }
      if let catalog {
        let catalogPage = CatalogPage(controller: catalog, images: images) { [weak self] in
          self?.endEditing(true)
          self?.showingCatalog = false
          self?.display()
          Task { await self?.collectionPage?.refresh() }
        }
        self.catalogPage = catalogPage
        addSubview(catalogPage)
      }
      addSubview(tabs)
      tabs.onSelect = { [weak self] index in self?.selectTab(index) }
      controller.onAccountChange = {
        [weak self, weak collection, weak decks, weak copies] accountID in
        let changed = collection?.setAccount(accountID) == true
        if changed { self?.deckReturnTab = nil }
        decks?.setAccount(accountID)
        copies?.setAccount(accountID)
        if changed, accountID != nil {
          Task { await collection?.reload() }
          Task { await decks?.reload() }
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
    let tabHeight = tabs.isHidden ? 0 : tabs.sizeThatFits(bounds.size).height
    tabs.frame = CGRect(
      x: 0, y: max(0, bounds.height - tabHeight), width: bounds.width, height: tabHeight)
    let content = CGRect(x: 0, y: 0, width: bounds.width, height: max(0, bounds.height - tabHeight))
    collectionPage?.frame = content
    deckPage?.frame = content
    catalogPage?.frame = content
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
    collectionPage?.isHidden = accountID == nil || selectedTab != 0 || showingCatalog
    deckPage?.isHidden = accountID == nil || selectedTab != 1
    catalogPage?.isHidden = accountID == nil || selectedTab != 0 || !showingCatalog
    tabs.isHidden =
      accountID == nil || deckPage == nil || showingCatalog
      || (selectedTab == 0 ? collectionPushed : deckPushed)
    if accountID == nil {
      selectedTab = 0
      deckReturnTab = nil
      tabs.select(0)
    }
    setNeedsLayout()
    layout.isHidden = accountID != nil
    authentication.display(
      controller?.presentation ?? SessionPresentation(), configured: controller != nil)
    gallery?.sessionChanged(signedIn: controller?.presentation.accountID != nil)
  }

  private func selectTab(_ index: Int) {
    selectedTab = index
    tabs.select(index)
    display()
    Task {
      if index == 0 { await collection?.reload() } else { await decks?.reload() }
    }
  }

  @objc private func foreground() {
    idleTimer.setActive(UIApplication.shared.applicationState == .active)
    timer?.invalidate()
    Task {
      let hadAccount = controller?.presentation.accountID != nil
      await controller?.resume()
      if hadAccount { gallery?.foreground() }
      if selectedTab == 1 {
        await decks?.reload()
      } else if showingCatalog {
        await catalogPage?.refresh()
      } else {
        await collectionPage?.refresh()
      }
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
