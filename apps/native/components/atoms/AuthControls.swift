import AuthenticationServices
import UIKit

@MainActor
enum AuthControls {
  static func label(_ text: String, style: UIFont.TextStyle = .body) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = UIFont.preferredFont(forTextStyle: style)
    label.adjustsFontForContentSizeCategory = true
    label.textColor = Tokens.text
    label.numberOfLines = 0
    return label
  }

  static func apple(_ action: @escaping () -> Void) -> ASAuthorizationAppleIDButton {
    let button = ASAuthorizationAppleIDButton(type: .signIn, style: .white)
    button.cornerRadius = Tokens.corner
    button.accessibilityLabel = "Sign in with Apple"
    button.addAction(UIAction { _ in action() }, for: .touchUpInside)
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.signInHeight).isActive =
      true
    return button
  }

  static func google(_ action: @escaping () -> Void) -> UIButton {
    var configuration = UIButton.Configuration.filled()
    configuration.title = "Continue with Google"
    configuration.image = UIImage(named: "google-logo")
    configuration.imagePadding = Tokens.sm
    configuration.baseBackgroundColor = Tokens.googleBackground
    configuration.baseForegroundColor = Tokens.googleText
    configuration.background.strokeColor = Tokens.googleBorder
    configuration.background.strokeWidth = 1
    configuration.background.cornerRadius = Tokens.corner
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer {
      incoming in
      var outgoing = incoming
      outgoing.foregroundColor = Tokens.googleText
      outgoing.font = UIFontMetrics.default.scaledFont(
        for: UIFont.systemFont(ofSize: Tokens.googleFontSize, weight: .medium))
      return outgoing
    }
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = "Continue with Google"
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.signInHeight).isActive =
      true
    return button
  }

  static func button(_ text: String, action: @escaping () -> Void) -> UIButton {
    var configuration = UIButton.Configuration.filled()
    configuration.title = text
    configuration.baseBackgroundColor = Tokens.surfaceControl
    configuration.baseForegroundColor = Tokens.text
    configuration.background.cornerRadius = Tokens.corner
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = text
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: Tokens.touchTarget).isActive = true
    return button
  }
}
