import UIKit

@MainActor
final class CatalogBrowser: UIStackView {
  private let controller: CatalogController
  private let images: any CardImages

  init(controller: CatalogController, images: any CardImages) {
    self.controller = controller
    self.images = images
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ state: CatalogPresentation) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if state.selectedOracleID != nil {
      addArrangedSubview(
        AuthControls.button("Back to search") { [weak controller] in controller?.closeCard() })
    }
    if let message = state.message {
      addArrangedSubview(AuthControls.label(message, style: .headline))
      addArrangedSubview(
        AuthControls.button("Try again") { [weak controller] in Task { await controller?.reload() }
        })
    }
    switch state.state {
    case .signedOut: return
    case .idle: addArrangedSubview(AuthControls.label("Search by name, rules text, or Oracle tag."))
    case .loading:
      addArrangedSubview(
        AuthControls.label(state.selectedOracleID == nil ? "Loading card catalog" : "Loading card"))
    case .empty: addArrangedSubview(AuthControls.label("No cards found", style: .headline))
    default: break
    }
    if let card = state.card {
      show(card, state: state)
      return
    }
    guard state.selectedOracleID == nil else { return }
    for row in state.items {
      let button = AuthControls.button(row.name) { [weak controller] in
        Task { await controller?.open(row.oracleId) }
      }
      button.accessibilityLabel =
        "\(row.name), \(row.owned.quantity) owned, \(row.owned.freeQuantity) free"
      addArrangedSubview(button)
      addArrangedSubview(CardSymbolLabel.make(row.manaCost))
      addArrangedSubview(AuthControls.label(row.typeLine))
      addArrangedSubview(
        AuthControls.label("\(row.owned.quantity) owned · \(row.owned.freeQuantity) free"))
      addArrangedSubview(
        CollectionControls.row(
          "Lowest current price", value: price(row.priceFrom),
          spoken: row.priceFrom == nil ? "no price" : nil,
          hint: state.pricesStale ? "The price may be out of date." : nil))
    }
    if state.nextCursor != nil {
      let button = AuthControls.button(state.loadingMore ? "Loading cards" : "Load more") {
        [weak controller] in
        Task { await controller?.more() }
      }
      button.isEnabled = !state.loadingMore
      addArrangedSubview(button)
    }
  }

  private func show(_ card: CatalogCard, state: CatalogPresentation) {
    if let printing = card.printing {
      addArrangedSubview(
        CardHero(
          imageURI: printing.imageUris.first, artURI: printing.artCropUri, name: card.name,
          finish: state.finish, images: images))
    }
    let heading = AuthControls.label(card.name, style: .title2)
    heading.accessibilityTraits.insert(.header)
    addArrangedSubview(heading)
    addArrangedSubview(CardSymbolLabel.make(card.manaCost))
    addArrangedSubview(AuthControls.label(card.typeLine))
    if let printing = card.printing {
      addArrangedSubview(
        AuthControls.label(
          "\(printing.set.uppercased()) · \(printing.collectorNumber) · \(printing.rarity.capitalized)"
        ))
      if let artist = printing.artist {
        addArrangedSubview(AuthControls.label("Illustrated by \(artist)", style: .caption2))
      }
      addArrangedSubview(
        SearchControls.choice(
          "Finish",
          options: printing.finishes.map { ($0, PresentationData.finishLabels[$0] ?? $0) },
          selected: state.finish
        ) { [weak controller] in controller?.selectFinish($0) })
    }
    addArrangedSubview(CollectionControls.row("Owned", value: "\(card.owned.quantity)"))
    addArrangedSubview(CollectionControls.row("Free", value: "\(card.owned.freeQuantity)"))
    addArrangedSubview(
      CollectionControls.row("Protected free", value: "\(card.owned.protectedFreeQuantity)"))
    addArrangedSubview(
      CollectionControls.row(
        "Lowest current price", value: price(card.priceFrom),
        spoken: card.priceFrom == nil ? "no price" : nil,
        hint: state.pricesStale ? "The price may be out of date." : nil))
    addArrangedSubview(AuthControls.label("Current prices from Scryfall, in USD", style: .caption2))
    addArrangedSubview(CollectionControls.heading("Rules"))
    for face in card.faces {
      if card.faces.count > 1 {
        addArrangedSubview(AuthControls.label(face.name, style: .headline))
      }
      addArrangedSubview(CardSymbolLabel.make(face.oracleText))
      if let power = face.power, let toughness = face.toughness {
        addArrangedSubview(AuthControls.label("\(power)/\(toughness)"))
      }
      if let loyalty = face.loyalty {
        addArrangedSubview(CollectionControls.row("Loyalty", value: loyalty))
      }
    }
    addArrangedSubview(
      CollectionControls.row(
        "Commander",
        value: PresentationData.commanderLegalityLabels[card.commanderLegality] ?? "Unknown"))
    if card.isGameChanger == true { addArrangedSubview(AuthControls.label("Game Changer")) }
    if state.rulesStale {
      addArrangedSubview(AuthControls.label("Rules data may be out of date.", style: .caption2))
    }
    if !card.tags.isEmpty {
      addArrangedSubview(CollectionControls.heading("Oracle tags"))
      addArrangedSubview(AuthControls.label(card.tags.map(\.label).joined(separator: ", ")))
    }
    if !card.combos.isEmpty {
      addArrangedSubview(CollectionControls.heading("Combos"))
      for combo in card.combos {
        addArrangedSubview(AuthControls.label("\(combo.otherCard.name) · \(combo.bracketTag)"))
        addArrangedSubview(AuthControls.label(combo.producedFeatures.joined(separator: ", ")))
      }
    }
    addArrangedSubview(CollectionControls.heading("Card printings"))
    addArrangedSubview(
      SearchControls.choice(
        "Show", options: [("all", "All printings"), ("owned", "Owned only")],
        selected: state.ownedOnly ? "owned" : "all"
      ) { [weak controller] value in Task { await controller?.showOwnedPrintings(value == "owned") }
      })
    if let message = state.printingMessage {
      addArrangedSubview(AuthControls.label(message))
      addArrangedSubview(
        AuthControls.button("Try again") { [weak controller] in
          Task { await controller?.loadPrintings(reset: true) }
        })
    }
    let tiles: [UIView] = state.printings.map { printing in
      let selected = card.printing?.printingId == printing.printingId
      let meta =
        "\(printing.set.uppercased()) \(printing.collectorNumber)\(selected ? " · Selected" : "")"
      let tile = CollectionControls.tile(
        uri: printing.imageUris.first, meta: meta, price: "\(printing.ownedQuantity ?? 0) owned",
        label: "\(card.name), \(meta), \(printing.ownedQuantity ?? 0) owned", finish: "nonfoil",
        protected: false, held: false, stale: false, images: images
      ) { [weak controller] in Task { await controller?.selectPrinting(printing.printingId) } }
      if selected { tile.accessibilityTraits.insert(.selected) }
      return tile
    }
    addArrangedSubview(CardGrid(tiles))
    if state.printingCursor != nil {
      let button = AuthControls.button(
        state.loadingPrintings ? "Loading printings" : "Load more printings"
      ) { [weak controller] in Task { await controller?.loadPrintings() } }
      button.isEnabled = !state.loadingPrintings
      addArrangedSubview(button)
    }
  }

  private func price(_ price: CatalogPrice?) -> String {
    guard let price,
      let amount = Decimal(string: price.amount, locale: Locale(identifier: "en_US_POSIX"))
    else { return "–" }
    return CollectionLabels.price(NSDecimalNumber(decimal: amount * 100).intValue)
  }
}
