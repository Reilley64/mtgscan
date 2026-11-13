import UIKit

@MainActor
enum GalleryControls {
  static func progress() -> UIProgressView {
    let view = UIProgressView(progressViewStyle: .default)
    view.progressTintColor = Tokens.textMuted
    view.trackTintColor = Tokens.line
    view.isAccessibilityElement = true
    view.accessibilityLabel = "Gallery download"
    return view
  }
}
