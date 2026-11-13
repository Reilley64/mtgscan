import UIKit

@MainActor
enum GalleryControls {
  static func progress() -> UIProgressView {
    let view = UIProgressView(progressViewStyle: .default)
    view.progressTintColor = Tokens.text
    view.trackTintColor = Tokens.surfaceControl
    view.isAccessibilityElement = true
    view.accessibilityLabel = "Gallery download"
    return view
  }
}
