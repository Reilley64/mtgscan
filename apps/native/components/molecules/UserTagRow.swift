import UIKit

@MainActor
final class UserTagRow: UIStackView {
  init(
    name: String, count: Int, selected: Bool, enabled: Bool, onToggle: @escaping () -> Void,
    onRename: @escaping () -> Void, onDelete: @escaping () -> Void
  ) {
    super.init(frame: .zero)
    spacing = Tokens.xs
    alignment = .center
    let choice = OrganizationControls.tag(
      name, count: count, selected: selected, enabled: enabled, action: onToggle)
    addArrangedSubview(choice)
    addArrangedSubview(
      OrganizationControls.more(
        label: "More, \(name)", enabled: enabled,
        items: [
          OrganizationMenuItem(title: "Rename", symbol: "pencil", action: onRename),
          OrganizationMenuItem(
            title: "Delete user tag", symbol: "trash", destructive: true, action: onDelete),
        ]))
    choice.setContentHuggingPriority(.defaultLow, for: .horizontal)
  }

  required init(coder: NSCoder) { fatalError() }
}

@MainActor
final class UserTagNameEditor: UIStackView {
  private let field: UserTagField
  private let save: UIButton

  init(name: String, onSave: @escaping (String) -> Void) {
    field = UserTagField(placeholder: "User tag name", text: name)
    let input = field
    save = OrganizationControls.action("Save") { onSave(input.text ?? "") }
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.xs
    addArrangedSubview(field)
    addArrangedSubview(save)
    field.onText = { [weak self] _ in self?.setBusy(false) }
    field.onSubmit = { onSave(input.text ?? "") }
  }

  required init(coder: NSCoder) { fatalError() }

  func setBusy(_ busy: Bool) {
    field.isEnabled = !busy
    save.isEnabled =
      !busy && !(field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

@MainActor
final class UserTagDeletion: UIStackView {
  init(
    name: String, count: Int, enabled: Bool, onDelete: @escaping () -> Void,
    onCancel: @escaping () -> Void
  ) {
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.sm
    backgroundColor = Tokens.surface
    layer.cornerRadius = Tokens.corner
    isLayoutMarginsRelativeArrangement = true
    layoutMargins = UIEdgeInsets(
      top: Tokens.sm, left: Tokens.sm, bottom: Tokens.sm, right: Tokens.sm)
    addArrangedSubview(
      AuthControls.label(
        "Delete \"\(name)\"? It comes off \(count) \(count == 1 ? "copy" : "copies")."))
    addArrangedSubview(
      OrganizationControls.action(
        "Delete user tag", symbol: "trash", danger: true, enabled: enabled, action: onDelete))
    addArrangedSubview(OrganizationControls.action("Cancel", enabled: enabled, action: onCancel))
  }

  required init(coder: NSCoder) { fatalError() }
}
