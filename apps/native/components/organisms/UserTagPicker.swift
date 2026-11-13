import UIKit

@MainActor
final class UserTagPicker: UIStackView {
  private let controller: OrganizationController
  private let onRetry: () -> Void
  private let heading = CollectionControls.heading("User tags")
  private let caption = AuthControls.label("", style: .caption2)
  private let field = UserTagField(placeholder: "Find or create a user tag")
  private let rows = UIStackView()
  private var editorID: String?
  private var editor: UserTagNameEditor?

  init(controller: OrganizationController, onRetry: @escaping () -> Void) {
    self.controller = controller
    self.onRetry = onRetry
    super.init(frame: .zero)
    axis = .vertical
    spacing = Tokens.lg
    rows.axis = .vertical
    rows.spacing = Tokens.sm
    addArrangedSubview(heading)
    addArrangedSubview(caption)
    addArrangedSubview(field)
    addArrangedSubview(rows)
    field.onText = { [weak controller] in controller?.search($0) }
    field.onSubmit = { [weak controller] in Task { await controller?.createAndAttach() } }
  }

  required init(coder: NSCoder) { fatalError() }

  private func showNotice(_ notice: String) {
    let label = AuthControls.label(notice)
    label.textColor = Tokens.danger
    rows.addArrangedSubview(label)
  }

  func display() {
    let state = controller.presentation
    caption.text = state.copyLabel
    if field.text != state.query { field.text = state.query }
    field.isEnabled = !state.busy && !state.loading && !state.loadFailed
    for view in rows.arrangedSubviews {
      rows.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    if state.loading && state.tags.isEmpty {
      rows.addArrangedSubview(AuthControls.label("Loading user tags"))
      return
    }
    if state.loadFailed {
      rows.addArrangedSubview(AuthControls.label("Could not load your user tags"))
      rows.addArrangedSubview(AuthControls.label("Check your connection."))
      rows.addArrangedSubview(
        OrganizationControls.action("Try again", action: onRetry))
      return
    }
    if state.canCreate {
      rows.addArrangedSubview(
        OrganizationControls.action(
          "Create \"\(state.trimmedQuery)\"", symbol: "plus", enabled: !state.busy
        ) { [weak controller] in
          Task { await controller?.createAndAttach() }
        })
      rows.addArrangedSubview(AuthControls.label("and add it to this copy", style: .caption2))
    }
    if state.tags.isEmpty {
      rows.addArrangedSubview(AuthControls.label("No user tags yet. Type a name to create one."))
    }
    if state.editingTagID == nil {
      editorID = nil
      editor = nil
    }
    for tag in state.filteredTags {
      let id = tag.userTagID
      if state.editingTagID == id {
        if editorID != id {
          editorID = id
          editor = UserTagNameEditor(name: tag.name) { [weak controller] name in
            Task { await controller?.rename(tagID: id, name: name) }
          }
        }
        if let editor {
          editor.setBusy(state.busy)
          rows.addArrangedSubview(editor)
        }
        if let notice = state.notice { showNotice(notice) }
      } else {
        rows.addArrangedSubview(
          UserTagRow(
            name: tag.name, count: tag.copyCount, selected: state.selectedTags.contains(id),
            enabled: !state.busy,
            onToggle: { [weak controller] in Task { await controller?.toggle(tagID: id) } },
            onRename: { [weak controller] in controller?.edit(id) },
            onDelete: { [weak controller] in controller?.confirmDelete(id) }))
      }
      if state.deletingTagID == id {
        rows.addArrangedSubview(
          UserTagDeletion(
            name: tag.name, count: tag.copyCount, enabled: !state.busy,
            onDelete: { [weak controller] in Task { await controller?.delete(tagID: id) } },
            onCancel: { [weak controller] in controller?.confirmDelete(nil) }))
      }
    }
    if state.editingTagID == nil, let notice = state.notice { showNotice(notice) }
    if !state.deletedTags.isEmpty {
      rows.addArrangedSubview(CollectionControls.heading("Deleted user tags"))
      for tag in state.deletedTags {
        rows.addArrangedSubview(
          OrganizationControls.action("Restore \"\(tag.name)\"", enabled: !state.busy) {
            [weak controller] in
            Task { await controller?.restore(tagID: tag.userTagID) }
          })
      }
    }
  }
}
