import UIKit

@MainActor
final class CommanderArtwork: UIView {
  private let art: CardArtwork
  private let scrim = CAGradientLayer()
  private let outline = CAShapeLayer()
  private let ghost: Bool

  init(uri: String?, images: any CardImages, rounded: Bool) {
    art = CardArtwork(uri: uri, images: images, cropped: true)
    ghost = uri == nil
    super.init(frame: .zero)
    backgroundColor = Tokens.surface
    clipsToBounds = true
    layer.cornerRadius = rounded ? CGFloat(PresentationData.commanderCorner) : 0
    addSubview(art)
    scrim.colors = PresentationData.commanderArtScrim.map {
      UIColor(
        red: $0.rgba[0] / 255, green: $0.rgba[1] / 255, blue: $0.rgba[2] / 255, alpha: $0.rgba[3]
      ).cgColor
    }
    scrim.locations = PresentationData.commanderArtScrim.map { NSNumber(value: $0.location) }
    scrim.startPoint = CGPoint(x: 0, y: 0)
    scrim.endPoint = CGPoint(x: 0, y: 1)
    layer.addSublayer(scrim)
    outline.strokeColor = Tokens.line.cgColor
    outline.fillColor = UIColor.clear.cgColor
    outline.lineDashPattern = [NSNumber(value: Double(Tokens.xs))]
    layer.addSublayer(outline)
    isAccessibilityElement = false
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    art.frame = bounds
    scrim.frame = bounds
    outline.frame = bounds
    outline.isHidden = !ghost
    outline.path = UIBezierPath(roundedRect: bounds, cornerRadius: layer.cornerRadius).cgPath
  }
}

@MainActor
enum DeckControls {
  static func surface(content: UIView, label: String, hint: String?, action: @escaping () -> Void)
    -> UIControl
  {
    let control = UIControl()
    control.isAccessibilityElement = true
    control.accessibilityLabel = label
    control.accessibilityHint = hint
    control.accessibilityTraits = .button
    content.isUserInteractionEnabled = false
    content.translatesAutoresizingMaskIntoConstraints = false
    control.addSubview(content)
    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: control.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: control.trailingAnchor),
      content.topAnchor.constraint(equalTo: control.topAnchor),
      content.bottomAnchor.constraint(equalTo: control.bottomAnchor),
      control.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget),
      control.widthAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget),
    ])
    control.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return control
  }

  static func card(
    uri: String?, name: String, finish: String, images: any CardImages, action: (() -> Void)?
  ) -> UIView {
    let art = CardArtwork(uri: uri, images: images, finish: finish)
    art.heightAnchor.constraint(
      equalTo: art.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio
    ).isActive = true
    guard let action else {
      art.isAccessibilityElement = true
      art.accessibilityLabel = name
      art.accessibilityTraits = .image
      return art
    }
    return surface(content: art, label: name, hint: "Opens the card.", action: action)
  }

  static func more(menu: UIMenu) -> UIButton {
    let button = IconControls.header(label: "More", symbol: "ellipsis")
    button.menu = menu
    button.showsMenuAsPrimaryAction = true
    return button
  }

  static func floatingMenu(title: String, symbol: String, menu: UIMenu) -> UIButton {
    let button = IconControls.floating(label: title, symbol: symbol)
    button.menu = menu
    button.showsMenuAsPrimaryAction = true
    return button
  }

  static func failureAlert(title: String) -> UIAlertController {
    let alert = UIAlertController(
      title: title, message: "Check your connection.", preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    return alert
  }

  static func nameAlert(
    title: String, name: String, save: String, limit: Int, checked: @escaping (String) -> String?,
    action: @escaping (String) -> Void
  ) -> UIAlertController {
    let alert = UIAlertController(title: title, message: "Name your deck.", preferredStyle: .alert)
    alert.addTextField { field in
      field.text = name
      field.placeholder = "Deck name"
      field.accessibilityLabel = "Deck name"
      field.autocapitalizationType = .sentences
    }
    let confirm = UIAlertAction(title: save, style: .default) { [weak alert] _ in
      if let name = checked(alert?.textFields?.first?.text ?? "") { action(name) }
    }
    confirm.isEnabled = checked(name) != nil
    alert.textFields?.first?.addAction(
      UIAction { [weak alert, weak confirm] _ in
        guard let field = alert?.textFields?.first else { return }
        let text = field.text ?? ""
        if text.unicodeScalars.count > limit {
          field.text = String(String.UnicodeScalarView(text.unicodeScalars.prefix(limit)))
        }
        confirm?.isEnabled = checked(field.text ?? "") != nil
      }, for: .editingChanged)
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    alert.addAction(confirm)
    return alert
  }
}
