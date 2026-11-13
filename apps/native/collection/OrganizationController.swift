import Foundation

struct OrganizationPresentation {
  var copyID: String?
  var copyLabel = ""
  var selectedTags: Set<String> = []
  var tags: [UserTagSummary] = []
  var deletedTags: [UserTagSummary] = []
  var query = ""
  var busy = false
  var loading = false
  var loadFailed = false
  var notice: String?
  var protectionError: String?
  var editingTagID: String?
  var deletingTagID: String?

  var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
  var filteredTags: [UserTagSummary] {
    tags.filter { trimmedQuery.isEmpty || $0.name.lowercased().contains(trimmedQuery.lowercased()) }
  }
  var canCreate: Bool {
    !trimmedQuery.isEmpty && trimmedQuery.unicodeScalars.count <= 64
      && !tags.contains { $0.name.lowercased() == trimmedQuery.lowercased() }
  }
}

@MainActor
final class OrganizationController {
  private let api: any OrganizationService
  private var accountID: String?
  private var generation = 0
  private var readGeneration = 0
  private(set) var presentation = OrganizationPresentation()
  var onChange: (() -> Void)?
  var onMutation: (() -> Void)?
  var onRefusal: (() -> Void)?

  init(api: any OrganizationService) { self.api = api }

  func setAccount(_ accountID: String?) {
    guard self.accountID != accountID else { return }
    self.accountID = accountID
    generation += 1
    readGeneration += 1
    presentation = OrganizationPresentation()
    onChange?()
  }

  func open(_ copy: CollectionCopy) async {
    presentation = OrganizationPresentation(
      copyID: copy.copyID, copyLabel: "\(copy.printing.name) · \(CollectionLabels.chips(copy))",
      selectedTags: Set(copy.userTags.map(\.userTagID)))
    await reload()
  }

  func reconcile(_ copy: CollectionCopy) {
    guard presentation.copyID == copy.copyID else { return }
    presentation.selectedTags = Set(copy.userTags.map(\.userTagID))
    onChange?()
  }

  func close() {
    readGeneration += 1
    presentation.copyID = nil
    presentation.notice = nil
    onChange?()
  }

  func search(_ query: String) {
    presentation.query = query
    presentation.notice = nil
    onChange?()
  }

  func edit(_ id: String?) {
    presentation.editingTagID = id
    presentation.deletingTagID = nil
    presentation.notice = nil
    onChange?()
  }

  func confirmDelete(_ id: String?) {
    presentation.deletingTagID = id
    presentation.editingTagID = nil
    presentation.notice = nil
    onChange?()
  }

  func clearProtectionError() { presentation.protectionError = nil }

  func reload() async {
    guard let accountID, presentation.copyID != nil else { return }
    readGeneration += 1
    let read = readGeneration
    let operation = generation
    presentation.loading = true
    presentation.loadFailed = false
    onChange?()
    do {
      let tags = try await api.list(accountID: accountID, deleted: false)
      let deleted = try await api.list(accountID: accountID, deleted: true)
      guard operation == generation, read == readGeneration else { return }
      presentation.tags = tags
      presentation.deletedTags = deleted
    } catch {
      guard operation == generation, read == readGeneration else { return }
      if refused(error) { return }
      presentation.loadFailed = true
    }
    presentation.loading = false
    onChange?()
  }

  func createAndAttach() async {
    guard presentation.canCreate, !presentation.loading, !presentation.loadFailed,
      let copyID = presentation.copyID
    else { return }
    let name = presentation.trimmedQuery
    await mutate(name: name) { accountID, operation in
      let tag = try await self.api.create(accountID: accountID, name: name)
      guard self.changed(operation) else { return }
      try await self.api.setTag(
        accountID: accountID, copyID: copyID, tagID: tag.userTagID, tagged: true)
      guard self.changed(operation) else { return }
      if self.presentation.copyID == copyID {
        self.presentation.selectedTags.insert(tag.userTagID)
        self.presentation.query = ""
      }
    }
  }

  func toggle(tagID: String) async {
    guard let copyID = presentation.copyID else { return }
    let tagged = !presentation.selectedTags.contains(tagID)
    await mutate { accountID, operation in
      try await self.api.setTag(accountID: accountID, copyID: copyID, tagID: tagID, tagged: tagged)
      guard self.changed(operation), self.presentation.copyID == copyID else { return }
      if tagged {
        self.presentation.selectedTags.insert(tagID)
      } else {
        self.presentation.selectedTags.remove(tagID)
      }
    }
  }

  func rename(tagID: String, name: String) async {
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }
    await mutate(name: name) { accountID, operation in
      try await self.api.rename(accountID: accountID, tagID: tagID, name: name)
      guard self.changed(operation) else { return }
      self.presentation.editingTagID = nil
    }
  }

  func delete(tagID: String) async {
    await mutate { accountID, operation in
      try await self.api.delete(accountID: accountID, tagID: tagID)
      guard self.changed(operation) else { return }
      self.presentation.deletingTagID = nil
    }
  }

  func restore(tagID: String) async {
    await mutate { accountID, operation in
      try await self.api.restore(accountID: accountID, tagID: tagID)
      _ = self.changed(operation)
    }
  }

  func protect(_ copy: CollectionCopy) async {
    guard let accountID, !presentation.busy else { return }
    let operation = generation
    presentation.busy = true
    onChange?()
    do {
      try await api.protect(accountID: accountID, copyID: copy.copyID, protected: !copy.protected)
      guard changed(operation) else { return }
    } catch {
      guard operation == generation else { return }
      if refused(error) { return }
      presentation.protectionError =
        copy.protected ? "Could not unprotect this card" : "Could not protect this card"
      onMutation?()
    }
    presentation.busy = false
    onChange?()
  }

  private func mutate(
    name: String? = nil,
    _ action: (String, Int) async throws -> Void
  ) async {
    guard let accountID, !presentation.busy else { return }
    let operation = generation
    presentation.busy = true
    presentation.notice = nil
    onChange?()
    do {
      try await action(accountID, operation)
    } catch {
      guard operation == generation else { return }
      if refused(error) { return }
      if let failure = error as? OrganizationFailure, failure.code == "user_tag_exists" {
        presentation.notice =
          name.map { "You already have a user tag named \"\($0)\"." }
          ?? "You already have another user tag with the name of this user tag."
      } else {
        presentation.notice = "Could not change the user tags. Check your connection."
      }
      onMutation?()
    }
    guard operation == generation else { return }
    await reload()
    guard operation == generation else { return }
    presentation.busy = false
    onChange?()
  }

  private func changed(_ operation: Int) -> Bool {
    guard operation == generation else { return false }
    onMutation?()
    return true
  }

  private func refused(_ error: Error) -> Bool {
    switch error {
    case CollectionFailure.unauthenticated, CollectionFailure.forbidden,
      SessionFailure.unauthenticated:
      generation += 1
      readGeneration += 1
      presentation = OrganizationPresentation()
      onRefusal?()
      onChange?()
      return true
    default: return false
    }
  }
}
