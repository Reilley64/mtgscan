import UIKit

@MainActor
final class CatalogPage: UIView {
  private let controller: CatalogController
  private let layout = AccountLayout()
  private var search: CatalogSearch
  private let browser: CatalogBrowser
  private let close: UIButton
  private var accountID: String?
  private var selectedOracleID: String?

  init(
    controller: CatalogController, images: (any CardImages)? = nil, onClose: @escaping () -> Void
  ) {
    self.controller = controller
    self.search = CatalogSearch(controller: controller)
    self.browser = CatalogBrowser(controller: controller, images: images ?? HTTPSCardImages())
    self.close = AuthControls.button("Collection", action: onClose)
    super.init(frame: .zero)
    backgroundColor = Tokens.background
    addSubview(close)
    addSubview(layout)
    layout.keyboardDismissMode = .interactive
    layout.content.addArrangedSubview(search)
    layout.content.addArrangedSubview(browser)
    controller.onChange = { [weak self] in self?.display() }
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: CatalogPage, _: UITraitCollection) in view.display()
    }
    display()
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    close.frame = CGRect(x: 0, y: 0, width: bounds.width, height: Tokens.touchTarget)
    layout.frame = CGRect(
      x: 0, y: Tokens.touchTarget, width: bounds.width,
      height: max(0, bounds.height - Tokens.touchTarget))
  }

  func setAccount(_ accountID: String?) {
    if self.accountID != accountID {
      self.accountID = accountID
      layout.content.removeArrangedSubview(search)
      search.removeFromSuperview()
      search = CatalogSearch(controller: controller)
      layout.content.insertArrangedSubview(search, at: 0)
    }
    controller.setAccount(accountID)
  }

  func refresh() async { await controller.reload() }

  private func display() {
    let state = controller.presentation
    search.isHidden = state.selectedOracleID != nil
    search.display(state)
    browser.display(state)
    if selectedOracleID != state.selectedOracleID {
      if state.selectedOracleID != nil { endEditing(true) }
      selectedOracleID = state.selectedOracleID
      layout.setContentOffset(.zero, animated: false)
    }
  }
}
