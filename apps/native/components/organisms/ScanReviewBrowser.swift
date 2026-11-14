import UIKit

enum ScanReviewScreen {
  case batch
  case details(String)
  case names(String)
  case printings(String, String, Bool)
  case condition(String)
  case language(String)
}

@MainActor
final class ScanReviewBrowser: UIStackView {
  private var search: SearchField?
  private let results = UIStackView()

  init() {
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
    results.axis = .vertical
    results.spacing = Tokens.sm
  }

  required init(coder: NSCoder) { fatalError() }

  func display(
    _ screen: ScanReviewScreen, review: ScanReviewController, choices: ScanChoicesController,
    images: any CardImages, navigate: @escaping (ScanReviewScreen) -> Void,
    choose: @escaping (RecognitionCandidate, String, String) -> Void,
    remove: @escaping (String) -> Void, removeAll: @escaping () -> Void,
    retry: @escaping () -> Void, selectValue: @escaping () -> Void
  ) {
    if case .names(let id) = screen {
      if search == nil {
        search = SearchField("Card name") { text in Task { await choices.search(text) } }
      }
      if let search, search.superview == nil { addArrangedSubview(search) }
      if results.superview == nil { addArrangedSubview(results) }
      for view in results.arrangedSubviews { view.removeFromSuperview() }
      for name in choices.names {
        results.addArrangedSubview(
          AuthControls.button(name.name) { [weak self] in
            self?.endEditing(true)
            navigate(.printings(id, name.oracleId, false))
          })
      }
      if let message = choices.message { results.addArrangedSubview(AuthControls.label(message)) }
      if choices.localFailed {
        results.addArrangedSubview(AuthControls.button("Try again", action: retry))
      }
      return
    }
    for view in arrangedSubviews { view.removeFromSuperview() }
    switch screen {
    case .batch:
      if review.batch.scans.isEmpty {
        addArrangedSubview(AuthControls.label("No scans yet", style: .headline))
        addArrangedSubview(AuthControls.label("Cards you scan wait here until you add them."))
      } else {
        addArrangedSubview(ScanControls.destructive("Remove all scans", action: removeAll))
        for scan in review.batch.scans.reversed() {
          let meta = [
            "\(scan.printing.setCode.uppercased()) \(scan.printing.collectorNumber)",
            PresentationData.finishLabels[scan.finish] ?? scan.finish,
            PresentationData.conditionLabels[scan.condition] ?? scan.condition,
            PresentationData.languageNames[scan.language] ?? scan.language,
          ].joined(separator: " · ")
          addArrangedSubview(
            ScanControls.latest(
              uri: choices.artwork[scan.printing.printingId],
              title: scan.printing.name, meta: meta, images: images,
              action: { navigate(.details(scan.scanId)) }))
        }
      }
    case .details(let id):
      guard let scan = review.batch.scans.first(where: { $0.scanId == id }) else { return }
      addArrangedSubview(
        CardHero(
          imageURI: choices.artwork[scan.printing.printingId], artURI: nil,
          name: scan.printing.name, finish: scan.finish, images: images))
      addArrangedSubview(AuthControls.label(scan.printing.name, style: .title2))
      addArrangedSubview(
        AuthControls.label("\(scan.printing.setCode.uppercased()) \(scan.printing.collectorNumber)")
      )
      section(
        "Finish", values: PresentationData.finishOrder.filter(scan.printing.finishes.contains),
        selected: scan.finish, labels: PresentationData.finishLabels
      ) { review.setFinish($0, scanID: id) }
      section(
        "Condition", values: PresentationData.conditionOrder, selected: scan.condition,
        labels: PresentationData.conditionLabels
      ) { review.setCondition($0, scanID: id) }
      section(
        "Language", values: PresentationData.languageOrder, selected: scan.language,
        labels: PresentationData.languageNames
      ) { review.setLanguage($0, scanID: id) }
      addArrangedSubview(
        AuthControls.button("Card printings") {
          navigate(.printings(id, scan.printing.oracleId, true))
        })
      if scan.options.contains(where: { $0.printingId != scan.printing.printingId }) {
        addArrangedSubview(CollectionControls.heading("Other options"))
        for option in scan.options where option.printingId != scan.printing.printingId {
          addArrangedSubview(
            ScanControls.latest(
              uri: choices.artwork[option.printingId], title: option.name,
              meta: "\(option.setCode.uppercased()) \(option.collectorNumber)", images: images,
              action: { choose(option, id, "other_options") }))
        }
      }
      addArrangedSubview(AuthControls.button("None of these: search") { navigate(.names(id)) })
      addArrangedSubview(ScanControls.destructive("Remove scan") { remove(id) })
    case .condition(let id), .language(let id):
      guard let scan = review.batch.scans.first(where: { $0.scanId == id }) else { return }
      if case .condition = screen {
        section(
          "Condition", values: PresentationData.conditionOrder, selected: scan.condition,
          labels: PresentationData.conditionLabels
        ) {
          review.setCondition($0, scanID: id)
          selectValue()
        }
      } else {
        section(
          "Language", values: PresentationData.languageOrder, selected: scan.language,
          labels: PresentationData.languageNames
        ) {
          review.setLanguage($0, scanID: id)
          selectValue()
        }
      }
    case .names: break
    case .printings(let id, _, let picker):
      let selected = review.batch.scans.first(where: { $0.scanId == id })?.printing.printingId
      let tiles = choices.printings.map { printing in
        ScanControls.printing(
          uri: choices.artwork[printing.printingId],
          caption: "\(printing.setCode.uppercased()) \(printing.collectorNumber)",
          label: "\(printing.name), \(printing.setCode.uppercased()) \(printing.collectorNumber)",
          selected: selected == printing.printingId, images: images
        ) {
          choose(printing, id, picker ? "printing_picker" : "name_search")
        }
      }
      addArrangedSubview(CardGrid(tiles))
    }
    if let message = choices.message { addArrangedSubview(AuthControls.label(message)) }
    if choices.artworkFailed {
      addArrangedSubview(AuthControls.label("Could not load card images."))
    }
    if choices.artworkFailed || choices.localFailed {
      addArrangedSubview(AuthControls.button("Try again", action: retry))
    }
  }

  func focusName() { search?.focus() }

  private func section(
    _ title: String, values: [String], selected: String,
    labels: [String: String], action: @escaping (String) -> Void
  ) {
    addArrangedSubview(CollectionControls.heading(title))
    for value in values {
      addArrangedSubview(
        ScanControls.choice(labels[value] ?? value, selected: value == selected) { action(value) })
    }
  }
}
