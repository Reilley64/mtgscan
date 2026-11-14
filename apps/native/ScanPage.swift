import UIKit

@MainActor
final class ScanPage: UIView, UIAdaptivePresentationControllerDelegate {
  private let review: ScanReviewController
  private let capture: ScanCaptureController
  private let choices: ScanChoicesController
  private let images: any CardImages
  private let preview: UIView
  private let latest = ScanLatest()
  private let status = UIStackView()
  private let top = UIStackView()
  private var visible = false
  private var galleryReady = false
  private var sheet: UINavigationController?
  private var screens: [(UIViewController, ScanReviewScreen, ScanReviewBrowser)] = []
  private var requestedArtwork: Set<String> = []
  var onClose: (() -> Void)?

  init(
    review: ScanReviewController, capture: ScanCaptureController,
    choices: ScanChoicesController, preview: UIView, images: any CardImages
  ) {
    self.review = review
    self.capture = capture
    self.choices = choices
    self.preview = preview
    self.images = images
    super.init(frame: .zero)
    backgroundColor = Tokens.cameraOff
    addSubview(preview)
    status.axis = .vertical
    status.spacing = Tokens.sm
    addSubview(status)
    addSubview(top)
    addSubview(latest)
    for view in [top, status, latest] { view.translatesAutoresizingMaskIntoConstraints = false }
    NSLayoutConstraint.activate([
      top.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: Tokens.lg),
      top.trailingAnchor.constraint(
        equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -Tokens.lg),
      top.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: Tokens.sm),
      latest.leadingAnchor.constraint(equalTo: top.leadingAnchor),
      latest.trailingAnchor.constraint(equalTo: top.trailingAnchor),
      latest.bottomAnchor.constraint(
        equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -Tokens.lg),
      status.leadingAnchor.constraint(equalTo: top.leadingAnchor),
      status.trailingAnchor.constraint(equalTo: top.trailingAnchor),
      status.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
    top.spacing = Tokens.sm
    review.onChange = { [weak self] in
      self?.display()
      self?.fetchArtwork()
    }
    choices.onChange = { [weak self] in self?.display() }
    capture.onChange = { [weak self] in self?.display() }
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: ScanPage, _: UITraitCollection) in view.display()
    }
    display()
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
  }

  func setAccount(_ accountID: String?) {
    let changed = review.accountID != accountID
    if changed {
      sheet?.dismiss(animated: false)
      sheet = nil
      screens = []
      requestedArtwork = []
    }
    choices.setAccount(accountID)
    review.setAccount(accountID)
    display()
    fetchArtwork()
  }

  func setVisible(_ visible: Bool, galleryReady: Bool) {
    guard self.visible != visible || self.galleryReady != galleryReady else { return }
    self.visible = visible
    self.galleryReady = galleryReady
    refresh()
  }

  func refresh() {
    let active = visible && sheet == nil && UIApplication.shared.applicationState == .active
    Task { await capture.setActive(active, galleryReady: galleryReady) }
  }

  func background() { Task { await capture.setActive(false, galleryReady: galleryReady) } }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    sheet = nil
    screens = []
    refresh()
  }

  private func display() {
    for view in top.arrangedSubviews { view.removeFromSuperview() }
    top.addArrangedSubview(AuthControls.button("Collection") { [weak self] in self?.onClose?() })
    let count = review.batch.scans.count
    let batch = AuthControls.button(count == 0 ? "Scan batch" : "Scan batch, \(count)") {
      [weak self] in self?.open(.batch)
    }
    top.addArrangedSubview(batch)
    for view in status.arrangedSubviews { view.removeFromSuperview() }
    switch capture.state {
    case .unavailable:
      status.addArrangedSubview(AuthControls.label("Camera not available", style: .headline))
      status.addArrangedSubview(AuthControls.label("This device has no camera."))
    case .denied:
      status.addArrangedSubview(AuthControls.label("Camera access is off", style: .headline))
      status.addArrangedSubview(AuthControls.label("Turn it on in Settings to scan cards."))
      status.addArrangedSubview(
        AuthControls.button("Open Settings") {
          if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
          }
        })
    case .stopped:
      status.addArrangedSubview(AuthControls.label("Camera stopped."))
      status.addArrangedSubview(
        AuthControls.button("Try again") { [weak self] in
          guard let self else { return }
          Task { await self.capture.retry(galleryReady: self.galleryReady) }
        })
    case .galleryMissing:
      status.addArrangedSubview(
        AuthControls.label("The scanner needs the gallery to recognize cards."))
      status.addArrangedSubview(
        AuthControls.button("Gallery download") { [weak self] in self?.onClose?() })
    default: break
    }
    if review.storageState != .ready {
      status.addArrangedSubview(
        AuthControls.label(
          review.storageState == .loadFailed
            ? "Could not read your scans. Your saved scans are kept."
            : "Could not save your scans. Keep the app open and try again."))
      status.addArrangedSubview(
        AuthControls.button("Try again") { [weak self] in self?.review.retryStorage() })
    }
    latest.display(
      review: review, artwork: choices.artwork, images: images,
      onDetails: { [weak self] id in
        self?.open(
          self?.review.batch.scans.contains(where: { $0.scanId == id }) == true
            ? .details(id) : .names(id))
      }, onCondition: { [weak self] in self?.open(.condition($0)) },
      onPrintings: { [weak self] id in
        guard let self, let scan = self.review.batch.scans.first(where: { $0.scanId == id }) else {
          return
        }
        self.open(.printings(id, scan.printing.oracleId, true))
      }, onLanguage: { [weak self] in self?.open(.language($0)) },
      onAddCopy: { [weak self] id in
        self?.review.addCopy(id)
        self?.onAddCopy?()
      })
    if let sheet {
      screens.removeAll { entry in !sheet.viewControllers.contains(where: { $0 === entry.0 }) }
    }
    for (page, screen, browser) in screens {
      if case .batch = screen { page.title = "\(count) \(count == 1 ? "card" : "cards") scanned" }
      browser.display(
        screen, review: review, choices: choices, images: images,
        navigate: { [weak self] in self?.open($0) },
        choose: { [weak self] printing, id, change in
          self?.review.choose(printing, scanID: id, change: change)
          if change == "name_search" {
            self?.showChosenDetails(id)
          } else if change != "other_options" {
            self?.backOrClose()
          }
        },
        remove: { [weak self] id in
          self?.review.remove(id)
          self?.backOrClose()
        }, removeAll: { [weak self] in self?.confirmRemoveAll() },
        retry: { [weak self] in self?.retry(screen) },
        selectValue: { [weak self] in self?.backOrClose() })
    }
  }

  var onAddCopy: (() -> Void)?

  private func open(_ screen: ScanReviewScreen) {
    guard let presenter = window?.rootViewController else { return }
    let page = UIViewController()
    page.view.backgroundColor = Tokens.background
    let layout = AccountLayout()
    let browser = ScanReviewBrowser()
    layout.content.addArrangedSubview(browser)
    layout.translatesAutoresizingMaskIntoConstraints = false
    page.view.addSubview(layout)
    NSLayoutConstraint.activate([
      layout.leadingAnchor.constraint(
        equalTo: page.view.safeAreaLayoutGuide.leadingAnchor, constant: Tokens.lg),
      layout.trailingAnchor.constraint(
        equalTo: page.view.safeAreaLayoutGuide.trailingAnchor, constant: -Tokens.lg),
      layout.topAnchor.constraint(equalTo: page.view.safeAreaLayoutGuide.topAnchor),
      layout.bottomAnchor.constraint(equalTo: page.view.keyboardLayoutGuide.topAnchor),
    ])
    page.navigationItem.rightBarButtonItem = ScanControls.closeItem { [weak self] in
      self?.closeReview()
    }
    switch screen {
    case .batch: break
    case .details: page.title = "Scan"
    case .names: page.title = "Card name"
    case .printings: page.title = "Card printings"
    case .condition: page.title = "Condition"
    case .language: page.title = "Language"
    }
    if let sheet {
      sheet.pushViewController(page, animated: true)
    } else {
      let navigation = UINavigationController(rootViewController: page)
      navigation.modalPresentationStyle = .pageSheet
      navigation.sheetPresentationController?.detents = [.large()]
      navigation.sheetPresentationController?.prefersGrabberVisible = true
      sheet = navigation
      navigation.presentationController?.delegate = self
      presenter.present(navigation, animated: true)
      refresh()
    }
    screens.append((page, screen, browser))
    display()
    if case .names = screen { DispatchQueue.main.async { browser.focusName() } }
    if case .printings(let id, let oracleID, let picker) = screen {
      let scan = picker ? review.batch.scans.first(where: { $0.scanId == id }) : nil
      Task {
        await choices.loadPrintings(oracleID, scan: scan)
        await choices.loadArtwork(choices.printings)
      }
    }
    fetchArtwork()
  }

  private func backOrClose() {
    if (sheet?.viewControllers.count ?? 0) > 1 {
      sheet?.popViewController(animated: true)
    } else {
      closeReview()
    }
  }

  private func showChosenDetails(_ id: String) {
    let batchPage = screens.first.flatMap { entry -> UIViewController? in
      if case .batch = entry.1 { return entry.0 }
      return nil
    }
    open(.details(id))
    guard let selected = sheet?.topViewController else { return }
    sheet?.setViewControllers((batchPage.map { [$0] } ?? []) + [selected], animated: false)
    display()
  }

  private func retry(_ screen: ScanReviewScreen) {
    Task {
      switch screen {
      case .names: await choices.search(choices.searchText)
      case .printings(let id, let oracleID, let picker):
        await choices.loadPrintings(
          oracleID, scan: picker ? review.batch.scans.first(where: { $0.scanId == id }) : nil)
      default: break
      }
      await choices.loadArtwork(
        choices.printings + review.batch.scans.flatMap { [$0.printing] + $0.options })
    }
  }

  private func closeReview() {
    sheet?.dismiss(animated: true)
    sheet = nil
    screens = []
    refresh()
  }

  private func confirmRemoveAll() {
    let alert = ScanControls.removeAllConfirmation(count: review.batch.scans.count) { [weak self] in
      self?.review.removeAll()
      self?.closeReview()
    }
    sheet?.topViewController?.present(alert, animated: true)
  }

  private func fetchArtwork() {
    var printings = review.batch.scans.flatMap { [$0.printing] + $0.options }
    if case .basicLand(let printing) = review.latest { printings.append(printing) }
    let pending = printings.filter { requestedArtwork.insert($0.printingId).inserted }
    guard !pending.isEmpty else { return }
    Task { await choices.loadArtwork(pending) }
  }
}
