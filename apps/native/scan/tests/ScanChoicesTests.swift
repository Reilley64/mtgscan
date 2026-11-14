import Foundation

actor FakeScanGallery: ScanLocalGallery {
  let rows: [RecognitionCandidate]
  init(_ rows: [RecognitionCandidate]) { self.rows = rows }
  func names(_ text: String) async throws -> [CardName] {
    [CardName(oracleId: "card-a", name: text)]
  }
  func printings(_ oracleID: String) async throws -> [RecognitionCandidate] { rows }
}

struct ScanChoicesTests {
  @MainActor
  static func localPrintingOrderAndAccountBoundArtwork() async throws {
    let first = try scanPrinting("scanned")
    let twin = try scanPrinting("twin")
    let newest = try scanPrinting("newest")
    let scan = BatchScan(
      scanId: "copy", options: [first, twin], sameTextTwinCount: 1, premiumMark: false,
      printing: first, finish: "nonfoil", condition: "near_mint", language: "en",
      recognizedPrintingId: "scanned", printingChange: nil, printingConfirmed: false)
    var pending: CheckedContinuation<String?, Error>?
    let choices = ScanChoicesController(
      local: FakeScanGallery([newest, twin, first]), pause: {},
      imageURI: { _, _ in
        try await withCheckedThrowingContinuation { pending = $0 }
      })
    choices.setAccount("account-a")
    await choices.search("Bolt")
    precondition(choices.names.map(\.name) == ["Bolt"], "Name search stays local")
    await choices.loadPrintings("card-a", scan: scan)
    precondition(
      choices.printings.map(\.printingId) == ["scanned", "twin", "newest"],
      "Same-text twins precede local newest-first order")
    let old = Task { await choices.loadArtwork([first]) }
    while pending == nil { await Task.yield() }
    choices.setAccount("account-b")
    pending?.resume(returning: "https://synthetic.invalid/old-art.jpg")
    await old.value
    precondition(
      choices.artwork.isEmpty && choices.names.isEmpty && choices.printings.isEmpty,
      "Old metadata cannot cross account boundaries")
  }
}
