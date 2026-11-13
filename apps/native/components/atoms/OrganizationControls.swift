import UIKit

@MainActor
final class UserTagField: UITextField, UITextFieldDelegate {
  var onText: ((String) -> Void)?
  var onSubmit: (() -> Void)?

  init(placeholder: String, text: String = "") {
    super.init(frame: .zero)
    self.placeholder = placeholder
    self.text = text
    accessibilityLabel = placeholder
    font = UIFont.preferredFont(forTextStyle: .body)
    adjustsFontForContentSizeCategory = true
    textColor = Tokens.text
    backgroundColor = Tokens.surfaceControl
    borderStyle = .roundedRect
    returnKeyType = .done
    delegate = self
    heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        onText?(self.text ?? "")
      }, for: .editingChanged)
  }

  required init?(coder: NSCoder) { fatalError() }

  func textField(
    _ textField: UITextField, shouldChangeCharactersIn range: NSRange,
    replacementString string: String
  ) -> Bool {
    guard let current = textField.text, let range = Range(range, in: current) else { return false }
    return current.replacingCharacters(in: range, with: string).unicodeScalars.count <= 64
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    onSubmit?()
    resignFirstResponder()
    return true
  }
}

struct OrganizationMenuItem {
  let title: String
  let symbol: String
  var destructive = false
  let action: () -> Void
}

@MainActor
enum OrganizationControls {
  static func more(label: String = "More", enabled: Bool, items: [OrganizationMenuItem]) -> UIButton
  {
    var configuration = UIButton.Configuration.plain()
    configuration.image = UIImage(systemName: "ellipsis")
    configuration.baseForegroundColor = Tokens.textMuted
    let button = UIButton(configuration: configuration)
    button.accessibilityLabel = label
    button.isEnabled = enabled
    button.showsMenuAsPrimaryAction = true
    button.menu = UIMenu(
      children: items.map { item in
        UIAction(
          title: item.title, image: UIImage(systemName: item.symbol),
          attributes: item.destructive ? .destructive : []
        ) { _ in item.action() }
      })
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    button.widthAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    return button
  }

  static func action(
    _ title: String, symbol: String? = nil, danger: Bool = false, enabled: Bool = true,
    action: @escaping () -> Void
  ) -> UIButton {
    let button = AuthControls.button(title, action: action)
    button.configuration?.image = symbol.flatMap { UIImage(systemName: $0) }
    button.configuration?.imagePadding = Tokens.sm
    button.configuration?.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(
      pointSize: Tokens.rowSymbol)
    button.configuration?.baseForegroundColor = danger ? Tokens.danger : Tokens.primary
    button.isEnabled = enabled
    return button
  }

  static func tag(
    _ name: String, count: Int, selected: Bool, enabled: Bool, action: @escaping () -> Void
  ) -> UIButton {
    let button = self.action(
      name, symbol: selected ? "checkmark.circle.fill" : "circle", enabled: enabled, action: action)
    button.configuration?.subtitle = "\(count) \(count == 1 ? "copy" : "copies")"
    button.configuration?.titleLineBreakMode = .byWordWrapping
    button.accessibilityLabel = "\(name), \(count) \(count == 1 ? "copy" : "copies")"
    if selected { button.accessibilityTraits.insert(.selected) }
    return button
  }

  static func alert(title: String, presenter: UIViewController) {
    let alert = UIAlertController(
      title: title, message: "Check your connection.", preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    presenter.present(alert, animated: true)
  }
}
