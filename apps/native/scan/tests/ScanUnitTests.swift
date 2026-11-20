import Foundation

@MainActor
final class MemoryScanFiles: ScanFiles {
  var files: [String: Data] = [:]
  var failWrite = false
  private(set) var writeAttempts = 0
  var crops: Set<String> = []
  var cropRemovals: [String] = []
  func keepCrop(_ uri: String, accountID: String, copyID: String) -> Bool {
    crops.insert("\(accountID)/\(copyID)")
    return true
  }
  func discardCrop(_ uri: String) { cropRemovals.append(uri) }
  func dropCrop(accountID: String, copyID: String) {
    cropRemovals.append("\(accountID)/\(copyID)")
    crops.remove("\(accountID)/\(copyID)")
  }
  func read(_ name: String) throws -> Data? { files[name] }
  func write(_ data: Data, to name: String) throws {
    writeAttempts += 1
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
    try historicalPendingBatchKeepsItsAccountAndCrop(version: 2)
    try historicalPendingBatchKeepsItsAccountAndCrop(version: 3)
    try historicalCropsSurviveAnEdit(version: 2)
    try historicalCropsSurviveAnEdit(version: 3)
    invalidFeaturePrintProvenanceBlocksRestoration()
    formatOneHasNoCropEvidence()
    try pendingCommitKeepsItsScanAndCropAfterEitherRemoval()
    try failedRemovalKeepsTheSavedScanAndCropUntilRetrySucceeds()
    try accountIsolationAndStorageFailureRetry()
    try obsoleteRecognitionCannotRestoreRemovedOrForeignScans()
    AutomaticCaptureTests.holdAndDeparture()
    AutomaticCaptureTests.failuresStopAndRetry()
    AutomaticCaptureTests.gapsAndMotionRequireANewHold()
    AutomaticCaptureTests.changedCardsRearmWithoutAVisibleGap()
    AutomaticCaptureTests.proposalsKeepTheSameCardLocked()
    try await ScanCaptureTests.lifecycleAndAccountCancellation()
    try await ScanCaptureTests.latePhotoFailureDoesNotStopTheNextAccount()
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
    let sibling = review.batch.scans[1]
    files.failWrite = false
    review.retryStorage()
    precondition(review.storageState == .ready)
    precondition(review.remove("photo-copy"), "An ordinary saved scan can be removed")
    let reopened = ScanReviewController(files: files)
    reopened.setAccount("account-a")
    precondition(reopened.batch.scans == [sibling], "Remove scan keeps the other copy on reopening")
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
    review.receive(scanRecognition([try scanPrinting()]))
    let beforeRemove = review.beginRecognition()!
    precondition(review.removeAll(), "An ordinary scan batch can be cleared")
    review.complete(beforeRemove, result: .recognized(scanRecognition([try scanPrinting()])))
    precondition(
      review.batch.scans.isEmpty && !review.recognizing, "Remove all invalidates in-flight photos")
    let reopened = ScanReviewController(files: files)
    reopened.setAccount("account-a")
    precondition(
      reopened.storageState == .ready && reopened.batch.scans.isEmpty,
      "Remove all clears an ordinary scan batch on reopening")
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

  private static func expoScan(_ copyID: String, _ cropFields: String) -> String {
    let first = """
      {"printingId":"printing-a","oracleId":"card-a","name":"Lightning Bolt","setCode":"m10","collectorNumber":"146","finishes":["nonfoil","foil"],"basicLand":false}
      """
    let chosen = """
      {"printingId":"printing-b","oracleId":"card-a","name":"Lightning Bolt","setCode":"m11","collectorNumber":"149","finishes":["nonfoil","foil"],"basicLand":false}
      """
    return """
      {"scanId":"\(copyID)","options":[\(first),\(chosen)],"sameTextTwinCount":1,"premiumMark":true,"printing":\(chosen),"finish":"foil","condition":"moderately_played","language":"ja"\(cropFields)}
      """
  }

  private static func expoCrop(
    _ provenance: String, gallery: String = "20261012-cf1753"
  ) -> String {
    """
    ,"recognizedPrintingId":"printing-a","printingChange":"other_options","printingConfirmed":true,"trainingCrop":{"decision":{"accepted":false,"basis":null,"reasons":["same_text_twins"]},"topSimilarity":0.91,"artMargin":null,"reading":{"premiumMark":true},"recognizerVersion":"1.0.0 (42)",\(provenance),"galleryVersion":"\(gallery)"}
    """
  }

  private static func expoVisionScan(version: Int) -> String {
    let revision = "\"featurePrintRevision\":2"
    let uri =
      ",\"uri\":\"file:///old-container/Documents/training-crops/account-a/legacy-copy.jpg\""
    return expoScan("legacy-copy", expoCrop(revision + (version == 2 ? uri : "")))
  }

  @MainActor
  static func historicalPendingBatchKeepsItsAccountAndCrop(version: Int) throws {
    let name = "scan-batch-account-a.json"
    let cropPath = "training-crops/account-a/legacy-copy.jpg"
    let scan = expoVisionScan(version: version)
    let original = Data(
      "{\"formatVersion\":\(version),\"scans\":[\(scan)],\"commitPending\":true}".utf8)
    let files = MemoryScanFiles()
    files.files[name] = original
    files.crops = [cropPath]
    let review = ScanReviewController(
      files: files, newID: { preconditionFailure("Copy ID changed") })
    review.setAccount("account-a")
    precondition(review.storageState == .ready, "Expo format \(version) restores a Vision crop")
    precondition(review.batch.commitPending && review.batch.scans.map(\.scanId) == ["legacy-copy"])
    let restored = review.batch.scans[0]
    precondition(restored.printing.printingId == "printing-b" && restored.finish == "foil")
    precondition(restored.condition == "moderately_played" && restored.language == "ja")
    precondition(restored.recognizedPrintingId == "printing-a")
    precondition(restored.printingChange == "other_options" && restored.printingConfirmed)
    precondition(restored.trainingCrop?.recognizerVersion == "1.0.0 (42)")
    precondition(restored.trainingCrop?.galleryVersion == "20261012-cf1753")
    precondition(
      restored.trainingCrop?.reading.setCode == nil && restored.trainingCrop?.artMargin == nil)
    precondition(restored.trainingCrop?.reading.premiumMark == true)
    precondition(!review.canRemoveScans)

    review.setAccount("account-b")
    precondition(review.batch.scans.isEmpty && !review.batch.commitPending)
    review.setAccount("account-a")
    precondition(review.batch.commitPending && review.batch.scans == [restored])
    precondition(files.files == [name: original], "Restoring a pending commit never rewrites it")
    precondition(
      files.crops == [cropPath] && files.cropRemovals.isEmpty,
      "Restoring a pending commit keeps its JPEG path")
  }

  @MainActor
  static func historicalCropsSurviveAnEdit(version: Int) throws {
    let name = "scan-batch-account-a.json"
    var rows = [expoVisionScan(version: version)]
    var paths: Set<String> = ["training-crops/account-a/legacy-copy.jpg"]
    if version == 3 {
      let modern = expoCrop("\"featurePrintModel\":\"pe-core-s16-384\"", gallery: "20261021-c38f43")
      rows.append(expoScan("modern-copy", modern))
      paths.insert("training-crops/account-a/modern-copy.webp")
    }
    let files = MemoryScanFiles()
    files.files[name] = Data(
      "{\"formatVersion\":\(version),\"scans\":[\(rows.joined(separator: ","))]}".utf8)
    files.crops = paths
    let review = ScanReviewController(files: files)
    review.setAccount("account-a")
    precondition(review.storageState == .ready && !review.batch.commitPending)
    review.setCondition("lightly_played", scanID: "legacy-copy")
    let saved = try JSONSerialization.jsonObject(with: files.files[name]!) as! [String: Any]
    let scans = saved["scans"] as! [[String: Any]]
    let crops = scans.map { $0["trainingCrop"] as! [String: Any] }
    precondition(saved["formatVersion"] as? Int == 3 && saved["commitPending"] as? Bool == false)
    precondition(
      crops[0]["featurePrintRevision"] as? Int == 2 && crops[0]["featurePrintModel"] == nil)
    if version == 3 {
      precondition(crops[1]["featurePrintModel"] as? String == "pe-core-s16-384")
      precondition(crops[1]["featurePrintRevision"] == nil)
    }
    precondition(crops.allSatisfy { $0["uri"] == nil })
    let reopened = ScanReviewController(files: files)
    reopened.setAccount("account-a")
    precondition(
      reopened.batch == review.batch && reopened.batch.scans[0].condition == "lightly_played")
    precondition(
      files.crops == paths && files.cropRemovals.isEmpty,
      "Saving scan attributes leaves crop paths intact")
  }

  @MainActor
  static func invalidFeaturePrintProvenanceBlocksRestoration() {
    let name = "scan-batch-account-a.json"
    let model = "\"featurePrintModel\":\"pe-core-s16-384\""
    let invalid = [
      (2, model), (3, "\"unrelated\":true"), (3, "\"featurePrintRevision\":\"2\""),
      (3, "\"featurePrintRevision\":0"), (3, "\"featurePrintModel\":\"  \""),
      (3, "\"featurePrintRevision\":2," + model),
    ]
    for (version, provenance) in invalid {
      let scan = expoScan("copy", expoCrop(provenance))
      let original = Data(
        "{\"formatVersion\":\(version),\"scans\":[\(scan)],\"commitPending\":true}".utf8)
      let files = MemoryScanFiles()
      files.files[name] = original
      let review = ScanReviewController(files: files)
      review.setAccount("account-a")
      precondition(review.storageState == .loadFailed, "Invalid provenance must not be guessed")
      precondition(files.files[name] == original)
    }
  }

  @MainActor
  static func formatOneHasNoCropEvidence() {
    let files = MemoryScanFiles()
    let scan = expoScan("legacy-copy", "")
    files.files["scan-batch-account-a.json"] = Data(
      "{\"formatVersion\":1,\"scans\":[\(scan)],\"commitPending\":true}".utf8)
    let review = ScanReviewController(files: files)
    review.setAccount("account-a")
    precondition(review.storageState == .ready && review.batch.commitPending)
    precondition(review.batch.scans.map(\.scanId) == ["legacy-copy"])
    precondition(review.batch.scans[0].trainingCrop == nil)
    precondition(review.batch.scans[0].recognizedPrintingId == nil)
  }

  @MainActor
  static func pendingCommitKeepsItsScanAndCropAfterEitherRemoval() throws {
    let printing = try scanPrinting()
    let crop = ScanTrainingCrop(
      decision: RecognitionDecision(basis: nil, reasons: ["same_text_twins"]),
      topSimilarity: 0.91, artMargin: nil,
      reading: CollectorLineReading(setCode: nil, collectorNumber: nil, premiumMark: true),
      recognizerVersion: "native-build", featurePrintModel: "pe-core-s16-384",
      galleryVersion: "pinned-gallery")
    var original = ScanBatch()
    original.commitPending = true
    original.scans = [
      BatchScan(
        scanId: "pending-copy", options: [printing], sameTextTwinCount: 1, premiumMark: true,
        printing: printing, finish: "foil", condition: "moderately_played", language: "ja",
        recognizedPrintingId: printing.printingId, printingChange: "other_options",
        printingConfirmed: true, trainingCrop: crop)
    ]
    let document = try JSONEncoder().encode(original)
    let name = "scan-batch-account-a.json"

    for removeAll in [false, true] {
      let files = MemoryScanFiles()
      files.files[name] = document
      files.crops = ["account-a/pending-copy"]
      let review = ScanReviewController(files: files)
      review.setAccount("account-a")
      precondition(review.storageState == .ready && review.batch == original)

      let removed = removeAll ? review.removeAll() : review.remove("pending-copy")

      let reopened = ScanReviewController(files: files)
      reopened.setAccount("account-a")
      let action = removeAll ? "Remove all scans" : "Remove scan"
      precondition(
        reopened.storageState == .ready && reopened.batch == original,
        "\(action) keeps the pending commit, copy ID, and payload on reopening")
      precondition(review.batch == original, "\(action) keeps the pending scan in review")
      precondition(files.files[name] == document, "\(action) leaves the saved batch bytes intact")
      precondition(files.crops == ["account-a/pending-copy"], "\(action) keeps the pending crop")
      precondition(!removed, "\(action) reports that removal was refused")
      precondition(files.writeAttempts == 0, "\(action) never attempts a write during a commit")
    }
  }

  @MainActor
  static func failedRemovalKeepsTheSavedScanAndCropUntilRetrySucceeds() throws {
    let files = MemoryScanFiles()
    var ids = ["photo-copy", "other-copy"]
    let review = ScanReviewController(files: files, newID: { ids.removeFirst() })
    review.setAccount("account-a")
    let evidence = ScanTrainingCrop(
      decision: RecognitionDecision(basis: .uniqueArt, reasons: []), topSimilarity: 0.9,
      artMargin: 0.2,
      reading: CollectorLineReading(setCode: nil, collectorNumber: nil, premiumMark: false),
      recognizerVersion: "native-build", featurePrintModel: "pinned-model",
      galleryVersion: "pinned-gallery")
    let card = CardRecognition(
      candidates: [try scanPrinting()], decision: evidence.decision, reading: evidence.reading,
      sameTextTwinCount: 0, topSimilarity: 0.9, artMargin: 0.2, rotation: 0,
      trainingCrop: "file:///synthetic/crop.webp", stageMs: [:])
    review.receive(.card(card), evidence: evidence)
    review.addCopy("photo-copy")
    let original = review.batch
    let document = files.files["scan-batch-account-a.json"]!

    files.failWrite = true
    let removed = review.remove("photo-copy")
    let reopened = ScanReviewController(files: files)
    reopened.setAccount("account-a")
    precondition(reopened.batch == original, "Reopening after the failed write keeps both scans")
    precondition(!removed, "A failed write must not report a successful removal")
    precondition(review.storageState == .saveFailed)
    precondition(review.batch.scans == [original.scans[1]], "The removal stays unsaved in memory")
    precondition(files.crops == ["account-a/photo-copy"], "A failed removal keeps the saved crop")

    review.setAccount("account-b")
    precondition(review.storageState == .ready && review.batch.scans.isEmpty)
    review.setAccount("account-a")
    precondition(review.storageState == .saveFailed && review.batch.scans == [original.scans[1]])
    review.retryStorage()
    precondition(review.storageState == .saveFailed, "A failed retry remains retryable")
    precondition(files.files["scan-batch-account-a.json"] == document)
    precondition(files.crops == ["account-a/photo-copy"], "A failed write keeps the saved crop")

    files.failWrite = false
    review.retryStorage()
    precondition(review.storageState == .ready && files.crops.isEmpty)
    let afterRetry = ScanReviewController(files: files)
    afterRetry.setAccount("account-a")
    precondition(
      afterRetry.batch.scans == [original.scans[1]], "A successful retry removes only that scan")
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
