import UIKit

@MainActor
final class SetsBrowser: UIStackView {
  private let images: any CardImages
  private let symbols: any SetSymbols
  var onOpen: ((String) -> Void)?
  var onRetry: (() -> Void)?
  var onChoose: ((FinishView) -> Void)?

  init(images: any CardImages, symbols: any SetSymbols) {
    self.images = images
    self.symbols = symbols
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
  }
  required init(coder: NSCoder) { fatalError() }

  func display(_ state: SetsPresentation) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if let message = state.message {
      if state.state == .loading {
        let skeleton = SetSectionHeader.loading(
          message, rows: state.code == nil ? 4 : 1, large: state.code != nil)
        if state.code != nil {
          let grid = CollectionControls.skeleton()
          grid.accessibilityElementsHidden = true
          skeleton.addArrangedSubview(grid)
        }
        addArrangedSubview(skeleton)
      } else {
        addArrangedSubview(AuthControls.label(message, style: .headline))
        if state.state == .failed {
          addArrangedSubview(AuthControls.label("Check your connection."))
        }
        if state.state == .failed || state.state == .refused {
          addArrangedSubview(AuthControls.button("Try again") { [weak self] in self?.onRetry?() })
        }
      }
      if state.state != .loaded { return }
    }
    if let details = state.details {
      addArrangedSubview(banner(details.summary, view: state.finishView, large: true))
      addArrangedSubview(
        FinishViewControl(
          labels: FinishView.allCases.map(\.label),
          selected: FinishView.allCases.firstIndex(of: state.finishView) ?? 0
        ) { [weak self] index in self?.onChoose?(FinishView.allCases[index]) })
      for section in details.sections { sectionGrid(section, view: state.finishView, header: true) }
      sectionGrid(details.other, view: state.finishView, header: !details.sections.isEmpty)
    } else {
      for set in state.items {
        addArrangedSubview(
          banner(set, view: state.finishView, large: false) { [weak self] in self?.onOpen?(set.code)
          })
      }
      if state.loadingMore {
        addArrangedSubview(SetSectionHeader.loading("Loading more sets", rows: 2))
      }
    }
    if let notice = state.notice {
      addArrangedSubview(AuthControls.label(notice))
      addArrangedSubview(AuthControls.button("Try again") { [weak self] in self?.onRetry?() })
    }
  }

  private func banner(_ set: CardSet, view: FinishView, large: Bool, action: (() -> Void)? = nil)
    -> UIView
  {
    let completion = set.completion[view]
    return SetBanner(
      name: set.name, count: completion.count, percent: completion.percent,
      share: completion.share, complete: completion.complete, spoken: completion.spoken(set.name),
      artURI: set.setArtURI, iconURI: set.iconSVGURI, large: large, images: images,
      symbols: symbols, action: action)
  }

  private func sectionGrid(_ section: SetSection, view: FinishView, header: Bool) {
    let printings = section.cardPrintings.filter { $0.counts[view] != nil }
    guard !printings.isEmpty else { return }
    let completion = section.completion[view]
    if header {
      addArrangedSubview(
        SetSectionHeader.make(
          name: section.name, count: completion.count,
          share: completion.share, complete: completion.complete,
          spoken: completion.spoken(section.name) + (completion.complete ? ", complete" : "")))
    }
    addArrangedSubview(
      CardGrid(
        printings.map { printing in
          SetPageTile(
            uri: printing.imageURI, spoken: printing.spoken(view),
            quantity: printing.counts[view] ?? 0, foil: view == .foil, images: images)
        }))
  }
}
