import UIKit

@MainActor
final class SearchField: UIStackView {
  private let input: UITextField
  init(_ label: String, value: String = "", onChange: @escaping (String) -> Void) {
    self.input = SearchControls.field(label, value: value, onChange: onChange)
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.xs
    addArrangedSubview(AuthControls.label(label, style: .caption1))
    addArrangedSubview(input)
  }

  required init(coder: NSCoder) { fatalError() }

  func focus() { input.becomeFirstResponder() }

  func show(_ value: String) {
    if !input.isFirstResponder { input.text = value }
  }
}
