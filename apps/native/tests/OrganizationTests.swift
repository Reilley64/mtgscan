import Foundation

@MainActor
final class OrganizationRemote: OrganizationService {
  var tags = [UserTagSummary(userTagID: "tag", name: "Signed", copyCount: 1)]
  var deleted: [UserTagSummary] = []
  var failure: Error?
  var protectedCopyID: String?
  var protectedValue: Bool?
  var attachedCopyID: String?
  var pending: CheckedContinuation<Void, Error>?
  var suspend = false

  func list(accountID: String, deleted: Bool) async throws -> [UserTagSummary] {
    if let failure { throw failure }
    return deleted ? self.deleted : tags
  }
  func create(accountID: String, name: String) async throws -> CollectionUserTag {
    if let failure { throw failure }
    let tag = CollectionUserTag(userTagID: "new", name: name)
    tags.append(UserTagSummary(userTagID: tag.userTagID, name: tag.name, copyCount: 0))
    return tag
  }
  func rename(accountID: String, tagID: String, name: String) async throws {
    if let failure { throw failure }
    tags = tags.map {
      $0.userTagID == tagID
        ? UserTagSummary(userTagID: tagID, name: name, copyCount: $0.copyCount) : $0
    }
  }
  func delete(accountID: String, tagID: String) async throws {
    if let failure { throw failure }
    deleted += tags.filter { $0.userTagID == tagID }
    tags.removeAll { $0.userTagID == tagID }
  }
  func restore(accountID: String, tagID: String) async throws {
    if let failure { throw failure }
    tags += deleted.filter { $0.userTagID == tagID }
    deleted.removeAll { $0.userTagID == tagID }
  }
  func setTag(accountID: String, copyID: String, tagID: String, tagged: Bool) async throws {
    if let failure { throw failure }
    attachedCopyID = copyID
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
  precondition(remote.attachedCopyID == copy.copyID)
  precondition(controller.presentation.query.isEmpty)
  precondition(invalidations == 2)
  await controller.protect(copy)
  precondition(remote.protectedCopyID == copy.copyID && remote.protectedValue == false)
  precondition(invalidations == 3)
  remote.failure = OrganizationFailure(code: "user_tag_exists", field: "name")
  await controller.rename(tagID: "tag", name: "Signed")
  precondition(controller.presentation.notice == "You already have a user tag named \"Signed\".")
  precondition(invalidations == 4)
  remote.failure = nil
  await controller.delete(tagID: "tag")
  precondition(controller.presentation.deletedTags.first?.name == "Signed")
  await controller.restore(tagID: "tag")
  precondition(controller.presentation.deletedTags.isEmpty)
  remote.suspend = true
  let late = Task { await controller.protect(copy) }
  while remote.pending == nil { await Task.yield() }
  controller.setAccount("other")
  remote.pending?.resume()
  await late.value
  precondition(controller.presentation.copyID == nil && controller.presentation.tags.isEmpty)
  precondition(invalidations == 6)
  print(
    "Organization unit checks passed: exact-copy actions, invalidation, filtering, field errors, retained tags, restore and account isolation."
  )
}
