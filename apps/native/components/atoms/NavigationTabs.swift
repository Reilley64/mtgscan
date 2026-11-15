import UIKit

@MainActor
final class NavigationTabs: UITabBar, UITabBarDelegate {
  var onSelect: ((Int) -> Void)?

  init(choices: [(String, String)]) {
    super.init(frame: .zero)
    items = choices.enumerated().map { index, choice in
      UITabBarItem(title: choice.0, image: UIImage(systemName: choice.1), tag: index)
    }
    selectedItem = items?.first
    tintColor = Tokens.primary
    unselectedItemTintColor = Tokens.textDim
    let appearance = standardAppearance
    for layout in [
      appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance,
      appearance.compactInlineLayoutAppearance,
    ] {
      layout.normal.iconColor = Tokens.textDim
      layout.normal.titleTextAttributes[.foregroundColor] = Tokens.textDim
      layout.selected.iconColor = Tokens.primary
      layout.selected.titleTextAttributes[.foregroundColor] = Tokens.primary
    }
    standardAppearance = appearance
    scrollEdgeAppearance = appearance
    delegate = self
  }

  required init?(coder: NSCoder) { fatalError() }

  func select(_ index: Int) { selectedItem = items?[index] }

  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) { onSelect?(item.tag) }
}
