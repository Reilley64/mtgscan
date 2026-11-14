import Foundation

enum CollectionLabels {
  static func printing(_ copy: CollectionCopy) -> String {
    var parts = ["\(copy.printing.setCode.uppercased()) \(copy.printing.collectorNumber)"]
    if copy.condition != "near_mint" {
      parts.append(PresentationData.conditionLabels[copy.condition] ?? copy.condition)
    }
    return parts.joined(separator: " · ")
  }

  static func spokenCopy(_ copy: CollectionCopy) -> String {
    var parts = [
      copy.printing.name, "\(copy.printing.setCode.uppercased()) \(copy.printing.collectorNumber)",
    ]
    if copy.finish != "nonfoil" {
      parts.append((PresentationData.finishLabels[copy.finish] ?? copy.finish).lowercased())
    }
    if copy.condition != "near_mint" {
      parts.append(PresentationData.conditionNames[copy.condition] ?? copy.condition)
    }
    if copy.protected { parts.append("protected") }
    if let deck = copy.deck { parts.append("in the deck \(deck.name)") }
    if let held = copy.heldFor { parts.append("held for the deck \(held.name)") }
    parts.append(copy.currentPrice.map { price($0.usdCents) } ?? "no price")
    return parts.joined(separator: ", ")
  }

  static func chips(_ copy: CollectionCopy) -> String {
    var parts = [copy.printing.setCode.uppercased(), copy.printing.collectorNumber]
    if copy.finish != "nonfoil" {
      parts.append(PresentationData.finishLabels[copy.finish] ?? copy.finish)
    }
    parts.append(PresentationData.conditionLabels[copy.condition] ?? copy.condition)
    parts.append(PresentationData.languageNames[copy.language] ?? copy.language)
    return parts.joined(separator: " · ")
  }

  static func price(_ cents: Int?) -> String {
    guard let cents else { return "–" }
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .currency
    formatter.currencyCode = "USD"
    return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "–"
  }

  static func added(_ isoDate: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: isoDate) ?? ISO8601DateFormatter().date(from: isoDate)
    else { return isoDate }
    let shown = DateFormatter()
    shown.dateStyle = .long
    return shown.string(from: date)
  }
}
