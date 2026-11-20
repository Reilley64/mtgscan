import UIKit

@MainActor
final class ScanLatest: UIStackView {
  init() {
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
  }

  required init(coder: NSCoder) { fatalError() }

  func display(
    review: ScanReviewController, artwork: [String: String], images: any CardImages,
    onDetails: @escaping (String) -> Void, onCondition: @escaping (String) -> Void,
    onPrintings: @escaping (String) -> Void, onLanguage: @escaping (String) -> Void,
    onAddCopy: @escaping (String) -> Void
  ) {
    for view in arrangedSubviews { view.removeFromSuperview() }
    var selected: BatchScan?
    if review.recognizing {
      addArrangedSubview(AuthControls.label("Recognizing card", style: .headline))
    } else {
      switch review.latest {
      case .scan(let id):
        if let scan = review.batch.scans.first(where: { $0.scanId == id }) {
          selected = scan
          let caption = "\(scan.printing.setCode.uppercased()) \(scan.printing.collectorNumber)"
          addArrangedSubview(
            ScanControls.latest(
              uri: artwork[scan.printing.printingId], title: scan.printing.name,
              meta: scan.finish == "nonfoil"
                ? caption
                : "\(caption) · \(PresentationData.finishLabels[scan.finish] ?? scan.finish)",
              images: images, action: { onDetails(id) }))
        }
      case .notRecognized(let id):
        addArrangedSubview(
          ScanControls.latest(
            uri: nil, title: "Not recognized", meta: "Tap to search", images: images,
            action: { onDetails(id) }))
      case .basicLand(let printing):
        addArrangedSubview(
          ScanControls.latest(
            uri: artwork[printing.printingId], title: printing.name,
            meta: "Basic land, not tracked", images: images, action: nil))
      case nil: break
      }
    }
    let id = selected?.scanId ?? ""
    let finish = selected?.finish ?? "nonfoil"
    let finishes = PresentationData.finishOrder.filter {
      selected?.printing.finishes.contains($0) == true
    }
    let next =
      finishes.isEmpty
      ? finish : finishes[((finishes.firstIndex(of: finish) ?? 0) + 1) % finishes.count]
    let actions = [
      AuthControls.button(PresentationData.finishLabels[finish] ?? finish) {
        review.setFinish(next, scanID: id)
      },
      AuthControls.button(
        PresentationData.conditionLabels[selected?.condition ?? "near_mint"] ?? "NM"
      ) { onCondition(id) },
      AuthControls.button(selected?.printing.setCode.uppercased() ?? "Set") { onPrintings(id) },
      AuthControls.button(selected?.language.uppercased() ?? "EN") { onLanguage(id) },
      AuthControls.button("+1") { onAddCopy(id) },
    ]
    let bar = UIStackView(arrangedSubviews: actions)
    bar.spacing = Tokens.xs
    bar.axis =
      traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
    bar.distribution = .fillEqually
    for action in actions { action.isEnabled = selected != nil }
    actions[0].isEnabled = selected != nil && finishes.count > 1
    addArrangedSubview(bar)
  }
}
