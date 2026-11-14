import UIKit

@MainActor
enum SetSectionHeader {
  static func make(name: String, count: String, share: Double, complete: Bool, spoken: String)
    -> UIStackView
  {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = Tokens.xs
    let title = AuthControls.label(complete ? "\(name) ✓" : name, style: .headline)
    title.textColor = Tokens.primary
    stack.addArrangedSubview(title)
    stack.addArrangedSubview(AuthControls.label(count, style: .caption1))
    let progress = UIProgressView(progressViewStyle: .bar)
    progress.progress = Float(share)
    progress.progressTintColor = Tokens.primary
    progress.trackTintColor = Tokens.line
    progress.heightAnchor.constraint(equalToConstant: Tokens.progressBar).isActive = true
    stack.addArrangedSubview(progress)
    stack.isAccessibilityElement = true
    stack.accessibilityLabel = spoken
    stack.accessibilityTraits = .header
    return stack
  }

  private static func loadingBanner(large: Bool) -> (banner: UIView, blocks: UIStackView) {
    let banner = UIView()
    banner.backgroundColor = Tokens.surface
    banner.layer.cornerRadius = Tokens.corner
    banner.layer.borderWidth = Tokens.selectedOutline
    banner.layer.borderColor = UIColor.clear.cgColor
    let blocks = UIStackView()
    blocks.alignment = .center
    blocks.spacing = Tokens.sm
    let symbol = UIView()
    symbol.backgroundColor = Tokens.text
    let information = UIView()
    let name = UIView()
    let count = UIView()
    for bar in [name, count] {
      bar.backgroundColor = Tokens.text
      bar.translatesAutoresizingMaskIntoConstraints = false
      information.addSubview(bar)
    }
    blocks.addArrangedSubview(symbol)
    blocks.addArrangedSubview(information)
    blocks.translatesAutoresizingMaskIntoConstraints = false
    banner.addSubview(blocks)
    let symbolSize = large ? Tokens.setPageBannerSymbol : Tokens.setBannerSymbol
    let nameHeight = CGFloat(PresentationData.skeletonTitleBar)
    let countHeight = CGFloat(PresentationData.skeletonMetaBar)
    NSLayoutConstraint.activate([
      banner.heightAnchor.constraint(
        greaterThanOrEqualToConstant: large ? Tokens.setPageBanner : Tokens.setBanner),
      blocks.leadingAnchor.constraint(equalTo: banner.leadingAnchor, constant: Tokens.md),
      blocks.trailingAnchor.constraint(equalTo: banner.trailingAnchor, constant: -Tokens.md),
      blocks.bottomAnchor.constraint(equalTo: banner.bottomAnchor, constant: -Tokens.md),
      blocks.topAnchor.constraint(greaterThanOrEqualTo: banner.topAnchor, constant: Tokens.md),
      symbol.widthAnchor.constraint(equalToConstant: symbolSize),
      symbol.heightAnchor.constraint(equalToConstant: symbolSize),
      information.heightAnchor.constraint(equalToConstant: nameHeight + Tokens.xs + countHeight),
      name.topAnchor.constraint(equalTo: information.topAnchor),
      name.leadingAnchor.constraint(equalTo: information.leadingAnchor),
      name.widthAnchor.constraint(equalTo: information.widthAnchor, multiplier: 0.6),
      name.heightAnchor.constraint(equalToConstant: nameHeight),
      count.topAnchor.constraint(equalTo: name.bottomAnchor, constant: Tokens.xs),
      count.leadingAnchor.constraint(equalTo: information.leadingAnchor),
      count.widthAnchor.constraint(equalTo: information.widthAnchor, multiplier: 0.3),
      count.heightAnchor.constraint(equalToConstant: countHeight),
    ])
    return (banner, blocks)
  }

  static func loading(_ label: String, rows: Int, large: Bool = false) -> UIStackView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = Tokens.sm
    var blocks: [UIStackView] = []
    for _ in 0..<rows {
      let skeleton = loadingBanner(large: large)
      stack.addArrangedSubview(skeleton.banner)
      blocks.append(skeleton.blocks)
    }
    stack.isAccessibilityElement = true
    stack.accessibilityLabel = label
    SkeletonPulse.start(blocks)
    return stack
  }
}
