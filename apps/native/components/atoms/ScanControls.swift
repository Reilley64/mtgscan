import UIKit

@MainActor
enum ScanControls {
  static func closeItem(_ action: @escaping () -> Void) -> UIBarButtonItem {
    UIBarButtonItem(systemItem: .close, primaryAction: UIAction { _ in action() })
  }

  static func removeAllConfirmation(count: Int, action: @escaping () -> Void) -> UIAlertController {
    let alert = UIAlertController(
      title: count == 1 ? "Remove 1 scan?" : "Remove all \(count) scans?",
      message: count == 1
        ? "It will not be added to your collection." : "They will not be added to your collection.",
      preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    alert.addAction(UIAlertAction(title: "Remove", style: .destructive) { _ in action() })
    return alert
  }

  static func choice(_ title: String, selected: Bool, action: @escaping () -> Void) -> UIButton {
    let button = AuthControls.button(title, action: action)
    button.configuration?.baseBackgroundColor = selected ? Tokens.primary : Tokens.surfaceControl
    button.configuration?.baseForegroundColor = selected ? Tokens.background : Tokens.text
    if selected { button.accessibilityTraits.insert(.selected) }
    return button
  }

  static func destructive(_ title: String, action: @escaping () -> Void) -> UIButton {
    let button = AuthControls.button(title, action: action)
    button.configuration?.baseForegroundColor = Tokens.danger
    return button
  }

  static func latest(
    uri: String?, title: String, meta: String, images: any CardImages,
    action: (() -> Void)?
  ) -> UIControl {
    let control = UIControl()
    control.backgroundColor = Tokens.surfaceControl
    control.layer.cornerRadius = Tokens.corner
    control.isAccessibilityElement = true
    control.accessibilityLabel = "\(title), \(meta)"
    control.accessibilityTraits = action == nil ? .staticText : .button
    let artwork = CardArtwork(uri: uri, images: images)
    let text = UIStackView(arrangedSubviews: [
      AuthControls.label(title, style: .headline), AuthControls.label(meta, style: .caption1),
    ])
    text.axis = .vertical
    let row = UIStackView(arrangedSubviews: [artwork, text])
    row.spacing = Tokens.sm
    row.alignment = .center
    row.isUserInteractionEnabled = false
    row.translatesAutoresizingMaskIntoConstraints = false
    control.addSubview(row)
    NSLayoutConstraint.activate([
      row.leadingAnchor.constraint(equalTo: control.leadingAnchor, constant: Tokens.sm),
      row.trailingAnchor.constraint(equalTo: control.trailingAnchor, constant: -Tokens.sm),
      row.topAnchor.constraint(equalTo: control.topAnchor, constant: Tokens.sm),
      row.bottomAnchor.constraint(equalTo: control.bottomAnchor, constant: -Tokens.sm),
      artwork.widthAnchor.constraint(equalToConstant: Tokens.cardThumbnailWidth),
      artwork.heightAnchor.constraint(
        equalTo: artwork.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio),
      control.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget),
    ])
    if let action { control.addAction(UIAction { _ in action() }, for: .touchUpInside) }
    return control
  }

  static func printing(
    uri: String?, caption: String, label: String, selected: Bool,
    images: any CardImages, action: @escaping () -> Void
  ) -> UIView {
    let tile = CollectionControls.tile(
      uri: uri, meta: caption, price: "", label: label,
      finish: "nonfoil", protected: false, held: false, stale: false, images: images, action: action
    )
    if selected {
      tile.layer.borderColor = Tokens.primary.cgColor
      tile.layer.borderWidth = 2
      tile.accessibilityTraits.insert(.selected)
    }
    return tile
  }
}
