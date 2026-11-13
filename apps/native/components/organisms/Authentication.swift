import UIKit

@MainActor
final class Authentication: UIStackView {
  private let account = AuthControls.label("", style: .body)
  private let message = AuthControls.label("", style: .body)
  private let activity = UIActivityIndicatorView(style: .medium)
  private let providers: ProviderButtons
  private let signOut: UIButton
  private let retry: UIButton

  init(
    onApple: @escaping () -> Void, onGoogle: @escaping () -> Void,
    onSignOut: @escaping () -> Void, onRetry: @escaping () -> Void
  ) {
    providers = ProviderButtons(onApple: onApple, onGoogle: onGoogle)
    signOut = AuthControls.button("Sign out", action: onSignOut)
    retry = AuthControls.button("Try again", action: onRetry)
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
    let title = AuthControls.label("Every card you own, in one binder.", style: .title2)
    title.accessibilityTraits.insert(.header)
    let subtitle = AuthControls.label(
      "Scan your cards, see what each one is worth, and build Commander decks from them.")
    addArrangedSubview(title)
    addArrangedSubview(subtitle)
    addArrangedSubview(account)
    addArrangedSubview(providers)
    addArrangedSubview(activity)
    addArrangedSubview(message)
    addArrangedSubview(retry)
    addArrangedSubview(signOut)
    addArrangedSubview(
      AuthControls.label("Your collection and decks stay private.", style: .footnote))
    let privacy = AuthControls.button("Privacy policy") {
      UIApplication.shared.open(URL(string: "https://mtgscan.reilley.dev/privacy")!)
    }
    addArrangedSubview(privacy)
    activity.hidesWhenStopped = true
    activity.accessibilityLabel = "Checking your account"
    message.accessibilityTraits.insert(.updatesFrequently)
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ state: SessionPresentation, configured: Bool) {
    providers.isHidden = state.accountID != nil || state.requiresRemoval
    providers.setEnabled(state.canSignIn && configured)
    account.text = state.accountID.map { "Signed in\n\($0)" }
    account.isHidden = state.accountID == nil
    signOut.isHidden = state.accountID == nil && !state.requiresRemoval && state.message == nil
    signOut.isEnabled = !state.busy
    message.text = configured ? state.message : "Sign-in is not configured for this test app."
    message.isHidden = message.text == nil
    retry.isHidden = state.message == nil || state.requiresRemoval
    retry.isEnabled = !state.busy
    if state.busy { activity.startAnimating() } else { activity.stopAnimating() }
  }
}
