import UIKit

@MainActor
final class SetsLayout: UIView {
  let controls = UIStackView()
  let scroll = AccountLayout()

  override init(frame: CGRect) {
    super.init(frame: frame)
    controls.axis = .vertical
    controls.spacing = Tokens.sm
    addSubview(controls)
    addSubview(scroll)
    controls.translatesAutoresizingMaskIntoConstraints = false
    scroll.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      controls.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
      controls.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Tokens.sm),
      controls.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Tokens.sm),
      scroll.topAnchor.constraint(equalTo: controls.bottomAnchor),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
    ])
    scroll.keyboardDismissMode = .onDrag
  }
  required init?(coder: NSCoder) { fatalError() }
}
