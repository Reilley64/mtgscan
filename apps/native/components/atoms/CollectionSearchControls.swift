import UIKit

@MainActor
final class CollectionSearchBar: UISearchBar, UISearchBarDelegate {
  var onText: ((String) -> Void)?
  var onSubmit: (() -> Void)?
  var onCancel: (() -> Void)?
  var onBackspace: (() -> Void)?
  var onEditing: ((Bool) -> Void)?

  init() {
    super.init(frame: .zero)
    delegate = self
    placeholder = "Search your collection"
    searchBarStyle = .minimal
    autocapitalizationType = .none
    autocorrectionType = .no
    tintColor = Tokens.primary
    searchTextField.textColor = Tokens.text
    accessibilityLabel = "Search your collection"
    heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
  }

  required init?(coder: NSCoder) { fatalError() }

  func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) { onText?(searchText) }
  func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
    onSubmit?()
    searchTextField.resignFirstResponder()
  }
  func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
    onCancel?()
    searchTextField.resignFirstResponder()
  }
  func searchBarTextDidBeginEditing(_ searchBar: UISearchBar) {
    showsCancelButton = true
    onEditing?(true)
  }
  func searchBarTextDidEndEditing(_ searchBar: UISearchBar) {
    showsCancelButton = false
    onEditing?(false)
  }
  func searchBar(
    _ searchBar: UISearchBar, shouldChangeTextIn range: NSRange, replacementText text: String
  ) -> Bool {
    if (searchBar.text ?? "").isEmpty && text.isEmpty { onBackspace?() }
    return true
  }
}

struct CollectionMenuChoice {
  let title: String
  let selected: Bool
  let action: () -> Void
  var symbol: String? = nil
}

@MainActor
enum CollectionSearchControls {
  static func chip(
    _ text: String, selected: Bool = false, refused: Bool = false, removable: Bool = false,
    action: @escaping () -> Void
  ) -> UIButton {
    let button = AuthControls.button(text, action: action)
    button.isSelected = selected
    button.configuration?.baseForegroundColor =
      refused ? Tokens.danger : selected ? Tokens.primary : Tokens.text
    button.configuration?.baseBackgroundColor = refused ? Tokens.dangerTint : Tokens.surfaceControl
    if removable {
      button.configuration?.image = UIImage(systemName: "xmark")
      button.configuration?.imagePlacement = .trailing
      button.configuration?.imagePadding = Tokens.xs
      button.accessibilityHint = "Removes this chip."
    }
    if selected { button.accessibilityTraits.insert(.selected) }
    button.widthAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    return button
  }

  static func filters(count: Int, action: @escaping () -> Void) -> UIButton {
    let button = chip("Filters", action: action)
    button.configuration?.image = UIImage(systemName: "line.3.horizontal.decrease")
    button.configuration?.title = nil
    button.accessibilityLabel = count > 0 ? "Filters, \(count)" : "Filters"
    if count > 0 {
      let badge = AuthControls.label(String(count), style: .caption2)
      badge.textColor = Tokens.badge
      badge.isAccessibilityElement = false
      badge.translatesAutoresizingMaskIntoConstraints = false
      button.addSubview(badge)
      NSLayoutConstraint.activate([
        badge.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -Tokens.xs),
        badge.topAnchor.constraint(equalTo: button.topAnchor, constant: Tokens.xs),
      ])
    }
    return button
  }

  static func menu(label: String, symbol: String, active: Bool, choices: [CollectionMenuChoice])
    -> UIButton
  {
    var configuration: UIButton.Configuration
    if #available(iOS 26.0, *) { configuration = .glass() } else { configuration = .filled() }
    configuration.image = UIImage(systemName: symbol)
    configuration.baseForegroundColor = active ? Tokens.primary : Tokens.text
    configuration.baseBackgroundColor = Tokens.surfaceControl
    let button = UIButton(configuration: configuration)
    button.accessibilityLabel = label
    button.menu = UIMenu(
      title: "Sort by",
      children: choices.map { choice in
        UIAction(
          title: choice.title, image: choice.symbol.flatMap { UIImage(systemName: $0) },
          state: choice.selected ? .on : .off
        ) { _ in choice.action() }
      })
    button.showsMenuAsPrimaryAction = true
    button.widthAnchor.constraint(equalToConstant: Tokens.floatingButton).isActive = true
    button.heightAnchor.constraint(equalToConstant: Tokens.floatingButton).isActive = true
    return button
  }

  static func basicLand(uri: String?, label: String, images: any CardImages) -> UIView {
    let image = CardArtwork(uri: uri, images: images)
    let badge = AuthControls.label("∞", style: .caption2)
    badge.textColor = Tokens.badge
    badge.translatesAutoresizingMaskIntoConstraints = false
    image.addSubview(badge)
    image.isAccessibilityElement = true
    image.accessibilityLabel = "\(label), basic land, unlimited"
    image.accessibilityTraits = .image
    NSLayoutConstraint.activate([
      image.heightAnchor.constraint(
        equalTo: image.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio),
      badge.trailingAnchor.constraint(equalTo: image.trailingAnchor, constant: -Tokens.xs),
      badge.topAnchor.constraint(equalTo: image.topAnchor, constant: Tokens.xs),
    ])
    return image
  }
}
