import UIKit

@MainActor
final class FinishViewControl: UIStackView {
  init(labels: [String], selected: Int, action: @escaping (Int) -> Void) {
    super.init(frame: .zero)
    spacing = Tokens.xs
    distribution = .fillEqually
    for (index, label) in labels.enumerated() {
      let button = AuthControls.button(label) { action(index) }
      button.titleLabel?.numberOfLines = 0
      button.titleLabel?.adjustsFontForContentSizeCategory = true
      button.isSelected = index == selected
      button.accessibilityTraits = index == selected ? [.button, .selected] : .button
      button.accessibilityHint = "Finish view, radio button"
      button.configuration?.baseBackgroundColor =
        index == selected ? Tokens.primary : Tokens.surfaceControl
      button.configuration?.baseForegroundColor =
        index == selected ? Tokens.background : Tokens.text
      addArrangedSubview(button)
    }
    updateAxis()
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (view: FinishViewControl, _: UITraitCollection) in view.updateAxis()
    }
  }
  required init(coder: NSCoder) { fatalError() }
  private func updateAxis() {
    axis =
      traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
  }
}

@MainActor
final class SetBanner: UIControl {
  private let gray = UIImageView()
  private let colorClip = UIView()
  private let color = UIImageView()
  private let fillEdge = UIView()
  private let shade = CAGradientLayer()
  private let text = UIStackView()
  private let share: Double
  private var load: Task<Void, Never>?

  init(
    name: String, count: String, percent: Int?, share: Double, complete: Bool,
    spoken: String, artURI: String?, iconURI: String, large: Bool,
    images: any CardImages, symbols: any SetSymbols, action: (() -> Void)? = nil
  ) {
    self.share = share
    super.init(frame: .zero)
    backgroundColor = Tokens.surface
    layer.cornerRadius = Tokens.corner
    layer.borderColor = Tokens.primary.cgColor
    layer.borderWidth = complete ? Tokens.selectedOutline : 0
    clipsToBounds = true
    gray.contentMode = .scaleAspectFill
    color.contentMode = .scaleAspectFill
    gray.alpha = Tokens.dimmed
    addSubview(gray)
    colorClip.clipsToBounds = true
    colorClip.addSubview(color)
    addSubview(colorClip)
    fillEdge.backgroundColor = Tokens.primary
    fillEdge.isHidden = artURI == nil || share <= 0 || share >= 1
    addSubview(fillEdge)
    shade.colors = PresentationData.setArtScrim.map { stop in
      UIColor(
        red: stop.rgba[0] / 255, green: stop.rgba[1] / 255, blue: stop.rgba[2] / 255,
        alpha: stop.rgba[3]
      ).cgColor
    }
    shade.locations = PresentationData.setArtScrim.map { NSNumber(value: $0.location) }
    shade.startPoint = CGPoint(x: 0, y: 0)
    shade.endPoint = CGPoint(x: 1, y: 0)
    shade.isHidden = artURI == nil
    layer.addSublayer(shade)
    text.axis = .horizontal
    text.alignment = .center
    text.spacing = Tokens.sm
    text.isUserInteractionEnabled = false
    let icon = symbols.symbol(uri: iconURI, share: share, filled: artURI == nil)
    let iconSize =
      artURI == nil
      ? Tokens.setSymbolFill : large ? Tokens.setPageBannerSymbol : Tokens.setBannerSymbol
    icon.heightAnchor.constraint(equalToConstant: iconSize).isActive = true
    icon.widthAnchor.constraint(equalToConstant: iconSize).isActive = true
    text.addArrangedSubview(icon)
    let information = UIStackView()
    information.axis = .vertical
    information.spacing = Tokens.xs
    information.addArrangedSubview(AuthControls.label(name, style: large ? .title1 : .headline))
    information.addArrangedSubview(AuthControls.label(count, style: .caption1))
    if artURI == nil {
      let progress = UIProgressView(progressViewStyle: .bar)
      progress.progressTintColor = Tokens.primary
      progress.trackTintColor = Tokens.line
      progress.progress = Float(share)
      progress.heightAnchor.constraint(equalToConstant: Tokens.progressBar).isActive = true
      progress.isAccessibilityElement = false
      information.addArrangedSubview(progress)
    }
    text.addArrangedSubview(information)
    if let percent {
      let label = AuthControls.label(complete ? "✓" : "\(percent)%", style: .headline)
      if complete { label.textColor = Tokens.primary }
      label.setContentCompressionResistancePriority(.required, for: .horizontal)
      text.addArrangedSubview(label)
    }
    addSubview(text)
    text.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      text.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tokens.md),
      text.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Tokens.md),
      text.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Tokens.md),
      text.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Tokens.md),
      heightAnchor.constraint(
        greaterThanOrEqualToConstant: large ? Tokens.setPageBanner : Tokens.setBanner),
    ])
    isAccessibilityElement = true
    accessibilityLabel = spoken
    accessibilityTraits = action == nil ? .header : .button
    if let action { addAction(UIAction { _ in action() }, for: .touchUpInside) }
    if let artURI {
      load = Task { [weak self] in
        let image = await images.image(uri: artURI, blur: 0)
        guard !Task.isCancelled, let self else { return }
        color.image = image
        if let image { gray.image = CardImageEffects.grayscale(image) }
      }
    }
  }
  required init?(coder: NSCoder) { fatalError() }
  deinit { load?.cancel() }
  override var isHighlighted: Bool {
    didSet { alpha = isHighlighted ? Tokens.dimmed : 1 }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    gray.frame = bounds
    shade.frame = bounds
    colorClip.frame = CGRect(
      x: 0, y: 0, width: bounds.width * max(0, min(1, share)), height: bounds.height)
    fillEdge.frame = CGRect(
      x: colorClip.frame.maxX - Tokens.selectedOutline, y: 0, width: Tokens.selectedOutline,
      height: bounds.height)
    color.frame = bounds
  }
}

@MainActor
final class SetPageTile: UIView {
  init(uri: String?, spoken: String, quantity: Int, foil: Bool, images: any CardImages) {
    super.init(frame: .zero)
    let art = CardArtwork(
      uri: uri, images: images, finish: foil && quantity > 0 ? "foil" : "nonfoil",
      dimmed: quantity == 0)
    art.translatesAutoresizingMaskIntoConstraints = false
    addSubview(art)
    NSLayoutConstraint.activate([
      art.leadingAnchor.constraint(equalTo: leadingAnchor),
      art.trailingAnchor.constraint(equalTo: trailingAnchor),
      art.topAnchor.constraint(equalTo: topAnchor),
      art.bottomAnchor.constraint(equalTo: bottomAnchor),
      heightAnchor.constraint(
        equalTo: widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio),
    ])
    if quantity >= 2 {
      let badge = AuthControls.label("\(quantity)", style: .caption2)
      badge.textAlignment = .center
      badge.backgroundColor = Tokens.quantityBadge
      badge.layer.cornerRadius = Tokens.quantityBadgeHeight / 2
      badge.clipsToBounds = true
      badge.translatesAutoresizingMaskIntoConstraints = false
      addSubview(badge)
      NSLayoutConstraint.activate([
        badge.topAnchor.constraint(equalTo: topAnchor, constant: Tokens.quantityBadgeInset),
        badge.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tokens.quantityBadgeInset),
        badge.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.quantityBadgeHeight),
        badge.widthAnchor.constraint(greaterThanOrEqualToConstant: Tokens.quantityBadgeHeight),
      ])
    }
    isAccessibilityElement = true
    accessibilityLabel = spoken
    accessibilityTraits = .image
  }
  required init?(coder: NSCoder) { fatalError() }
}
