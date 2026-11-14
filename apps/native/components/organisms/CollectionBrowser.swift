import UIKit

@MainActor
final class CollectionBrowser: UIStackView {
  private let images: any CardImages
  private let onOpen: (String) -> Void
  private let onClose: () -> Void
  private let onRetry: () -> Void
  private let onSignOut: () -> Void
  private let onDeck: ((String) -> Void)?
  private let onCatalog: (() -> Void)?
  private let gallery: GalleryStatus?

  init(
    images: any CardImages, onOpen: @escaping (String) -> Void,
    onClose: @escaping () -> Void, onRetry: @escaping () -> Void,
    onCatalog: (() -> Void)? = nil, onSignOut: @escaping () -> Void,
    onDeck: ((String) -> Void)? = nil, gallery: GalleryStatus? = nil
  ) {
    self.images = images
    self.onOpen = onOpen
    self.onClose = onClose
    self.onRetry = onRetry
    self.onSignOut = onSignOut
    self.onDeck = onDeck
    self.onCatalog = onCatalog
    self.gallery = gallery
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
  }

  required init(coder: NSCoder) { fatalError() }

  var hero: CardHero? { arrangedSubviews.first as? CardHero }
  var onLayout: (() -> Void)?

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }

  func display(_ state: CollectionPresentation) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if state.selectedCopyID == nil {
      let heading = AuthControls.label("Collection", style: .largeTitle)
      heading.accessibilityTraits.insert(.header)
      addArrangedSubview(heading)
      if let onCatalog {
        addArrangedSubview(AuthControls.button("Search card catalog", action: onCatalog))
      }
      addArrangedSubview(AuthControls.button("Sign out", action: onSignOut))
      if let gallery { addArrangedSubview(gallery) }
    }
    if let message = state.message {
      if state.state == .loading && state.selectedCopyID == nil {
        addArrangedSubview(CollectionControls.skeleton())
      } else {
        addArrangedSubview(AuthControls.label(message, style: .headline))
      }
      if state.state == .empty {
        addArrangedSubview(AuthControls.label("Scan cards to add them to your collection."))
      }
      if state.state == .failed {
        addArrangedSubview(AuthControls.label("Check your connection."))
        addArrangedSubview(AuthControls.button("Try again", action: onRetry))
      }
      if state.state == .refused {
        addArrangedSubview(AuthControls.button("Try again", action: onRetry))
        if state.selectedCopyID != nil {
          addArrangedSubview(AuthControls.button("Sign out", action: onSignOut))
        }
      }
      if state.state == .missing {
        addArrangedSubview(AuthControls.button("OK", action: onClose))
      }
      return
    }
    if let copy = state.copy { show(copy) } else { grid(state.copies) }
  }

  private func grid(_ copies: [CollectionCopy]) {
    addArrangedSubview(
      CardGrid(
        copies.map { copy in
          CollectionControls.tile(
            uri: copy.printing.imageURIs.first, meta: CollectionLabels.printing(copy),
            price: CollectionLabels.price(copy.currentPrice?.usdCents),
            label: CollectionLabels.spokenCopy(copy), finish: copy.finish,
            protected: copy.protected, held: copy.heldFor != nil,
            stale: copy.currentPrice?.stale == true, images: images,
            action: { [onOpen] in onOpen(copy.copyID) })
        }))
  }

  private func show(_ copy: CollectionCopy) {
    addArrangedSubview(
      CardHero(
        imageURI: copy.printing.imageURIs.first, artURI: copy.printing.artCropURI,
        name: copy.printing.name, finish: copy.finish, images: images))
    let title = AuthControls.label(copy.printing.name, style: .title2)
    title.accessibilityTraits.insert(.header)
    addArrangedSubview(title)
    addArrangedSubview(AuthControls.label(copy.printing.typeLine))
    if let artist = copy.printing.artist {
      addArrangedSubview(AuthControls.label("Illustrated by \(artist)", style: .caption2))
    }
    if copy.protected {
      let label = AuthControls.label("Protected")
      label.textColor = Tokens.warning
      addArrangedSubview(label)
    }
    if copy.heldFor != nil {
      let label = AuthControls.label("Held")
      label.textColor = Tokens.info
      addArrangedSubview(label)
    }
    addArrangedSubview(AuthControls.label(CollectionLabels.chips(copy)))
    if let deck = copy.deck ?? copy.heldFor {
      if let onDeck {
        addArrangedSubview(AuthControls.button(deck.name) { onDeck(deck.deckID) })
      } else {
        addArrangedSubview(AuthControls.label(deck.name))
      }
    }
    addArrangedSubview(CollectionControls.heading("User tags"))
    addArrangedSubview(
      AuthControls.label(
        copy.userTags.isEmpty ? "Add user tags" : copy.userTags.map(\.name).joined(separator: ", "))
    )
    addArrangedSubview(CollectionControls.heading("Price"))
    addArrangedSubview(
      CollectionControls.row(
        "Current price", value: CollectionLabels.price(copy.currentPrice?.usdCents),
        spoken: copy.currentPrice == nil ? "no price" : nil,
        hint: copy.currentPrice?.stale == true ? "The price may be out of date." : nil))
    addArrangedSubview(CollectionControls.row("Added", value: CollectionLabels.added(copy.addedAt)))
    addArrangedSubview(
      CollectionControls.row(
        "Purchase-day price", value: CollectionLabels.price(copy.purchaseDayUsdCents),
        spoken: copy.purchaseDayUsdCents == nil ? "no price" : nil))
    let difference = copy.currentPrice.flatMap { price in
      copy.purchaseDayUsdCents.map { price.usdCents - $0 }
    }
    let shown =
      difference.map {
        $0 > 0
          ? "+\(CollectionLabels.price($0))"
          : $0 < 0 ? "−\(CollectionLabels.price(-$0))" : CollectionLabels.price(0)
      } ?? "–"
    let spoken =
      difference.map {
        $0 > 0
          ? "up \(CollectionLabels.price($0))"
          : $0 < 0 ? "down \(CollectionLabels.price(-$0))" : "no change"
      } ?? "no price"
    addArrangedSubview(CollectionControls.row("Since added", value: shown, spoken: spoken))
    addArrangedSubview(AuthControls.label("Current prices from Scryfall, in USD", style: .caption2))
    addArrangedSubview(CollectionControls.heading("Rules"))
    for face in copy.printing.faces where !face.oracleText.isEmpty {
      if copy.printing.faces.count > 1 {
        addArrangedSubview(AuthControls.label(face.name, style: .headline))
      }
      addArrangedSubview(CardSymbolLabel.make(face.oracleText))
    }
    addArrangedSubview(
      CollectionControls.row(
        "Commander",
        value: PresentationData.commanderLegalityLabels[copy.printing.commanderLegality]
          ?? "Unknown"))
  }
}
