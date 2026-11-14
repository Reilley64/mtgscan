import UIKit

@MainActor
enum SetNavigation {
  static func search(delegate: any UISearchBarDelegate) -> UISearchBar {
    let bar = UISearchBar()
    bar.placeholder = "Search sets"
    bar.searchBarStyle = .minimal
    bar.tintColor = Tokens.primary
    bar.delegate = delegate
    bar.setShowsCancelButton(true, animated: false)
    return bar
  }

  static func setsButton(_ action: @escaping () -> Void) -> UIButton {
    var configuration: UIButton.Configuration
    if #available(iOS 26.0, *) { configuration = .glass() } else { configuration = .filled() }
    configuration.image = UIImage(
      systemName: "rectangle.portrait.on.rectangle.portrait",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: Tokens.iconButtonSymbol))
    configuration.baseForegroundColor = Tokens.text
    if #unavailable(iOS 26.0) { configuration.baseBackgroundColor = Tokens.surfaceControl }
    configuration.cornerStyle = .capsule
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = "Sets"
    return button
  }
}
