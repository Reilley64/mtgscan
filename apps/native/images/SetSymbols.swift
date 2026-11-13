import UIKit
import WebKit

@MainActor
protocol SetSymbols {
  func symbol(uri: String, share: Double, filled: Bool) -> UIView
}

@MainActor
final class HTTPSSetSymbols: SetSymbols {
  func symbol(uri: String, share: Double, filled: Bool) -> UIView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.isOpaque = false
    view.backgroundColor = .clear
    view.scrollView.isScrollEnabled = false
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    view.accessibilityElementsHidden = true
    guard let url = URL(string: uri), url.scheme == "https", url.host != nil,
      url.user == nil, url.password == nil
    else { return view }
    let color = { (value: UIColor) -> String in
      var r: CGFloat = 0
      var g: CGFloat = 0
      var b: CGFloat = 0
      var a: CGFloat = 0
      value.getRed(&r, green: &g, blue: &b, alpha: &a)
      return "rgba(\(Int(r * 255)),\(Int(g * 255)),\(Int(b * 255)),\(a))"
    }
    let escaped =
      url.absoluteString.addingPercentEncoding(
        withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "\"'<>\\()"))
      ) ?? ""
    view.loadHTMLString(
      """
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0}div{position:absolute;inset:0;background:\(color(filled ? Tokens.line : Tokens.text));-webkit-mask:url('\(escaped)') center/contain no-repeat}#owned{background:\(color(filled ? Tokens.primary : Tokens.text));clip-path:inset(0 \((1 - max(0, min(1, share))) * 100)% 0 0)}</style>
      <div></div><div id="owned"></div>
      """, baseURL: url)
    return view
  }
}
