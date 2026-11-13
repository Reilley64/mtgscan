import UIKit

@MainActor
final class CollectionSearch: UIStackView {
  let field = CollectionSearchBar()
  private let toolbar = UIStackView()
  private let onCommand: ([String: Any]) -> Void
  private let onFilters: () -> Void
  private let onSignOut: () -> Void

  init(
    onCommand: @escaping ([String: Any]) -> Void, onFilters: @escaping () -> Void,
    onEditing: @escaping (Bool) -> Void, onSignOut: @escaping () -> Void
  ) {
    self.onCommand = onCommand
    self.onFilters = onFilters
    self.onSignOut = onSignOut
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.xs
    let title = AuthControls.label("Collection", style: .largeTitle)
    title.accessibilityTraits.insert(.header)
    addArrangedSubview(title)
    addArrangedSubview(toolbar)
    addArrangedSubview(field)
    field.onText = { onCommand(["kind": "text", "text": $0]) }
    field.onSubmit = { onCommand(["kind": "submit"]) }
    field.onCancel = { onCommand(["kind": "cancel"]) }
    field.onBackspace = { onCommand(["kind": "backspace"]) }
    field.onEditing = onEditing
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ output: CollectionSearchOutput) {
    if field.text != output.state.text { field.text = output.state.text }
    for view in toolbar.arrangedSubviews {
      toolbar.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    toolbar.spacing = Tokens.sm
    toolbar.addArrangedSubview(
      CollectionSearchControls.filters(count: output.filterCount, action: onFilters))
    toolbar.addArrangedSubview(AuthControls.button("Sign out", action: onSignOut))
  }
}

@MainActor
final class CollectionSearchChips: UIStackView {
  private let onCommand: ([String: Any]) -> Void

  init(onCommand: @escaping ([String: Any]) -> Void) {
    self.onCommand = onCommand
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.xs
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ output: CollectionSearchOutput) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    for (index, label) in output.chipLabels.enumerated() {
      addArrangedSubview(
        CollectionSearchControls.chip(label, refused: output.refusedIndex == index, removable: true)
        { [onCommand] in onCommand(["kind": "remove", "index": index]) })
    }
    isHidden = output.chipLabels.isEmpty
  }
}

@MainActor
final class CollectionFilters: UIStackView {
  private let onCommand: ([String: Any]) -> Void
  private let onClose: () -> Void

  init(onCommand: @escaping ([String: Any]) -> Void, onClose: @escaping () -> Void) {
    self.onCommand = onCommand
    self.onClose = onClose
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
  }

  required init(coder: NSCoder) { fatalError() }

  func display(_ output: CollectionSearchOutput) {
    for view in arrangedSubviews {
      removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    addArrangedSubview(CollectionControls.heading("Filters"))
    addArrangedSubview(AuthControls.button("Close", action: onClose))
    for (section, filter) in output.filters.enumerated() {
      addArrangedSubview(CollectionControls.heading(filter.title))
      for (index, choice) in filter.choices.enumerated() {
        addArrangedSubview(
          CollectionSearchControls.chip(choice.label, selected: choice.selected) { [onCommand] in
            onCommand(["kind": "filter", "section": section, "index": index])
          })
      }
      if section == 0 && !output.userTagFilters.isEmpty {
        for (title, negated) in [("With user tags", false), ("Without user tags", true)] {
          addArrangedSubview(CollectionControls.heading(title))
          for tag in output.userTagFilters {
            addArrangedSubview(
              CollectionSearchControls.chip(
                tag.name, selected: negated ? tag.excluded : tag.included
              ) { [onCommand] in
                onCommand(["kind": "userTag", "name": tag.name, "negated": negated])
              })
          }
        }
      }
    }
  }
}
