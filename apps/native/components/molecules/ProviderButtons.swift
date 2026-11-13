import AuthenticationServices
import UIKit

@MainActor
final class ProviderButtons: UIStackView {
  let apple: ASAuthorizationAppleIDButton
  let google: UIButton

  init(onApple: @escaping () -> Void, onGoogle: @escaping () -> Void) {
    apple = AuthControls.apple(onApple)
    google = AuthControls.google(onGoogle)
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
    addArrangedSubview(apple)
    addArrangedSubview(google)
  }

  required init(coder: NSCoder) { fatalError() }

  func setEnabled(_ enabled: Bool) {
    apple.isEnabled = enabled
    google.isEnabled = enabled
    alpha = enabled ? 1 : Tokens.dimmed
  }
}
