import Foundation

@MainActor
final class CollectionRemote: CollectionService {
  var copies: [CollectionCopy] = []
  var failure: CollectionFailure?
  var pending: CheckedContinuation<[CollectionCopy], Error>?
  var suspend = false
  var suspendCopy = false
  var pendingCopy: CheckedContinuation<CollectionCopy, Error>?

  func browse(accountID: String) async throws -> [CollectionCopy] {
    if let failure { throw failure }
    if suspend { return try await withCheckedThrowingContinuation { pending = $0 } }
    return copies
  }

  func search(accountID: String, query: CollectionSearchQuery, cursor: String?) async throws
    -> CollectionSearchPage
  {
    CollectionSearchPage(copies: try await browse(accountID: accountID))
  }

  func copy(accountID: String, copyID: String) async throws -> CollectionCopy {
    if let failure { throw failure }
    if suspendCopy { return try await withCheckedThrowingContinuation { pendingCopy = $0 } }
    guard let copy = copies.first(where: { $0.copyID == copyID }) else {
      throw CollectionFailure.notFound
    }
    return copy
  }
}

enum CollectionTests {
  @MainActor
  static func run() async throws {
    let remote = CollectionRemote()
    let controller = CollectionController(api: remote)
    precondition(controller.presentation.state == .signedOut)
    controller.setAccount("owner-a")
    precondition(controller.presentation.state == .loading)
    await controller.reload()
    precondition(controller.presentation.state == .empty)
    precondition(controller.presentation.message == "Your collection is empty")

    let fixture = try Data(
      contentsOf: URL(fileURLWithPath: "crates/api/fixtures/collection-copy.json"))
    let copy = try JSONDecoder().decode(CollectionCopy.self, from: fixture)
    remote.copies = [copy]
    await controller.reload()
    precondition(
      controller.presentation.copies.first?.copyID == "10000000-0000-4000-8000-000000000001")
    precondition(controller.presentation.state == .loaded)
    await controller.open(copy.copyID)
    precondition(controller.presentation.copy?.printing.artist == "Mark Tedin")
    precondition(
      controller.presentation.copy?.printing.artCropURI == "https://example.test/art.jpg")
    precondition(controller.presentation.copy?.currentPrice?.usdCents == 150)
    precondition(controller.presentation.copy?.purchaseDayUsdCents == 100)
    precondition(controller.presentation.copy?.userTags.first?.name == "Signed")
    precondition(
      CardSymbols.spokenText(copy.printing.faces[0].oracleText)
        == "tap: Add colorless mana colorless mana.")
    precondition(
      CardSymbols.spokenText("{2/W}{G}{E}{UNKNOWN}")
        == "two generic or white mana green mana energy{UNKNOWN}")
    precondition(PresentationData.symbols["{G}"]?.glyphFontSize == 9)
    precondition(PresentationData.symbols["{W/U}"]?.glyphFontSize == 5)
    precondition(PresentationData.symbols["{E}"]?.glyphFontSize == 12)
    precondition(PresentationData.symbols["{Q}"]?.glyphFontSize == 12)
    precondition(PresentationData.manaSymbolSize == 12)
    precondition(PresentationData.manaSymbolSplitInset == 1)
    precondition(PresentationData.printedCardCornerPerWidth == 0.05)
    precondition(CollectionLabels.printing(copy) == "C21 263 · LP")
    precondition(CollectionLabels.chips(copy) == "C21 · 263 · Foil · LP · English")
    precondition(
      CollectionLabels.spokenCopy(copy)
        == "Sol Ring, C21 263, foil, lightly played, protected, $1.50")

    remote.failure = .unavailable
    await controller.reload()
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.copy?.copyID == copy.copyID)
    precondition(controller.presentation.message == nil)
    remote.failure = nil
    await controller.reload()
    precondition(controller.presentation.copy?.copyID == copy.copyID)
    remote.failure = .notFound
    await controller.reload()
    precondition(controller.presentation.state == .missing)
    precondition(controller.presentation.copy == nil)
    remote.failure = nil
    await controller.closeCopy()
    precondition(
      controller.presentation.selectedCopyID == nil && controller.presentation.state == .loaded)

    for refusal in [CollectionFailure.unauthenticated, .forbidden] {
      remote.failure = refusal
      await controller.reload()
      precondition(controller.presentation.state == .refused)
      precondition(controller.presentation.copies.isEmpty && controller.presentation.copy == nil)
      remote.failure = nil
      await controller.reload()
      precondition(controller.presentation.state == .loaded)
    }
    remote.failure = .unavailable
    await controller.reload()
    precondition(controller.presentation.state == .loaded)
    precondition(controller.presentation.copies.first?.copyID == copy.copyID)
    precondition(controller.presentation.message == nil)
    remote.failure = nil
    await controller.reload()

    let uncachedRemote = CollectionRemote()
    uncachedRemote.failure = .unavailable
    let uncached = CollectionController(api: uncachedRemote)
    uncached.setAccount("owner-a")
    await uncached.reload()
    precondition(uncached.presentation.state == .failed)
    precondition(uncached.presentation.message == "Could not load your collection")
    uncachedRemote.failure = nil
    await uncached.reload()
    precondition(uncached.presentation.state == .empty)
    uncachedRemote.failure = .unavailable
    await uncached.reload()
    precondition(uncached.presentation.state == .empty)
    precondition(uncached.presentation.message == "Your collection is empty")

    remote.suspend = true
    let late = Task { await controller.reload() }
    while remote.pending == nil { await Task.yield() }
    controller.setAccount(nil)
    precondition(
      controller.presentation.state == .signedOut && controller.presentation.copies.isEmpty)
    remote.pending?.resume(returning: [copy])
    await late.value
    precondition(controller.presentation.copies.isEmpty && controller.presentation.copy == nil)
    remote.pending = nil

    await controller.open(copy.copyID)
    precondition(controller.presentation.state == .signedOut && controller.presentation.copy == nil)

    controller.setAccount("owner-b")
    remote.suspend = false
    remote.copies = []
    await controller.reload()
    await controller.open(copy.copyID)
    precondition(controller.presentation.copy == nil && controller.presentation.state == .missing)

    controller.setAccount("owner-a")
    remote.suspend = true
    let changed = Task { await controller.reload() }
    while remote.pending == nil { await Task.yield() }
    controller.setAccount("owner-b")
    remote.pending?.resume(returning: [copy])
    await changed.value
    precondition(
      controller.presentation.state == .loading && controller.presentation.copies.isEmpty)

    remote.suspend = false
    remote.copies = [copy]
    controller.setAccount("owner-a")
    await controller.open(copy.copyID)
    precondition(controller.presentation.copy?.copyID == copy.copyID)
    controller.setAccount("owner-b")
    remote.suspendCopy = true
    let otherAccount = Task { await controller.open(copy.copyID) }
    while remote.pendingCopy == nil { await Task.yield() }
    precondition(controller.presentation.state == .loading && controller.presentation.copy == nil)
    remote.pendingCopy?.resume(throwing: CollectionFailure.notFound)
    await otherAccount.value
    precondition(controller.presentation.state == .missing && controller.presentation.copy == nil)
    print(
      "Collection unit checks passed: metadata, symbols, loading, empty, failure, refusal, retry, account change, late replies and cache clearing."
    )
  }
}
