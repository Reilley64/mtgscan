import UIKit

@MainActor
final class CardHero: UIView {
  init(imageURI: String?, artURI: String?, name: String, finish: String, images: any CardImages) {
    super.init(frame: .zero)
    let art = CardArtwork(uri: artURI ?? imageURI, images: images, blur: Tokens.heroBlur)
    art.alpha = Tokens.heroOpacity
    let card = CardArtwork(uri: imageURI, images: images, finish: finish)
    for view in [art, card] {
      view.translatesAutoresizingMaskIntoConstraints = false
      addSubview(view)
    }
    NSLayoutConstraint.activate([
      art.leadingAnchor.constraint(equalTo: leadingAnchor),
      art.trailingAnchor.constraint(equalTo: trailingAnchor),
      art.topAnchor.constraint(equalTo: topAnchor),
      art.bottomAnchor.constraint(equalTo: bottomAnchor),
      card.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.55),
      card.centerXAnchor.constraint(equalTo: centerXAnchor),
      card.topAnchor.constraint(equalTo: topAnchor, constant: Tokens.lg),
      card.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Tokens.lg),
      card.heightAnchor.constraint(
        equalTo: card.widthAnchor, multiplier: 1 / PresentationData.cardImageAspectRatio),
    ])
    isAccessibilityElement = true
    accessibilityLabel = name
    accessibilityTraits = .image
  }

  required init?(coder: NSCoder) { fatalError() }
}
