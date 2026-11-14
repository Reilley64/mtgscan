import Foundation

@MainActor
final class DeckRemote: DeckService {
  var decks: [DeckSummary] = []
  var deck: DeckContents?
  var failure: DeckFailure?
  var suspend = false
  var pending: CheckedContinuation<[DeckSummary], Error>?
  var suspendContents = false
  var pendingContents: CheckedContinuation<DeckContents, Error>?
  var writes: [DeckMetadataChange] = []

  func browse(accountID: String) async throws -> [DeckSummary] {
    if let failure { throw failure }
    if suspend { return try await withCheckedThrowingContinuation { pending = $0 } }
    return decks
  }

  func contents(accountID: String, deckID: String) async throws -> DeckContents {
    if suspendContents {
      return try await withCheckedThrowingContinuation { pendingContents = $0 }
    }
    if let failure { throw failure }
    guard let deck, deck.summary.deckID == deckID else { throw DeckFailure.notFound }
    return deck
  }

  func create(accountID: String, name: String) async throws -> String {
    if let failure { throw failure }
    guard let deck else { throw DeckFailure.unavailable }
    return deck.summary.deckID
  }

  func metadata(accountID: String, deckID: String, change: DeckMetadataChange) async throws {
    if let failure { throw failure }
    writes.append(change)
  }
}

enum DeckTests {
  @MainActor
  private static func warmReopenRetainsContentsOnTransientFailure() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
    let deck = try JSONDecoder().decode(DeckContents.self, from: fixture)
    let remote = DeckRemote()
    remote.deck = deck
    remote.decks = [deck.summary]
    let controller = DeckController(api: remote)
    controller.setAccount("owner-a")
    await controller.open(deck.summary.deckID)
    await controller.close()
    remote.suspendContents = true
    let reopen = Task { await controller.open(deck.summary.deckID) }
    while remote.pendingContents == nil { await Task.yield() }
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.deck?.summary.revision == 7)
    precondition(controller.presentation.deck?.basicLands.first?.count == 8)
    remote.pendingContents?.resume(throwing: DeckFailure.unavailable)
    await reopen.value
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.deck?.summary.revision == 7)
    precondition(controller.presentation.deck?.basicLands.first?.count == 8)
  }

  @MainActor
  private static func warmDeckLifetimeStartsAtCloseAndExpires() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
    let deck = try JSONDecoder().decode(DeckContents.self, from: fixture)
    let remote = DeckRemote()
    remote.deck = deck
    remote.decks = [deck.summary]
    var seconds: TimeInterval = 1000
    let controller = DeckController(
      api: remote, now: { Date(timeIntervalSince1970: seconds) })
    controller.setAccount("owner-a")
    await controller.open(deck.summary.deckID)
    seconds = 2000
    await controller.close()
    seconds = 2299
    remote.failure = .unavailable
    await controller.open(deck.summary.deckID)
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.deck?.summary.revision == 7)
    remote.failure = nil
    await controller.close()
    seconds = 2600
    remote.suspendContents = true
    let expired = Task { await controller.open(deck.summary.deckID) }
    while remote.pendingContents == nil { await Task.yield() }
    precondition(controller.presentation.state == .loading)
    precondition(controller.presentation.deck == nil)
    remote.pendingContents?.resume(throwing: DeckFailure.unavailable)
    await expired.value
    precondition(controller.presentation.state == .failed)
    precondition(controller.presentation.deck == nil)
  }

  @MainActor
  private static func cachedDecksClearOnAccountChangeAndRefusal() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
    let deck = try JSONDecoder().decode(DeckContents.self, from: fixture)
    for failure in [DeckFailure.unauthenticated, .forbidden, .notFound] {
      let remote = DeckRemote()
      remote.deck = deck
      remote.decks = [deck.summary]
      let controller = DeckController(api: remote)
      controller.setAccount("owner-a")
      await controller.open(deck.summary.deckID)
      await controller.close()
      remote.failure = failure
      await controller.open(deck.summary.deckID)
      remote.failure = nil
      remote.suspendContents = true
      let retry = Task { await controller.open(deck.summary.deckID) }
      while remote.pendingContents == nil { await Task.yield() }
      precondition(controller.presentation.deck == nil)
      precondition(controller.presentation.state == .loading)
      remote.pendingContents?.resume(throwing: DeckFailure.unavailable)
      await retry.value
    }
    for account: String? in ["owner-b", nil] {
      let remote = DeckRemote()
      remote.deck = deck
      remote.decks = [deck.summary]
      let controller = DeckController(api: remote)
      controller.setAccount("owner-a")
      await controller.open(deck.summary.deckID)
      await controller.close()
      controller.setAccount(account)
      controller.setAccount("owner-b")
      remote.suspendContents = true
      let newAccount = Task { await controller.open(deck.summary.deckID) }
      while remote.pendingContents == nil { await Task.yield() }
      precondition(controller.presentation.deck == nil)
      precondition(controller.presentation.state == .loading)
      remote.pendingContents?.resume(throwing: DeckFailure.unavailable)
      await newAccount.value
    }
  }

  @MainActor
  private static func leavingDeckClearsOriginsWithoutWaitingForBrowse() async throws {
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
    let deck = try JSONDecoder().decode(DeckContents.self, from: fixture)
    let remote = DeckRemote()
    remote.deck = deck
    remote.decks = [deck.summary]
    let controller = DeckController(api: remote)
    controller.setAccount("owner-a")
    await controller.reload()
    await controller.open(deck.summary.deckID)
    controller.openCopy("10000000-0000-4000-8000-000000000001")
    await controller.open(deck.summary.deckID)
    remote.suspendContents = true
    let oldRead = Task { await controller.reload() }
    while remote.pendingContents == nil { await Task.yield() }
    remote.suspend = true
    controller.showGallery()
    precondition(controller.presentation.selectedDeckID == nil)
    precondition(controller.presentation.selectedCopyID == nil)
    precondition(controller.presentation.deck == nil)
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.decks.first?.deckID == deck.summary.deckID)
    remote.pendingContents?.resume(returning: deck)
    await oldRead.value
    precondition(controller.presentation.selectedDeckID == nil)
    precondition(controller.presentation.deck == nil)
    remote.suspend = false
    remote.suspendContents = false
    await controller.open(deck.summary.deckID)
    await controller.close()
    precondition(controller.presentation.selectedDeckID == nil)
    precondition(controller.presentation.selectedCopyID == nil)
  }

  @MainActor
  static func run() async throws {
    try await leavingDeckClearsOriginsWithoutWaitingForBrowse()
    try await warmReopenRetainsContentsOnTransientFailure()
    try await warmDeckLifetimeStartsAtCloseAndExpires()
    try await cachedDecksClearOnAccountChangeAndRefusal()
    let remote = DeckRemote()
    let controller = DeckController(api: remote)
    precondition(controller.presentation.state == .signedOut)
    controller.setAccount("owner-a")
    precondition(controller.presentation.state == .loading)
    await controller.reload()
    precondition(controller.presentation.state == .empty)
    precondition(controller.presentation.message == "No decks yet")
    remote.failure = .unavailable
    await controller.reload()
    precondition(controller.presentation.state == .empty)
    controller.setAccount("owner-b")
    await controller.reload()
    precondition(controller.presentation.message == "Could not load your decks")
    remote.failure = nil
    let fixture = try Data(contentsOf: URL(fileURLWithPath: "crates/api/fixtures/deck.json"))
    let deck = try JSONDecoder().decode(DeckContents.self, from: fixture)
    precondition(
      DeckOrdering.commanders(deck).map(\.copyID) == ["10000000-0000-4000-8000-000000000001"])
    let lands = DeckOrdering.groups(deck, grouping: .type, sort: .name, ascending: true)
    precondition(lands.map(\.title) == ["Lands"])
    precondition(lands[0].tiles.count == 8)
    precondition(Set(lands[0].tiles.map(\.id)).count == 8)
    precondition(lands[0].tiles.allSatisfy { $0.copyID == nil && $0.name == "Island" })
    precondition(
      DeckOrdering.groups(deck, grouping: .color, sort: .price, ascending: false).map(\.title) == [
        "Colorless"
      ])
    precondition(
      DeckOrdering.groups(deck, grouping: .rarity, sort: .added, ascending: false).map(\.title) == [
        "Common"
      ])
    remote.deck = deck
    remote.decks = [deck.summary]
    await controller.reload()
    await controller.open(deck.summary.deckID)
    precondition(controller.presentation.selectedDeckID == deck.summary.deckID)
    precondition(controller.presentation.deck?.summary.revision == 7)
    precondition(controller.presentation.deck?.basicLands.first?.count == 8)
    precondition(controller.presentation.deck?.summary.evaluation?.validityStale == true)
    precondition(remote.writes == [.used])
    controller.openCopy("10000000-0000-4000-8000-000000000001")
    precondition(
      controller.presentation.selectedCopyID == "10000000-0000-4000-8000-000000000001")
    remote.suspend = true
    controller.closeCopy()
    precondition(controller.presentation.selectedCopyID == nil)
    precondition(controller.presentation.selectedDeckID == deck.summary.deckID)
    precondition(controller.presentation.deck?.summary.revision == 7)
    precondition(controller.presentation.state == .loaded)
    remote.suspend = false
    await controller.rename("Same name")
    await controller.setPriority(.low)
    precondition(remote.writes == [.used, .rename("Same name"), .priority(.low)])
    precondition(controller.presentation.deck?.summary.revision == 7)
    remote.failure = .unavailable
    await controller.rename("Not saved")
    precondition(controller.presentation.writeFailure == "Could not rename this deck")
    precondition(controller.presentation.deck?.summary.name == "Same name")
    remote.failure = .notFound
    await controller.reload()
    precondition(controller.presentation.selectedDeckID == nil)
    remote.failure = nil
    await controller.create("New deck")
    precondition(controller.presentation.selectedDeckID == deck.summary.deckID)
    remote.failure = .forbidden
    await controller.reload()
    precondition(controller.presentation.state == .refused)
    precondition(controller.presentation.deck == nil && controller.presentation.decks.isEmpty)
    remote.failure = nil
    remote.suspend = true
    let old = Task { await controller.close() }
    while remote.pending == nil { await Task.yield() }
    controller.setAccount("owner-c")
    remote.pending?.resume(returning: [deck.summary])
    await old.value
    precondition(controller.presentation.decks.isEmpty)
    precondition(controller.presentation.state == .loading)
    remote.pending = nil
    let invalidatedRead = Task { await controller.reload() }
    while remote.pending == nil { await Task.yield() }
    remote.failure = .forbidden
    await controller.create("Forbidden")
    remote.pending?.resume(returning: [deck.summary])
    await invalidatedRead.value
    precondition(controller.presentation.state == .refused)
    precondition(controller.presentation.decks.isEmpty)
    precondition(DeckNameInput.checked(" \n ") == nil)
    precondition(DeckNameInput.checked(String(repeating: "x", count: 65)) == nil)
    precondition(DeckNameInput.checked("  Same name  ") == "Same name")
    await copyDeckTagKeepsTheImmediateReturnOrigin(deck)
  }

  @MainActor
  private static func copyDeckTagKeepsTheImmediateReturnOrigin(_ deck: DeckContents) async {
    let remote = DeckRemote()
    remote.deck = deck
    remote.decks = [deck.summary]
    let controller = DeckController(api: remote)
    controller.setAccount("owner-a")
    await controller.open(deck.summary.deckID)
    controller.openCopy("10000000-0000-4000-8000-000000000001")
    await controller.open(deck.summary.deckID)
    precondition(controller.presentation.selectedCopyID == nil)
    await controller.close()
    precondition(
      controller.presentation.selectedCopyID == "10000000-0000-4000-8000-000000000001")
    precondition(controller.presentation.selectedDeckID == deck.summary.deckID)
    precondition(controller.presentation.deck?.summary.revision == 7)
    controller.closeCopy()
    precondition(controller.presentation.selectedCopyID == nil)
    precondition(controller.presentation.selectedDeckID == deck.summary.deckID)
    await controller.close()
    precondition(controller.presentation.selectedDeckID == nil)
    await controller.open(deck.summary.deckID)
    controller.openCopy("10000000-0000-4000-8000-000000000001")
    await controller.open(deck.summary.deckID)
    controller.setAccount("owner-b")
    remote.decks = []
    await controller.close()
    precondition(controller.presentation.selectedCopyID == nil)
    precondition(controller.presentation.selectedDeckID == nil)
    precondition(controller.presentation.decks.isEmpty)
  }
}
