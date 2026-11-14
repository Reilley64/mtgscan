import UIKit

@MainActor
final class CatalogSearch: UIStackView {
  private let controller: CatalogController
  private let filters = UIStackView()
  private let tags = UIStackView()
  private var query = CatalogQuery()
  private var tagText = ""
  private var fieldViews: [String: SearchField] = [:]

  init(controller: CatalogController) {
    self.controller = controller
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
    addArrangedSubview(
      SearchField("Search card catalog") { [weak self] text in
        guard let self else { return }
        self.query.fields["text"] = text.isEmpty ? nil : .text(text)
        self.controller.schedule(self.query)
      })
    addArrangedSubview(
      AuthControls.button("Filters") { [weak self] in
        guard let self else { return }
        self.filters.isHidden.toggle()
      })
    filters.axis = .vertical
    filters.spacing = Tokens.sm
    filters.isHidden = true
    filters.addArrangedSubview(
      AuthControls.label(
        "Separate list values with commas. Use [] for an empty color identity.", style: .caption2))
    for field in CatalogFilterField.fields {
      switch field.kind {
      case .choice(let choices):
        let options =
          [("", "Any")]
          + choices.map { ($0.value, $0.label) }
        filters.addArrangedSubview(
          SearchControls.choice(field.label, options: options, selected: nil) { [weak self] value in
            self?.set(field, value)
          })
      default:
        let input = SearchField(field.label) { [weak self] value in self?.set(field, value) }
        fieldViews[field.key] = input
        filters.addArrangedSubview(input)
      }
    }
    filters.addArrangedSubview(
      SearchField("Find Oracle tags") { [weak self] text in
        guard let self else { return }
        self.tagText = text
        self.controller.scheduleTags(text)
      })
    filters.addArrangedSubview(tags)
    addArrangedSubview(filters)
  }

  required init(coder: NSCoder) { fatalError() }

  private func set(_ field: CatalogFilterField, _ value: String) {
    query.fields[field.key] = field.value(value)
    controller.schedule(query)
  }

  func display(_ state: CatalogPresentation) {
    query = state.query
    for (key, input) in fieldViews {
      let text: String
      switch state.query.fields[key] {
      case .text(let value): text = value
      case .number(let value): text = String(value)
      case .list(let values): text = values.isEmpty ? "[]" : values.joined(separator: ", ")
      default: text = ""
      }
      input.show(text)
    }
    for view in tags.arrangedSubviews {
      tags.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if let message = state.tagMessage {
      tags.addArrangedSubview(AuthControls.label(message))
      tags.addArrangedSubview(
        AuthControls.button("Try again") { [weak self] in
          guard let self else { return }
          Task { await self.controller.lookupTags(self.tagText) }
        })
    }
    for tag in state.tags {
      tags.addArrangedSubview(
        AuthControls.button("\(tag.label) · \(tag.cardCount) cards") { [weak self] in
          guard let self else { return }
          var slugs: [String] = []
          if case .list(let existing)? = self.query.fields["tags"] { slugs = existing }
          if !slugs.contains(tag.slug) { slugs.append(tag.slug) }
          self.query.fields["tags"] = .list(slugs)
          self.controller.schedule(self.query)
        })
    }
  }
}
