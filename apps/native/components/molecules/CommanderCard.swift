import UIKit

@MainActor
final class CommanderCard: UIView {
  init(
    name: String, artURI: String?, partnerURI: String?, validity: String?, validityStale: Bool,
    bracket: Int?, bracketStale: Bool, needsYou: Int, banner: Bool, images: any CardImages
  ) {
    super.init(frame: .zero)
    let art = CommanderArtwork(uri: artURI, images: images, rounded: !banner)
    let text = UIStackView()
    text.axis = .vertical
    text.spacing = Tokens.xs
    let title = AuthControls.label(name, style: .title2)
    title.accessibilityTraits.insert(.header)
    text.addArrangedSubview(title)
    if let validity {
      let label = AuthControls.label(validity + (validityStale ? " ◷" : ""), style: .caption1)
      label.textColor =
        validity == "Invalid"
        ? Tokens.danger : validity == "Cannot be determined" ? Tokens.warning : Tokens.text
      label.accessibilityLabel = "Deck validity, \(validity)"
      label.accessibilityHint = validityStale ? "The rules data may be out of date." : nil
      text.addArrangedSubview(label)
    }
    if let bracket {
      let label = AuthControls.label(
        "Bracket \(bracket)" + (bracketStale ? " ◷" : ""), style: .caption1)
      label.textColor = Tokens.info
      label.accessibilityLabel = "Estimated bracket \(bracket)"
      label.accessibilityHint = bracketStale ? "The rules data may be out of date." : nil
      text.addArrangedSubview(label)
    }
    for view in [art, text] {
      view.translatesAutoresizingMaskIntoConstraints = false
      addSubview(view)
    }
    NSLayoutConstraint.activate([
      art.leadingAnchor.constraint(equalTo: leadingAnchor),
      art.trailingAnchor.constraint(equalTo: trailingAnchor),
      art.topAnchor.constraint(equalTo: topAnchor),
      art.bottomAnchor.constraint(equalTo: bottomAnchor),
      heightAnchor.constraint(
        greaterThanOrEqualToConstant: CGFloat(
          banner ? PresentationData.deckBannerHeight : PresentationData.commanderGalleryHeight)),
      text.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tokens.lg),
      text.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -Tokens.lg),
      text.topAnchor.constraint(
        greaterThanOrEqualTo: topAnchor,
        constant: CGFloat(
          banner ? PresentationData.headerClearance : PresentationData.commanderTopInset)),
      text.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Tokens.lg),
    ])
    if needsYou > 0 && !banner {
      let count = CountBadge(count: needsYou, accessibilityLabel: "Needs you \(needsYou)")
      count.translatesAutoresizingMaskIntoConstraints = false
      addSubview(count)
      NSLayoutConstraint.activate([
        count.topAnchor.constraint(equalTo: topAnchor, constant: Tokens.md),
        count.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tokens.md),
      ])
    }
    if let partnerURI {
      let avatar = CardArtwork(uri: partnerURI, images: images, cropped: true, circular: true)
      let size = CGFloat(
        banner ? PresentationData.bannerCommanderAvatar : PresentationData.commanderAvatar)
      avatar.layer.cornerRadius = size / 2
      avatar.translatesAutoresizingMaskIntoConstraints = false
      addSubview(avatar)
      NSLayoutConstraint.activate([
        avatar.widthAnchor.constraint(equalToConstant: size),
        avatar.heightAnchor.constraint(equalToConstant: size),
        avatar.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Tokens.md),
        banner
          ? avatar.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Tokens.lg)
          : avatar.topAnchor.constraint(equalTo: topAnchor, constant: Tokens.md),
        text.trailingAnchor.constraint(
          lessThanOrEqualTo: avatar.leadingAnchor, constant: -Tokens.sm),
      ])
    }
  }

  required init?(coder: NSCoder) { fatalError() }
}
