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
      self.init(controller: controller, collection: collection, gallery: gallery)
      self.provider = provider
    } else {
      self.init(controller: nil, collection: nil, gallery: nil)
    }
  }

  init(
    controller: SessionController?, collection: CollectionController?, gallery: GalleryFeature?,
    images: (any CardImages)? = nil
  ) {
    self.controller = controller
    self.gallery = gallery
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(layout)
    layout.content.addArrangedSubview(authentication)
    if let controller, let collection {
      collection.bind(to: controller)
      let page = CollectionPage(controller: collection, images: images, gallery: gallery?.view) {
        [weak controller] in
        Task { await controller?.signOut() }
      }
      collectionPage = page
      addSubview(page)
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
    collectionPage?.isHidden = accountID == nil
    layout.isHidden = accountID != nil
    authentication.display(
      controller?.presentation ?? SessionPresentation(), configured: controller != nil)
    gallery?.sessionChanged(signedIn: controller?.presentation.accountID != nil)
  }

  @objc private func foreground() {
    idleTimer.setActive(UIApplication.shared.applicationState == .active)
    timer?.invalidate()
    Task {
      let hadAccount = controller?.presentation.accountID != nil
      await controller?.resume()
      if hadAccount { gallery?.foreground() }
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
