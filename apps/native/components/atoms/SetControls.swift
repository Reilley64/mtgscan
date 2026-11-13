import CoreImage
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
    layer.borderWidth = complete ? 1 : 0
    clipsToBounds = true
    gray.contentMode = .scaleAspectFill
    color.contentMode = .scaleAspectFill
    gray.alpha = Tokens.dimmed
    addSubview(gray)
    colorClip.clipsToBounds = true
    colorClip.addSubview(color)
    addSubview(colorClip)
    shade.colors = [UIColor.clear.cgColor, Tokens.background.cgColor]
    shade.startPoint = CGPoint(x: 0, y: 0)
    shade.endPoint = CGPoint(x: 0, y: 1)
    layer.addSublayer(shade)
    text.axis = .vertical
    text.spacing = Tokens.xs
    text.isUserInteractionEnabled = false
    let title = AuthControls.label(name, style: large ? .title1 : .headline)
    let completion = [count, percent.map { "\($0)%" }, complete ? "✓" : nil].compactMap { $0 }
      .joined(separator: " · ")
    text.addArrangedSubview(title)
    text.addArrangedSubview(AuthControls.label(completion, style: .caption1))
    let progress = UIProgressView(progressViewStyle: .bar)
    progress.progressTintColor = Tokens.primary
    progress.trackTintColor = Tokens.line
    progress.progress = Float(share)
    progress.heightAnchor.constraint(equalToConstant: Tokens.progressBar).isActive = true
    progress.isAccessibilityElement = false
    text.addArrangedSubview(progress)
    if artURI == nil {
      let icon = symbols.symbol(uri: iconURI, share: share)
      icon.heightAnchor.constraint(equalToConstant: Tokens.setBannerSymbol).isActive = true
      text.insertArrangedSubview(icon, at: 0)
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
        if let image, let input = CIImage(image: image),
          let output = CIContext().createCGImage(
            input.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0]),
            from: input.extent)
        {
          gray.image = UIImage(cgImage: output)
        }
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
      badge.textColor = .white
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
