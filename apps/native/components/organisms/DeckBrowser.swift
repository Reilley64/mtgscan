import UIKit

@MainActor
final class DeckBrowser: UIStackView {
  var onLayout: (() -> Void)?
  var banner: CommanderCard? { arrangedSubviews.first as? CommanderCard }
  private let images: any CardImages
  private let onOpen: (String) -> Void
  private let onCopy: (String) -> Void
  private let onCreate: () -> Void
  private let onRetry: () -> Void
  private let onCollection: () -> Void

  init(
    images: any CardImages, onOpen: @escaping (String) -> Void, onCopy: @escaping (String) -> Void,
    onCreate: @escaping () -> Void, onRetry: @escaping () -> Void,
    onCollection: @escaping () -> Void
  ) {
    self.images = images
    self.onOpen = onOpen
    self.onCopy = onCopy
    self.onCreate = onCreate
    self.onRetry = onRetry
    self.onCollection = onCollection
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
  }

  required init(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }

  func display(_ state: DeckPresentation, grouping: DeckGrouping, sort: DeckSort, ascending: Bool) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if let message = state.message {
      if state.state == .loading {
        let skeleton = UIStackView()
        skeleton.axis = .vertical
        skeleton.spacing = Tokens.lg
        for _ in 0..<(state.selectedDeckID == nil ? 3 : 1) {
          skeleton.addArrangedSubview(card(nil, banner: state.selectedDeckID != nil))
        }
        if state.selectedDeckID != nil {
          skeleton.addArrangedSubview(CollectionControls.skeleton())
        }
        skeleton.isAccessibilityElement = true
        skeleton.accessibilityLabel = message
        addArrangedSubview(skeleton)
      } else {
        addArrangedSubview(AuthControls.label(message, style: .headline))
      }
      if state.state == .empty {
        addArrangedSubview(
          AuthControls.label("Create a deck, then add cards to it from your collection."))
        addArrangedSubview(AuthControls.button("Create deck", action: onCreate))
      }
      if state.state == .failed || state.state == .refused {
        if state.state == .failed {
          addArrangedSubview(AuthControls.label("Check your connection."))
        }
        addArrangedSubview(AuthControls.button("Try again", action: onRetry))
      }
      return
    }
    guard let deck = state.deck else {
      for deck in state.decks {
        let content = card(deck, banner: false)
        var label = [deck.name]
        if let count = deck.needsYouCount, count > 0 { label.append("Needs you \(count)") }
        if deck.cardCount > 0, let evaluation = deck.evaluation {
          label += [evaluation.validityTitle, "Estimated bracket \(evaluation.estimatedBracket)"]
        }
        let stale = deck.evaluation.map { $0.validityStale || $0.bracketStale } ?? false
        addArrangedSubview(
          DeckControls.surface(
            content: content, label: label.joined(separator: ", "),
            hint: stale ? "The rules data may be out of date." : nil
          ) { [onOpen] in onOpen(deck.deckID) })
      }
      return
    }
    addArrangedSubview(card(deck.summary, banner: true))
    addArrangedSubview(CollectionControls.heading("Cards"))
    addArrangedSubview(CollectionControls.heading("Commander"))
    let commanders = DeckOrdering.commanders(deck)
    if commanders.isEmpty {
      let label = AuthControls.label("No commander yet.")
      label.textColor = Tokens.textMuted
      addArrangedSubview(label)
    } else {
      grid(
        commanders.map {
          DeckTile(id: $0.copyID, name: $0.name, imageURI: $0.imageURIs.first, copy: $0)
        })
    }
    if deck.summary.cardCount == 0 {
      addArrangedSubview(AuthControls.label("No cards yet", style: .headline))
      addArrangedSubview(AuthControls.label("Add cards from a copy's page in your collection."))
      addArrangedSubview(AuthControls.button("Open Collection", action: onCollection))
    }
    for group in DeckOrdering.groups(deck, grouping: grouping, sort: sort, ascending: ascending) {
      let header = CollectionControls.heading("\(group.title) \(group.tiles.count)")
      header.accessibilityLabel = "\(group.title), \(group.tiles.count)"
      addArrangedSubview(header)
      grid(group.tiles)
    }
  }

  private func card(_ deck: DeckSummary?, banner: Bool) -> CommanderCard {
    let evaluation = deck.flatMap { $0.cardCount > 0 ? $0.evaluation : nil }
    return CommanderCard(
      name: deck?.name ?? " ", artURI: deck?.commanders.first?.artCropURI,
      partnerURI: deck.flatMap { $0.commanders.count > 1 ? $0.commanders[1].artCropURI : nil },
      validity: evaluation?.validityTitle, validityStale: evaluation?.validityStale ?? false,
      bracket: evaluation?.estimatedBracket, bracketStale: evaluation?.bracketStale ?? false,
      needsYou: deck?.needsYouCount ?? 0, banner: banner, images: images)
  }

  private func grid(_ tiles: [DeckTile]) {
    for start in stride(from: 0, to: tiles.count, by: 3) {
      let row = UIStackView()
      row.spacing = Tokens.sm
      row.distribution = .fillEqually
      row.alignment = .top
      for tile in tiles[start..<min(start + 3, tiles.count)] {
        var label = tile.name
        if let copy = tile.copy {
          label += ", \(copy.set.uppercased()) \(copy.collectorNumber)"
          if copy.finish != "nonfoil" { label += ", \(copy.finish)" }
          if copy.condition != "near_mint" {
            label += ", \(PresentationData.conditionNames[copy.condition] ?? copy.condition)"
          }
          if copy.plannedOut { label += ", planned out" }
        }
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = Tokens.xs
        let action: (() -> Void)? = tile.copyID.map { id in { [onCopy] in onCopy(id) } }
        stack.addArrangedSubview(
          DeckControls.card(
            uri: tile.imageURI, name: label, finish: tile.copy?.finish ?? "nonfoil", images: images,
            action: action))
        if tile.copy?.plannedOut == true {
          let caption = AuthControls.label("Planned out", style: .caption2)
          caption.textColor = Tokens.danger
          caption.textAlignment = .center
          stack.addArrangedSubview(caption)
        }
        row.addArrangedSubview(stack)
      }
      for _ in row.arrangedSubviews.count..<3 { row.addArrangedSubview(UIStackView()) }
      addArrangedSubview(row)
    }
  }
}
