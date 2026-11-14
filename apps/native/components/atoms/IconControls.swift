import UIKit

@MainActor
enum IconControls {
  static func header(label: String, symbol: String) -> UIButton {
    button(
      label: label, symbol: symbol, size: Tokens.touchTarget, symbolSize: UIFont.systemFontSize)
  }

  static func floating(label: String, symbol: String, active: Bool) -> UIButton {
    button(
      label: label, symbol: symbol, size: CGFloat(PresentationData.floatingButtonSize),
      symbolSize: CGFloat(PresentationData.iconButtonSymbolSize), active: active)
  }

  private static func button(
    label: String, symbol: String, size: CGFloat, symbolSize: CGFloat, active: Bool = false
  ) -> UIButton {
    var configuration: UIButton.Configuration
    if #available(iOS 26.0, *) {
      configuration = .glass()
    } else {
      configuration = .plain()
      configuration.background.backgroundColor = Tokens.surfaceControl
    }
    configuration.cornerStyle = .capsule
    configuration.image = UIImage(
      systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: symbolSize))
    configuration.baseForegroundColor = active ? Tokens.primary : Tokens.text
    let button = UIButton(configuration: configuration)
    button.accessibilityLabel = label
    button.widthAnchor.constraint(equalToConstant: size).isActive = true
    button.heightAnchor.constraint(equalToConstant: size).isActive = true
    return button
  }
}
