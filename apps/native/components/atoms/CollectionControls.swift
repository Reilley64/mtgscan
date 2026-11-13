import UIKit

@MainActor
final class CardArtwork: UIView {
  private let imageView = UIImageView()
  private let sheen = CAGradientLayer()
  private var load: Task<Void, Never>?

  init(uri: String?, images: any CardImages, finish: String = "nonfoil", blur: CGFloat = 0) {
    super.init(frame: .zero)
    backgroundColor = blur > 0 ? .clear : Tokens.line
    clipsToBounds = true
    imageView.contentMode = blur > 0 ? .scaleAspectFill : .scaleAspectFit
    addSubview(imageView)
    let stops = finish == "foil" ? PresentationData.foilSheen : PresentationData.etchedSheen
    sheen.colors = stops.map { stop in
      UIColor(
        red: stop.rgba[0] / 255, green: stop.rgba[1] / 255, blue: stop.rgba[2] / 255,
        alpha: stop.rgba[3]
      ).cgColor
    }
    sheen.locations = stops.map { NSNumber(value: $0.location) }
    sheen.startPoint = CGPoint(x: 0, y: 0)
    sheen.endPoint = CGPoint(x: 1, y: 1)
    sheen.opacity = finish == "nonfoil" ? 0 : Float(Tokens.sheenOpacity)
    layer.addSublayer(sheen)
    if let uri {
      load = Task { [weak self] in
        let image = await images.image(uri: uri, blur: blur)
        guard !Task.isCancelled else { return }
        self?.imageView.image = image
      }
    }
    isAccessibilityElement = false
  }

  required init?(coder: NSCoder) { fatalError() }
  deinit { load?.cancel() }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
    sheen.frame = bounds
    layer.cornerRadius = bounds.width * PresentationData.printedCardCornerPerWidth
  }
}

@MainActor
enum CollectionControls {
  static func heading(_ text: String) -> UILabel {
    let label = AuthControls.label(text, style: .headline)
    label.textColor = Tokens.primary
    label.accessibilityTraits.insert(.header)
    return label
  }

  static func row(_ title: String, value: String, spoken: String? = nil, hint: String? = nil)
    -> UILabel
  {
    let label = AuthControls.label("\(title)  \(value)")
    label.accessibilityLabel = "\(title), \(spoken ?? value)"
    label.accessibilityHint = hint
    return label
  }

  static func activity(_ label: String) -> UIActivityIndicatorView {
    let activity = UIActivityIndicatorView(style: .medium)
    activity.accessibilityLabel = label
    activity.isAccessibilityElement = true
    activity.startAnimating()
    return activity
  }

  static func tile(
    uri: String?, meta: String, price: String, label: String, finish: String,
    protected: Bool, held: Bool, stale: Bool, images: any CardImages, action: @escaping () -> Void
  ) -> UIControl {
    let control = UIControl()
    control.isAccessibilityElement = true
    control.accessibilityLabel = label
    control.accessibilityHint =
      stale ? "The price may be out of date. Opens the card." : "Opens the card."
    control.accessibilityTraits = .button
    let image = CardArtwork(uri: uri, images: images, finish: finish)
    let caption = AuthControls.label(meta, style: .caption2)
    caption.textColor = Tokens.textMuted
    caption.textAlignment = .center
    let metaText = NSMutableAttributedString(string: "")
    for (visible, name, color) in [
      (protected, "shield.fill", Tokens.warning), (held, "bookmark.fill", Tokens.info),
    ] where visible {
      let attachment = NSTextAttachment()
      attachment.image = UIImage(systemName: name)?.withTintColor(
        color, renderingMode: .alwaysOriginal)
      attachment.bounds = CGRect(
        x: 0, y: 0, width: caption.font.pointSize, height: caption.font.pointSize)
      metaText.append(NSAttributedString(attachment: attachment))
      metaText.append(NSAttributedString(string: " "))
    }
    metaText.append(NSAttributedString(string: meta))
    caption.attributedText = metaText
    let amount = AuthControls.label(stale ? "◷ \(price)" : price, style: .caption2)
    amount.textAlignment = .center
    let stack = UIStackView(arrangedSubviews: [image, caption, amount])
    stack.axis = .vertical
    stack.spacing = Tokens.xs
    stack.isUserInteractionEnabled = false
    stack.translatesAutoresizingMaskIntoConstraints = false
    control.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: control.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: control.trailingAnchor),
      stack.topAnchor.constraint(equalTo: control.topAnchor),
      stack.bottomAnchor.constraint(equalTo: control.bottomAnchor),
      image.heightAnchor.constraint(
        equalTo: image.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio),
      control.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget),
      control.widthAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget),
    ])
    control.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return control
  }

  static func skeleton() -> UIStackView {
    let rows = UIStackView()
    rows.axis = .vertical
    rows.spacing = Tokens.sm
    for _ in 0..<3 {
      let row = UIStackView()
      row.spacing = Tokens.sm
      row.distribution = .fillEqually
      for _ in 0..<3 {
        let tile = UIView()
        tile.backgroundColor = Tokens.line
        tile.layer.cornerRadius = Tokens.corner
        tile.heightAnchor.constraint(
          equalTo: tile.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio
        ).isActive = true
        row.addArrangedSubview(tile)
      }
      rows.addArrangedSubview(row)
    }
    rows.isAccessibilityElement = true
    rows.accessibilityLabel = "Loading collection"
    if !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(
        withDuration: 0.8, delay: 0, options: [.repeat, .autoreverse, .allowUserInteraction]
      ) {
        rows.alpha = Tokens.dimmed
      }
    }
    return rows
  }
}
