import Foundation

@MainActor
final class MemoryScanFiles: ScanFiles {
  var files: [String: Data] = [:]
  var failWrite = false
  var crops: Set<String> = []
  func keepCrop(_ uri: String, accountID: String, copyID: String) -> Bool {
    crops.insert("\(accountID)/\(copyID)")
    return true
  }
  func discardCrop(_ uri: String) {}
  func dropCrop(accountID: String, copyID: String) { crops.remove("\(accountID)/\(copyID)") }
  func read(_ name: String) throws -> Data? { files[name] }
  func write(_ data: Data, to name: String) throws {
    if failWrite { throw CocoaError(.fileWriteUnknown) }
    files[name] = data
  }
}

func scanPrinting(
  _ id: String = "printing-a", finishes: [String] = ["nonfoil", "foil"], basic: Bool = false
) throws -> RecognitionCandidate {
  let data = try JSONSerialization.data(withJSONObject: [
    "printingId": id, "oracleId": "card-a", "name": "Lightning Bolt", "setCode": "m10",
    "collectorNumber": "146", "finishes": finishes, "basicLand": basic,
  ])
  return try JSONDecoder().decode(RecognitionCandidate.self, from: data)
}

func scanRecognition(
  _ candidates: [RecognitionCandidate], accepted: Bool = true, premium: Bool = false
) -> Recognition {
  .card(
    CardRecognition(
      candidates: candidates,
      decision: RecognitionDecision(basis: accepted ? .uniqueArt : nil, reasons: []),
      reading: CollectorLineReading(setCode: nil, collectorNumber: nil, premiumMark: premium),
      sameTextTwinCount: 0, topSimilarity: 0.9, artMargin: 0.2, rotation: 0,
      trainingCrop: nil, stageMs: [:]))
}

@main
struct ScanUnitTests {
  @MainActor
  static func main() async throws {
    try stableCopySurvivesRestart()
    try correctionsAndPlusOneKeepSeparateCopyIDs()
    try nonBatchResultsAndNameCorrection()
    try legacyDocumentsKeepEvidenceAndPendingIdentity()
    try accountIsolationAndStorageFailureRetry()
    try obsoleteRecognitionCannotRestoreRemovedOrForeignScans()
    AutomaticCaptureTests.holdAndDeparture()
    AutomaticCaptureTests.failuresStopAndRetry()
    AutomaticCaptureTests.gapsAndMotionRequireANewHold()
    AutomaticCaptureTests.changedCardsRearmWithoutAVisibleGap()
    AutomaticCaptureTests.proposalsKeepTheSameCardLocked()
    try await ScanCaptureTests.lifecycleAndAccountCancellation()
    try await ScanCaptureTests.recognitionFeedbackUsesTheNativeDecisionWithoutScores()
    try localCropEvidenceFollowsOnlyThePhotographedCopy()
    try await ScanChoicesTests.localPrintingOrderAndAccountBoundArtwork()
    try legacyNonBatchRowsStayOutOfReview()
    print("Scan unit tests passed")
  }

  @MainActor
  static func legacyNonBatchRowsStayOutOfReview() throws {
    let files = MemoryScanFiles()
    files.files["scan-batch-account-a.json"] = Data(
      """
      {"formatVersion":3,"commitPending":false,"scans":[{"scanId":"unknown","printing":null}]}
      """.utf8)
    let review = ScanReviewController(files: files, newID: { "unused" })
    review.setAccount("account-a")
    precondition(
      review.storageState == .ready && review.batch.scans.isEmpty,
      "Legacy unrecognized rows do not enter the batch or block restoration")
  }

  @MainActor
  static func localCropEvidenceFollowsOnlyThePhotographedCopy() throws {
    let files = MemoryScanFiles()
    var ids = ["photo-copy", "plus-copy"]
    let review = ScanReviewController(files: files, newID: { ids.removeFirst() })
    review.setAccount("account-a")
    files.failWrite = true
    let evidence = ScanTrainingCrop(
      decision: RecognitionDecision(basis: nil, reasons: ["same_text_twins"]), topSimilarity: 0.9,
      artMargin: nil,
      reading: CollectorLineReading(setCode: nil, collectorNumber: nil, premiumMark: false),
      recognizerVersion: "native-build", featurePrintModel: "pinned-model",
      galleryVersion: "pinned-gallery")
    let card = CardRecognition(
      candidates: [try scanPrinting()], decision: evidence.decision, reading: evidence.reading,
      sameTextTwinCount: 0, topSimilarity: 0.9, artMargin: nil, rotation: 0,
      trainingCrop: "file:///synthetic/crop.webp", stageMs: [:])
    let request = review.beginRecognition()!
    review.complete(request, result: .recognized(.card(card), evidence))
    precondition(
      review.batch.scans[0].trainingCrop == evidence, "Local pending evidence survives review")
    review.choose(try scanPrinting(), scanID: "photo-copy", change: "printing_picker")
    precondition(review.batch.scans[0].printingConfirmed)
    review.addCopy("photo-copy")
    precondition(review.batch.scans[1].trainingCrop == nil, "+1 must not duplicate crop evidence")
    precondition(files.crops == ["account-a/photo-copy"])
    files.failWrite = false
    review.remove("photo-copy")
    precondition(files.crops.isEmpty, "Removing a durable scan drops only its local pending crop")
  }

  @MainActor
  static func obsoleteRecognitionCannotRestoreRemovedOrForeignScans() throws {
    let files = MemoryScanFiles()
    let review = ScanReviewController(files: files, newID: { "copy" })
    review.setAccount("account-a")
    let beforeSignOut = review.beginRecognition()!
    review.setAccount(nil)
    review.setAccount("account-a")
    review.complete(beforeSignOut, result: .recognized(scanRecognition([try scanPrinting()])))
    precondition(review.batch.scans.isEmpty, "Signing into the same account cannot revive old work")
    let beforeRemove = review.beginRecognition()!
    review.removeAll()
    review.complete(beforeRemove, result: .recognized(scanRecognition([try scanPrinting()])))
    precondition(
      review.batch.scans.isEmpty && !review.recognizing, "Remove all invalidates in-flight photos")
    let valid = review.beginRecognition()!
    review.complete(valid, result: .recognized(scanRecognition([try scanPrinting()])))
    review.complete(valid, result: .recognized(scanRecognition([try scanPrinting()])))
    precondition(review.batch.scans.count == 1, "One photo completion creates at most one copy")
    let noPhoto = review.beginRecognition()!
    let previous = review.latest
    review.complete(noPhoto, result: .noPhoto)
    precondition(
      review.latest == previous && !review.recognizing, "No-photo failure leaves the previous chip")
  }

  @MainActor
  static func accountIsolationAndStorageFailureRetry() throws {
    let files = MemoryScanFiles()
    let review = ScanReviewController(files: files, newID: { "copy-a" })
    review.setAccount("account-a")
    files.failWrite = true
    review.receive(scanRecognition([try scanPrinting()]))
    precondition(review.storageState == .saveFailed, "Write failures are visible and retryable")
    review.setAccount(nil)
    precondition(review.batch.scans.isEmpty && review.latest == nil, "Sign-out clears visible work")
    review.setAccount("account-b")
    precondition(review.batch.scans.isEmpty, "Another account cannot see pending work")
    review.setAccount("account-a")
    precondition(
      review.batch.scans.map(\.scanId) == ["copy-a"], "Unsaved work stays bound to its owner")
    files.failWrite = false
    review.retryStorage()
    let restart = ScanReviewController(files: files, newID: { "unused" })
    restart.setAccount("account-a")
    precondition(restart.batch.scans.map(\.scanId) == ["copy-a"])
    let untouched = Data("{\"formatVersion\":99,\"scans\":[]}".utf8)
    files.files["scan-batch-account-c.json"] = untouched
    review.setAccount("account-c")
    review.receive(scanRecognition([try scanPrinting()]))
    precondition(review.storageState == .loadFailed)
    precondition(
      files.files["scan-batch-account-c.json"] == untouched,
      "Unknown formats must not be overwritten")
  }

  @MainActor
  static func legacyDocumentsKeepEvidenceAndPendingIdentity() throws {
    let files = MemoryScanFiles()
    let crop = """
      {"decision":{"accepted":false,"basis":null,"reasons":["same_text_twins"]},"topSimilarity":0.91,"artMargin":null,"reading":{"setCode":null,"collectorNumber":null,"premiumMark":true},"recognizerVersion":"legacy","featurePrintModel":"pinned-model","galleryVersion":"pinned-gallery","uri":"file:///obsolete.webp"}
      """
    let printing = String(decoding: try JSONEncoder().encode(scanPrinting()), as: UTF8.self)
    for version in [1, 2, 3] {
      files.files["scan-batch-account-a.json"] = Data(
        """
        {"formatVersion":\(version),"commitPending":true,"scans":[{"scanId":"legacy-copy","options":[\(printing)],"sameTextTwinCount":1,"premiumMark":true,"printing":\(printing),"finish":"foil","condition":"moderately_played","language":"ja","recognizedPrintingId":"printing-a","printingChange":"other_options","printingConfirmed":true,"trainingCrop":\(crop)}]}
        """.utf8)
      let review = ScanReviewController(files: files, newID: { "plus-one" })
      review.setAccount("account-a")
      precondition(review.batch.scans.map(\.scanId) == ["legacy-copy"])
      precondition(review.batch.commitPending, "280 must not replay or discard281 pending intent")
      review.addCopy("legacy-copy")
      let saved =
        try JSONSerialization.jsonObject(with: files.files["scan-batch-account-a.json"]!)
        as! [String: Any]
      let scans = saved["scans"] as! [[String: Any]]
      precondition(saved["formatVersion"] as? Int == 3)
      precondition(scans[1]["trainingCrop"] is NSNull, "+1 has no crop evidence")
      if version != 1 {
        let evidence = scans[0]["trainingCrop"] as? [String: Any]
        precondition(
          evidence?["galleryVersion"] as? String == "pinned-gallery", "Review keeps legacy evidence"
        )
        precondition(evidence?["uri"] == nil, "v2 URI is not part of format3")
      } else {
        precondition(scans[0]["trainingCrop"] is NSNull)
        precondition(scans[0]["recognizedPrintingId"] is NSNull)
      }
    }
  }

  @MainActor
  static func nonBatchResultsAndNameCorrection() throws {
    var ids = ["first", "unknown"]
    let review = ScanReviewController(files: MemoryScanFiles(), newID: { ids.removeFirst() })
    review.setAccount("account-a")
    review.receive(scanRecognition([try scanPrinting()]))
    review.receive(.notACard(NotACardRecognition(topSimilarity: 0.1, stageMs: [:])))
    precondition(review.latest == .scan("first"), "Not-a-card leaves the previous chip")
    let basic = try scanPrinting("basic", basic: true)
    review.receive(scanRecognition([basic]))
    precondition(review.batch.scans.count == 1, "Basic lands create no copy")
    precondition(review.latest == .basicLand(basic))
    review.receiveFailed()
    precondition(review.latest == .notRecognized("unknown"))
    precondition(review.batch.scans.count == 1, "Unknown scans stay outside the batch")
    review.choose(try scanPrinting("basic", basic: true), scanID: "unknown", change: "name_search")
    precondition(review.batch.scans.count == 1, "Name search refuses basic lands")
    review.choose(try scanPrinting(), scanID: "unknown", change: "name_search")
    precondition(
      review.batch.scans.map(\.scanId) == ["first", "unknown"],
      "Name correction keeps the chip's ID")
    precondition(review.batch.scans.last?.recognizedPrintingId == nil)
    review.remove("unknown")
    precondition(review.latest == nil)
    precondition(review.batch.scans.map(\.scanId) == ["first"])
  }

  @MainActor
  static func correctionsAndPlusOneKeepSeparateCopyIDs() throws {
    var ids = ["copy-1", "copy-2"]
    let files = MemoryScanFiles()
    let review = ScanReviewController(files: files, newID: { ids.removeFirst() })
    review.setAccount("account-a")
    review.receive(scanRecognition([try scanPrinting()], accepted: false, premium: true))
    precondition(
      review.batch.scans[0].finish == "foil",
      "Abstain still includes the first candidate and premium default")
    review.setCondition("lightly_played", scanID: "copy-1")
    review.setLanguage("ja", scanID: "copy-1")
    review.choose(
      try scanPrinting("etched-printing", finishes: ["etched"]), scanID: "copy-1",
      change: "printing_picker")
    review.addCopy("copy-1")
    review.setCondition("damaged", scanID: "copy-2")
    precondition(review.batch.scans.map(\.scanId) == ["copy-1", "copy-2"])
    precondition(
      review.batch.scans.map(\.finish) == ["etched", "etched"], "Unsupported finish falls back")
    precondition(review.batch.scans.map(\.condition) == ["lightly_played", "damaged"])
    precondition(review.batch.scans.map(\.language) == ["ja", "ja"])
    let restarted = ScanReviewController(files: files, newID: { "unused" })
    restarted.setAccount("account-a")
    precondition(
      restarted.batch == review.batch, "Edits and +1 survive restart without reallocating IDs")
  }

  @MainActor
  static func stableCopySurvivesRestart() throws {
    let files = MemoryScanFiles()
    let review = ScanReviewController(files: files, newID: { "copy-1" })
    review.setAccount("account-a")
    review.receive(scanRecognition([try scanPrinting()]))
    precondition(
      review.batch.scans.map(\.scanId) == ["copy-1"], "A recognized scan gets its permanent copy ID"
    )
    let restarted = ScanReviewController(files: files, newID: { "must-not-allocate" })
    restarted.setAccount("account-a")
    precondition(restarted.batch.scans.map(\.scanId) == ["copy-1"], "Restart preserves copy IDs")
    precondition(restarted.batch.scans.first?.finish == "nonfoil")
  }
}
