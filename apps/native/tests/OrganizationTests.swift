import Foundation

@MainActor
final class OrganizationRemote: OrganizationService {
  var tags = [UserTagSummary(userTagID: "tag", name: "Signed", copyCount: 1)]
  var deleted: [UserTagSummary] = []
  var failure: Error?
  var createFailure: OrganizationFailure?
  var protectedCopyID: String?
  var protectedValue: Bool?
  var lastUserTagChange: (accountID: String, copyID: String, userTagID: String, tagged: Bool)?
  var pending: CheckedContinuation<Void, Error>?
  var suspend = false

  func list(accountID: String, deleted: Bool) async throws -> [UserTagSummary] {
    if let failure { throw failure }
    return deleted ? self.deleted : tags
  }
  func create(accountID: String, name: String) async throws -> CollectionUserTag {
    if let failure { throw failure }
    if let createFailure { throw createFailure }
    let tag = CollectionUserTag(userTagID: "new", name: name)
    tags.append(UserTagSummary(userTagID: tag.userTagID, name: tag.name, copyCount: 0))
    return tag
  }
  func rename(accountID: String, userTagID: String, name: String) async throws {
    if let failure { throw failure }
    tags = tags.map {
      $0.userTagID == userTagID
        ? UserTagSummary(userTagID: userTagID, name: name, copyCount: $0.copyCount) : $0
    }
  }
  func delete(accountID: String, userTagID: String) async throws {
    if let failure { throw failure }
    deleted += tags.filter { $0.userTagID == userTagID }
    tags.removeAll { $0.userTagID == userTagID }
  }
  func restore(accountID: String, userTagID: String) async throws {
    if let failure { throw failure }
    tags += deleted.filter { $0.userTagID == userTagID }
    deleted.removeAll { $0.userTagID == userTagID }
  }
  func setUserTag(
    accountID: String, copyID: String, userTagID: String, tagged: Bool
  ) async throws {
    if let failure { throw failure }
    lastUserTagChange = (accountID, copyID, userTagID, tagged)
  }
  func protect(accountID: String, copyID: String, protected: Bool) async throws {
    if let failure { throw failure }
    protectedCopyID = copyID
    protectedValue = protected
    if suspend { try await withCheckedThrowingContinuation { pending = $0 } }
  }
}

@MainActor
func runOrganizationTests() async throws {
  let fixture = try Data(
    contentsOf: URL(fileURLWithPath: "crates/api/fixtures/collection-copy.json"))
  let copy = try JSONDecoder().decode(CollectionCopy.self, from: fixture)
  let remote = OrganizationRemote()
  let controller = OrganizationController(api: remote)
  var invalidations = 0
  controller.onMutation = { invalidations += 1 }
  controller.setAccount("owner")
  await controller.open(copy)
  precondition(controller.presentation.tags.first?.copyCount == 1)
  controller.search("sig")
  precondition(controller.presentation.filteredTags.first?.name == "Signed")
  precondition(controller.presentation.canCreate)
  controller.search(" SIGNED ")
  precondition(!controller.presentation.canCreate)
  controller.search("Trade binder")
  await controller.createAndAttach()
  precondition(remote.lastUserTagChange?.accountID == "owner")
  precondition(remote.lastUserTagChange?.copyID == copy.copyID)
  precondition(remote.lastUserTagChange?.userTagID == "new")
  precondition(remote.lastUserTagChange?.tagged == true)
  precondition(controller.presentation.query.isEmpty)
  precondition(invalidations == 2)
  await controller.protect(copy)
  precondition(remote.protectedCopyID == copy.copyID && remote.protectedValue == false)
  precondition(invalidations == 3)
  controller.reconcile(copy, accountID: "owner")
  remote.failure = OrganizationFailure(code: "user_tag_exists", field: "name")
  await controller.rename(userTagID: "tag", name: "Signed")
  precondition(controller.presentation.notice == "You already have a user tag named \"Signed\".")
  precondition(invalidations == 4)
  remote.failure = nil
  controller.reconcile(copy, accountID: "owner")
  await controller.reload()
  await controller.delete(userTagID: "tag")
  precondition(controller.presentation.deletedTags.first?.name == "Signed")
  controller.reconcile(copy, accountID: "owner")
  await controller.restore(userTagID: "tag")
  precondition(controller.presentation.deletedTags.isEmpty)
  remote.suspend = true
  let late = Task { await controller.protect(copy) }
  while remote.pending == nil { await Task.yield() }
  controller.setAccount("other")
  remote.pending?.resume()
  await late.value
  precondition(controller.presentation.copyID == nil && controller.presentation.tags.isEmpty)
  precondition(invalidations == 6)
  try await restoredUserTagsRequireAFreshCopyBeforeChangingItsLinks(fixture: fixture, copy: copy)
  await aUserTagCreatedElsewhereRefreshesThePickerWithoutAttaching(copy, listRefreshed: false)
  await aUserTagCreatedElsewhereRefreshesThePickerWithoutAttaching(copy, listRefreshed: true)
  print(
    "Organization unit checks passed: exact-copy actions, invalidation, filtering, field errors, retained tags, restore and account isolation."
  )
}

@MainActor
private func aUserTagCreatedElsewhereRefreshesThePickerWithoutAttaching(
  _ copy: CollectionCopy, listRefreshed: Bool
) async {
  let remote = OrganizationRemote()
  remote.tags = []
  let picker = OrganizationController(api: remote)
  var invalidations = 0
  picker.onMutation = { invalidations += 1 }
  picker.setAccount("owner")
  await picker.open(copy)
  picker.search("trade binder")
  precondition(picker.presentation.canCreate)

  let existing = UserTagSummary(userTagID: "existing", name: "Trade binder", copyCount: 0)
  remote.tags = [existing]
  if listRefreshed {
    await picker.reload()
    precondition(!picker.presentation.canCreate, "Hide Create when the list already has the tag")
  }
  remote.createFailure = OrganizationFailure(code: "user_tag_exists", field: "name")
  await picker.createAndAttach()

  precondition(picker.presentation.notice == nil, "A duplicate create should not show an error")
  precondition(
    picker.presentation.query.isEmpty, "A submitted create defers uniqueness to the server")
  precondition(picker.presentation.filteredTags == [existing])
  precondition(invalidations == 1)
  precondition(remote.lastUserTagChange == nil)
}

@MainActor
private func restoredUserTagsRequireAFreshCopyBeforeChangingItsLinks(
  fixture: Data, copy: CollectionCopy
) async throws {
  let restored = copy.userTags[0]
  guard var untagged = try JSONSerialization.jsonObject(with: fixture) as? [String: Any] else {
    preconditionFailure("Expected a copy fixture")
  }
  untagged["user_tags"] = [] as [String]
  let copyWithDeletedTag = try JSONDecoder().decode(
    CollectionCopy.self, from: JSONSerialization.data(withJSONObject: untagged))
  let remote = OrganizationRemote()
  remote.tags = []
  remote.deleted = [
    UserTagSummary(userTagID: restored.userTagID, name: restored.name, copyCount: 1)
  ]
  let picker = OrganizationController(api: remote)
  picker.setAccount("owner")
  await picker.open(copyWithDeletedTag)

  await picker.restore(userTagID: restored.userTagID)
  precondition(picker.presentation.copyID == copy.copyID)
  precondition(picker.presentation.tags.first?.userTagID == restored.userTagID)
  picker.reconcile(copy, accountID: "other")
  await picker.toggle(userTagID: restored.userTagID)
  precondition(remote.lastUserTagChange == nil)

  picker.reconcile(copy, accountID: "owner")
  precondition(picker.presentation.selectedUserTagIDs?.contains(restored.userTagID) == true)
  await picker.toggle(userTagID: restored.userTagID)
  precondition(remote.lastUserTagChange?.accountID == "owner")
  precondition(remote.lastUserTagChange?.copyID == copy.copyID)
  precondition(remote.lastUserTagChange?.userTagID == restored.userTagID)
  precondition(remote.lastUserTagChange?.tagged == false)
}
