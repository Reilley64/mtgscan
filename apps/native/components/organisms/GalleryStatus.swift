import UIKit

@MainActor
final class GalleryStatus: UIStackView {
  private let heading = AuthControls.label("Gallery", style: .headline)
  private let state = AuthControls.label("")
  private let installed = AuthControls.label("", style: .footnote)
  private let explanation = AuthControls.label(
    "The scanner needs the gallery to recognize cards. It downloads once. Updates come in the background.",
    style: .footnote)
  private let progress = GalleryProgressRow()
  private let retry: UIButton
  private let cellular: UIButton
  private let cancel: UIButton

  init(
    onRetry: @escaping () -> Void, onCellular: @escaping () -> Void, onCancel: @escaping () -> Void
  ) {
    retry = AuthControls.button("Try again", action: onRetry)
    cellular = AuthControls.button("Download now", action: onCellular)
    cancel = AuthControls.button("Cancel", action: onCancel)
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
    for view in [heading, installed, state, explanation, progress, retry, cellular, cancel] {
      addArrangedSubview(view)
    }
    shouldGroupAccessibilityChildren = true
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ value: GalleryPresentation, signedIn: Bool) {
    state.text = value.title
    if let date = value.builtAt.flatMap({ ISO8601DateFormatter().date(from: $0) }) {
      installed.text = date.formatted(date: .long, time: .omitted)
    } else {
      installed.text = value.installedVersion
    }
    installed.isHidden = !value.isReady
    explanation.isHidden = ![.missing, .downloading, .waitingForWifi].contains(value.phase)
    progress.isHidden = ![.downloading, .waitingForWifi, .offline, .installing].contains(
      value.phase)
    progress.display(done: value.bytesDone, total: value.bytesTotal, text: value.progress)
    retry.isHidden = !value.canRetry
    retry.isEnabled = signedIn
    cellular.isHidden = value.phase != .waitingForWifi
    cellular.isEnabled = signedIn
    cancel.isHidden = !value.canCancel
    cancel.isEnabled = signedIn
  }
}
