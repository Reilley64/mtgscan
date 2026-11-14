import UIKit

@MainActor
enum SearchControls {
  static func field(_ label: String, value: String = "", onChange: @escaping (String) -> Void)
    -> UITextField
  {
    let field = UITextField()
    field.text = value
    field.placeholder = label
    field.accessibilityLabel = label
    field.font = UIFont.preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    field.textColor = Tokens.text
    field.tintColor = Tokens.primary
    field.backgroundColor = Tokens.surfaceControl
    field.borderStyle = .roundedRect
    field.autocorrectionType = .no
    field.autocapitalizationType = .none
    field.clearButtonMode = .whileEditing
    field.returnKeyType = .done
    field.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    field.addAction(
      UIAction { [weak field] _ in onChange(field?.text ?? "") }, for: .editingChanged)
    field.addAction(
      UIAction { [weak field] _ in field?.resignFirstResponder() }, for: .editingDidEndOnExit)
    return field
  }

  static func choice(
    _ label: String, options: [(String, String)], selected: String?,
    onSelect: @escaping (String) -> Void
  ) -> UIButton {
    let button = AuthControls.button(label, action: {})
    button.showsMenuAsPrimaryAction = true
    button.menu = UIMenu(
      children: options.map { value, title in
        UIAction(title: title, state: value == selected ? .on : .off) { [weak button] _ in
          button?.configuration?.title = "\(label): \(title)"
          button?.accessibilityLabel = "\(label): \(title)"
          for case let action as UIAction in button?.menu?.children ?? [] {
            action.state = action.title == title ? .on : .off
          }
          onSelect(value)
        }
      })
    if let title = options.first(where: { $0.0 == selected })?.1 {
      button.configuration?.title = "\(label): \(title)"
      button.accessibilityLabel = "\(label): \(title)"
    }
    return button
  }
}
