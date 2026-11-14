import Foundation

@MainActor
protocol ScanFiles {
  func read(_ name: String) throws -> Data?
  func write(_ data: Data, to name: String) throws
  func keepCrop(_ uri: String, accountID: String, copyID: String) -> Bool
  func discardCrop(_ uri: String)
  func dropCrop(accountID: String, copyID: String)
}

struct ScanTrainingCrop: Codable, Equatable, Sendable {
  let decision: RecognitionDecision
  let topSimilarity: Double
  let artMargin: Double?
  let reading: CollectorLineReading
  let recognizerVersion: String
  let featurePrintModel: String
  let galleryVersion: String

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(decision, forKey: .decision)
    try values.encode(topSimilarity, forKey: .topSimilarity)
    try values.encode(artMargin, forKey: .artMargin)
    try values.encode(recognizerVersion, forKey: .recognizerVersion)
    try values.encode(featurePrintModel, forKey: .featurePrintModel)
    try values.encode(galleryVersion, forKey: .galleryVersion)
    var line = values.nestedContainer(keyedBy: ReadingKey.self, forKey: .reading)
    try line.encode(reading.setCode, forKey: .setCode)
    try line.encode(reading.collectorNumber, forKey: .collectorNumber)
    try line.encode(reading.premiumMark, forKey: .premiumMark)
  }

  private enum ReadingKey: String, CodingKey { case setCode, collectorNumber, premiumMark }
}

struct BatchScan: Codable, Equatable, Sendable {
  let scanId: String
  var options: [RecognitionCandidate]
  var sameTextTwinCount: Int
  var premiumMark: Bool
  var printing: RecognitionCandidate
  var finish: String
  var condition: String
  var language: String
  var recognizedPrintingId: String?
  var printingChange: String?
  var printingConfirmed: Bool
  var trainingCrop: ScanTrainingCrop? = nil

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(scanId, forKey: .scanId)
    try values.encode(options, forKey: .options)
    try values.encode(sameTextTwinCount, forKey: .sameTextTwinCount)
    try values.encode(premiumMark, forKey: .premiumMark)
    try values.encode(printing, forKey: .printing)
    try values.encode(finish, forKey: .finish)
    try values.encode(condition, forKey: .condition)
    try values.encode(language, forKey: .language)
    try values.encode(recognizedPrintingId, forKey: .recognizedPrintingId)
    try values.encode(printingChange, forKey: .printingChange)
    try values.encode(printingConfirmed, forKey: .printingConfirmed)
    try values.encode(trainingCrop, forKey: .trainingCrop)
  }

  enum CodingKeys: String, CodingKey {
    case scanId, options, sameTextTwinCount, premiumMark, printing, finish, condition, language
    case recognizedPrintingId, printingChange, printingConfirmed, trainingCrop
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    scanId = try values.decode(String.self, forKey: .scanId)
    options = try values.decode([RecognitionCandidate].self, forKey: .options)
    sameTextTwinCount = try values.decode(Int.self, forKey: .sameTextTwinCount)
    premiumMark = try values.decode(Bool.self, forKey: .premiumMark)
    printing = try values.decode(RecognitionCandidate.self, forKey: .printing)
    finish = try values.decode(String.self, forKey: .finish)
    condition = try values.decode(String.self, forKey: .condition)
    language = try values.decode(String.self, forKey: .language)
    recognizedPrintingId = try values.decodeIfPresent(String.self, forKey: .recognizedPrintingId)
    printingChange = try values.decodeIfPresent(String.self, forKey: .printingChange)
    printingConfirmed = try values.decodeIfPresent(Bool.self, forKey: .printingConfirmed) ?? false
    trainingCrop = try values.decodeIfPresent(ScanTrainingCrop.self, forKey: .trainingCrop)
  }

  init(
    scanId: String, options: [RecognitionCandidate], sameTextTwinCount: Int, premiumMark: Bool,
    printing: RecognitionCandidate, finish: String, condition: String, language: String,
    recognizedPrintingId: String?, printingChange: String?, printingConfirmed: Bool,
    trainingCrop: ScanTrainingCrop? = nil
  ) {
    self.scanId = scanId
    self.options = options
    self.sameTextTwinCount = sameTextTwinCount
    self.premiumMark = premiumMark
    self.printing = printing
    self.finish = finish
    self.condition = condition
    self.language = language
    self.recognizedPrintingId = recognizedPrintingId
    self.printingChange = printingChange
    self.printingConfirmed = printingConfirmed
    self.trainingCrop = trainingCrop
  }
}

struct ScanBatch: Codable, Equatable, Sendable {
  private struct SavedScan: Decodable {
    let scan: BatchScan?
    private enum CodingKeys: String, CodingKey { case printing }
    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      scan =
        try values.decodeIfPresent(RecognitionCandidate.self, forKey: .printing) == nil
        ? nil : BatchScan(from: decoder)
    }
  }

  var formatVersion = 3
  var scans: [BatchScan] = []
  var commitPending = false

  init() {}

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    let version = try values.decode(Int.self, forKey: .formatVersion)
    guard (1...3).contains(version) else { throw CocoaError(.fileReadCorruptFile) }
    scans = try values.decode([SavedScan].self, forKey: .scans).compactMap(\.scan)
    commitPending = try values.decodeIfPresent(Bool.self, forKey: .commitPending) ?? false
    if version == 1 {
      for index in scans.indices {
        scans[index].recognizedPrintingId = nil
        scans[index].printingChange = nil
        scans[index].printingConfirmed = false
        scans[index].trainingCrop = nil
      }
    }
  }
}

enum ScanRecognitionResult: Sendable {
  case recognized(Recognition, ScanTrainingCrop? = nil)
  case failed
  case noPhoto
}

struct ScanRequest: Hashable { let id: Int }

enum ScanStorageState { case ready, loadFailed, saveFailed }

enum LatestScan: Equatable {
  case scan(String)
  case notRecognized(String)
  case basicLand(RecognitionCandidate)
}

@MainActor
final class ScanReviewController {
  private let files: any ScanFiles
  private let newID: () -> String
  private(set) var batch = ScanBatch()
  private(set) var storageState: ScanStorageState = .ready
  private(set) var latest: LatestScan?
  var onChange: (() -> Void)?
  private(set) var accountID: String?
  private var unsaved: [String: ScanBatch] = [:]
  private var knownCrops: [String: Set<String>] = [:]
  private var requests: Set<ScanRequest> = []
  private var nextRequest = 0
  var recognizing: Bool { !requests.isEmpty }

  init(files: any ScanFiles, newID: @escaping () -> String = { UUID().uuidString }) {
    self.files = files
    self.newID = newID
  }

  func setAccount(_ accountID: String?) {
    guard self.accountID != accountID else { return }
    self.accountID = accountID
    requests.removeAll()
    batch = ScanBatch()
    latest = nil
    storageState = .ready
    if let accountID {
      if let pending = unsaved[accountID] {
        batch = pending
        storageState = .saveFailed
      } else {
        load(accountID)
      }
    }
    onChange?()
  }

  private func load(_ accountID: String) {
    do {
      if let data = try files.read("scan-batch-\(accountID).json") {
        batch = try JSONDecoder().decode(ScanBatch.self, from: data)
      }
      knownCrops[accountID] = Set(batch.scans.filter { $0.trainingCrop != nil }.map(\.scanId))
      storageState = .ready
    } catch {
      storageState = .loadFailed
    }
  }

  func retryStorage() {
    guard let accountID else { return }
    if storageState == .loadFailed {
      load(accountID)
      onChange?()
    } else {
      save()
    }
  }

  func beginRecognition() -> ScanRequest? {
    guard accountID != nil, storageState != .loadFailed else { return nil }
    nextRequest += 1
    let request = ScanRequest(id: nextRequest)
    requests.insert(request)
    onChange?()
    return request
  }

  @discardableResult
  func complete(_ request: ScanRequest, result: ScanRecognitionResult) -> Bool {
    guard requests.remove(request) != nil else {
      discardCrop(of: result)
      return false
    }
    switch result {
    case .recognized(let recognition, let evidence): receive(recognition, evidence: evidence)
    case .failed: receiveFailed()
    case .noPhoto: break
    }
    onChange?()
    return true
  }

  func removeAll() {
    guard accountID != nil, storageState != .loadFailed else { return }
    requests.removeAll()
    batch = ScanBatch()
    latest = nil
    save()
  }

  func receiveFailed() {
    guard storageState != .loadFailed, accountID != nil else { return }
    latest = .notRecognized(newID())
    onChange?()
  }

  func remove(_ scanID: String) {
    batch.scans.removeAll { $0.scanId == scanID }
    if latest == .scan(scanID) || latest == .notRecognized(scanID) { latest = nil }
    save()
  }

  func setCondition(_ value: String, scanID: String) {
    edit(scanID) { $0.condition = value }
  }

  func setLanguage(_ value: String, scanID: String) {
    edit(scanID) { $0.language = value }
  }

  func setFinish(_ value: String, scanID: String) {
    edit(scanID) { if $0.printing.finishes.contains(value) { $0.finish = value } }
  }

  func choose(_ printing: RecognitionCandidate, scanID: String, change: String) {
    guard accountID != nil, storageState != .loadFailed, !printing.basicLand else { return }
    if latest == .notRecognized(scanID) {
      batch.scans.append(
        BatchScan(
          scanId: scanID, options: [], sameTextTwinCount: 0, premiumMark: false,
          printing: printing, finish: Self.defaultFinish(printing, premium: false),
          condition: "near_mint", language: "en", recognizedPrintingId: nil,
          printingChange: nil, printingConfirmed: false))
      latest = .scan(scanID)
      save()
      return
    }
    edit(scanID) { scan in
      if scan.printing.printingId == printing.printingId {
        if change == "printing_picker" { scan.printingConfirmed = true }
      } else {
        scan.printing = printing
        if !printing.finishes.contains(scan.finish) {
          scan.finish = Self.defaultFinish(printing, premium: scan.premiumMark)
        }
        scan.printingChange = change
        scan.printingConfirmed = false
      }
    }
  }

  func addCopy(_ scanID: String) {
    guard let copied = batch.scans.first(where: { $0.scanId == scanID }) else { return }
    let scan = BatchScan(
      scanId: newID(), options: copied.options, sameTextTwinCount: copied.sameTextTwinCount,
      premiumMark: copied.premiumMark, printing: copied.printing, finish: copied.finish,
      condition: copied.condition, language: copied.language,
      recognizedPrintingId: copied.recognizedPrintingId, printingChange: copied.printingChange,
      printingConfirmed: copied.printingConfirmed)
    batch.scans.append(scan)
    latest = .scan(scan.scanId)
    save()
  }

  private func edit(_ scanID: String, _ change: (inout BatchScan) -> Void) {
    guard storageState != .loadFailed,
      let index = batch.scans.firstIndex(where: { $0.scanId == scanID })
    else { return }
    change(&batch.scans[index])
    save()
  }

  private static func defaultFinish(_ printing: RecognitionCandidate, premium: Bool) -> String {
    if premium && printing.finishes.contains("foil") { return "foil" }
    return ["nonfoil", "foil", "etched"].first(where: printing.finishes.contains) ?? "nonfoil"
  }

  private func save() {
    defer { onChange?() }
    guard let accountID, storageState != .loadFailed else { return }
    do {
      try files.write(JSONEncoder().encode(batch), to: "scan-batch-\(accountID).json")
      let currentCrops = Set(batch.scans.filter { $0.trainingCrop != nil }.map(\.scanId))
      for removed in (knownCrops[accountID] ?? []).subtracting(currentCrops) {
        files.dropCrop(accountID: accountID, copyID: removed)
      }
      knownCrops[accountID] = currentCrops
      unsaved[accountID] = nil
      storageState = .ready
    } catch {
      unsaved[accountID] = batch
      storageState = .saveFailed
    }
  }

  private func discardCrop(of result: ScanRecognitionResult) {
    if case .recognized(.card(let card), _) = result, let uri = card.trainingCrop {
      files.discardCrop(uri)
    }
  }

  func receive(_ recognition: Recognition, evidence: ScanTrainingCrop? = nil) {
    guard let accountID, storageState != .loadFailed, case .card(let card) = recognition else {
      discardCrop(of: .recognized(recognition))
      return
    }
    guard let printing = card.candidates.first else {
      discardCrop(of: .recognized(recognition))
      receiveFailed()
      return
    }
    if printing.basicLand {
      discardCrop(of: .recognized(recognition))
      latest = .basicLand(printing)
      onChange?()
      return
    }
    let scanID = newID()
    var kept: ScanTrainingCrop?
    if let uri = card.trainingCrop {
      if let evidence, files.keepCrop(uri, accountID: accountID, copyID: scanID) {
        kept = evidence
        knownCrops[accountID, default: []].insert(scanID)
      } else {
        files.discardCrop(uri)
      }
    }
    latest = .scan(scanID)
    batch.scans.append(
      BatchScan(
        scanId: scanID, options: card.candidates, sameTextTwinCount: card.sameTextTwinCount,
        premiumMark: card.reading.premiumMark, printing: printing,
        finish: Self.defaultFinish(printing, premium: card.reading.premiumMark),
        condition: "near_mint", language: "en", recognizedPrintingId: printing.printingId,
        printingChange: nil, printingConfirmed: false, trainingCrop: kept))
    save()
  }
}
