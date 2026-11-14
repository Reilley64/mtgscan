import UIKit

@MainActor
final class AccountLayout: UIScrollView {
  let content = UIStackView()

  init() {
    super.init(frame: .zero)
    content.axis = .vertical
    content.spacing = Tokens.lg
    content.translatesAutoresizingMaskIntoConstraints = false
    addSubview(content)
    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor),
      content.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor, constant: Tokens.lg),
      content.bottomAnchor.constraint(
        equalTo: contentLayoutGuide.bottomAnchor, constant: -Tokens.lg),
      content.widthAnchor.constraint(equalTo: frameLayoutGuide.widthAnchor),
    ])
  }

  required init?(coder: NSCoder) { fatalError() }
}
