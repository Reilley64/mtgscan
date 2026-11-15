import UIKit

@MainActor
final class NavigationTabs: UITabBar, UITabBarDelegate {
  var onSelect: ((Int) -> Void)?

  init(choices: [(String, String)]) {
    super.init(frame: .zero)
    overrideUserInterfaceStyle = .dark
    let appearance = standardAppearance
    for layout in [
      appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance,
      appearance.compactInlineLayoutAppearance,
    ] {
      layout.selected.titleTextAttributes[.foregroundColor] = Tokens.primary
    }
    items = choices.enumerated().map { index, choice in
      let symbol = UIImage(systemName: choice.1)
      let item = UITabBarItem(
        title: choice.0,
        image: symbol?.withTintColor(Tokens.textDim, renderingMode: .alwaysOriginal),
        selectedImage: symbol?.withTintColor(Tokens.primary, renderingMode: .alwaysOriginal))
      item.tag = index
      item.standardAppearance = appearance
      item.scrollEdgeAppearance = appearance
      return item
    }
    selectedItem = items?.first
    tintColor = Tokens.primary
    unselectedItemTintColor = Tokens.textDim
    delegate = self
  }

  required init?(coder: NSCoder) { fatalError() }

  func select(_ index: Int) { selectedItem = items?[index] }

  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) { onSelect?(item.tag) }
}
