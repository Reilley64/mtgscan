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
  let (copyWithDeletedTag, otherCopy) = try untaggedCopies(fixture: fixture)
  await aLateProtectionRereadCannotReplaceTheCurrentCopy(
    copy: copy, original: copyWithDeletedTag, otherCopy: otherCopy)
  await restoredUserTagsRequireAFreshCopyBeforeChangingItsLinks(
    copy: copy, copyWithDeletedTag: copyWithDeletedTag, otherCopy: otherCopy)
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

private func untaggedCopies(fixture: Data) throws -> (CollectionCopy, CollectionCopy) {
  guard var untagged = try JSONSerialization.jsonObject(with: fixture) as? [String: Any] else {
    preconditionFailure("Expected a copy fixture")
  }
  untagged["user_tags"] = [String]()
  untagged["protected"] = false
  let copyWithDeletedTag = try JSONDecoder().decode(
    CollectionCopy.self, from: JSONSerialization.data(withJSONObject: untagged))
  untagged["copy_id"] = "10000000-0000-4000-8000-000000000002"
  let otherCopy = try JSONDecoder().decode(
    CollectionCopy.self, from: JSONSerialization.data(withJSONObject: untagged))
  return (copyWithDeletedTag, otherCopy)
}

@MainActor
private func takeCopyRequest(
  _ remote: CollectionRemote, _ expected: String
) async -> CheckedContinuation<CollectionCopy, Error> {
  let clock = ContinuousClock()
  let deadline = clock.now + .seconds(3)
  while clock.now < deadline {
    if let reply = remote.pendingCopy {
      remote.pendingCopy = nil
      return reply
    }
    try? await clock.sleep(for: .milliseconds(1))
  }
  preconditionFailure("Missing copy request: \(expected)")
}

@MainActor
private func restoredUserTagsRequireAFreshCopyBeforeChangingItsLinks(
  copy: CollectionCopy, copyWithDeletedTag: CollectionCopy, otherCopy: CollectionCopy
) async {
  let restored = copy.userTags[0]
  let collectionRemote = CollectionRemote()
  collectionRemote.copies = [copyWithDeletedTag]
  let collection = CollectionController(api: collectionRemote)
  let remote = OrganizationRemote()
  remote.tags = []
  remote.deleted = [
    UserTagSummary(userTagID: restored.userTagID, name: restored.name, copyCount: 1)
  ]
  let picker = OrganizationController(api: remote)
  collection.onCopyChange = { [weak picker] in picker?.reconcile($0, accountID: $1) }
  var reread: Task<Void, Never>?
  picker.onMutation = {
    reread = collection.invalidateOrganization()
    precondition(
      collection.presentation.copy == nil && collection.presentation.copies.isEmpty,
      "Post-mutation invalidation must clear snapshots before scheduling the reread")
  }
  collection.setAccount("owner")
  picker.setAccount("owner")
  await collection.reload()
  await collection.open(copy.copyID)
  await picker.open(collection.presentation.copy!)

  collectionRemote.suspendCopy = true
  let staleRead = Task { await collection.reload() }
  let staleReply = await takeCopyRequest(collectionRemote, "before restore")
  await picker.restore(userTagID: restored.userTagID)
  guard let restoreRead = reread else { preconditionFailure("Expected a restore reread") }
  let restoreReply = await takeCopyRequest(collectionRemote, "after restore")
  precondition(
    collection.presentation.copy == nil && collection.presentation.copies.isEmpty,
    "A delayed post-mutation reread must not show the previous copy or browse snapshot")
  precondition(collection.presentation.selectedCopyID == copy.copyID)
  precondition(collection.presentation.state == .loading)
  precondition(picker.presentation.tags.first?.userTagID == restored.userTagID)
  precondition(!picker.presentation.canChangeUserTags)
  await picker.toggle(userTagID: restored.userTagID)
  precondition(remote.lastUserTagChange == nil)

  restoreReply.resume(throwing: CollectionFailure.unavailable)
  await restoreRead.value
  precondition(
    collection.presentation.copy == nil && collection.presentation.state == .failed,
    "A failed post-mutation reread must not retain the previous copy")
  picker.reconcile(copy, accountID: "other")
  precondition(
    !picker.presentation.canChangeUserTags, "Organizer must reject another account's copy")
  await picker.toggle(userTagID: restored.userTagID)
  precondition(remote.lastUserTagChange == nil)

  staleReply.resume(returning: copyWithDeletedTag)
  await staleRead.value
  precondition(collection.presentation.copy == nil)
  precondition(!picker.presentation.canChangeUserTags)

  let retry = Task { await collection.open(copy.copyID) }
  let retryReply = await takeCopyRequest(collectionRemote, "retry after restore")
  precondition(collection.presentation.copy == nil, "Reopening must not use an invalidated copy")
  precondition(!picker.presentation.canChangeUserTags)
  retryReply.resume(returning: otherCopy)
  await retry.value
  precondition(collection.presentation.copy == nil, "A reply for another copy must not load")
  precondition(!picker.presentation.canChangeUserTags)

  collectionRemote.suspendCopy = false
  collectionRemote.copies = [copy]
  await collection.reload()
  precondition(collection.presentation.copy?.protected == true)
  precondition(picker.presentation.selectedUserTagIDs == [restored.userTagID])
  precondition(picker.presentation.canChangeUserTags)
  await picker.toggle(userTagID: restored.userTagID)
  await reread?.value
  precondition(remote.lastUserTagChange?.accountID == "owner")
  precondition(remote.lastUserTagChange?.copyID == copy.copyID)
  precondition(remote.lastUserTagChange?.userTagID == restored.userTagID)
  precondition(remote.lastUserTagChange?.tagged == false)
}

@MainActor
private func aLateProtectionRereadCannotReplaceTheCurrentCopy(
  copy: CollectionCopy, original: CollectionCopy, otherCopy: CollectionCopy
) async {
  for (nextAccount, nextCopy) in [("other", original), ("owner", otherCopy)] {
    let collectionRemote = CollectionRemote()
    collectionRemote.copies = [original]
    let collection = CollectionController(api: collectionRemote)
    let remote = OrganizationRemote()
    let picker = OrganizationController(api: remote)
    collection.onCopyChange = { [weak picker] in picker?.reconcile($0, accountID: $1) }
    var reread: Task<Void, Never>?
    picker.onMutation = { reread = collection.invalidateOrganization() }
    collection.setAccount("owner")
    picker.setAccount("owner")
    await collection.open(copy.copyID)
    await picker.open(collection.presentation.copy!)

    collectionRemote.suspendCopy = true
    await picker.protect(collection.presentation.copy!)
    guard let reread else { preconditionFailure("Expected a protection reread") }
    precondition(remote.protectedCopyID == copy.copyID && remote.protectedValue == true)
    let protectionReply = await takeCopyRequest(collectionRemote, "after protection")
    precondition(
      collection.presentation.copy == nil && !picker.presentation.canChangeUserTags,
      "A delayed protection reread must not keep the previous copy or editable user tags")

    collection.setAccount(nextAccount)
    picker.setAccount(nextAccount)
    collectionRemote.suspendCopy = false
    collectionRemote.copies = [nextCopy]
    await collection.open(nextCopy.copyID)
    await picker.open(collection.presentation.copy!)
    protectionReply.resume(returning: copy)
    await reread.value

    precondition(
      collection.presentation.copy == nextCopy,
      "A late protection reread must not replace a newer account or copy selection")
    precondition(picker.presentation.selectedUserTagIDs == [])
  }
}
