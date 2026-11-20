import CoreGraphics
import Foundation

actor NativeScanRecognizer: ScanRecognizer, ScanLocalGallery {
  private var loaded: Gallery?
  private var nameIndex: CardNameIndex?

  private func gallery() throws -> Gallery {
    let version = GalleryDownloads.installedVersion()?.version
    if let loaded, loaded.version == version { return loaded }
    let gallery = try Gallery(directory: GalleryDownloads.installedDirectory)
    loaded = gallery
    nameIndex = CardNameIndex(printings: gallery.printings)
    return gallery
  }

  func recognize(_ photo: ScanPhoto) async throws -> ScanRecognitionResult {
    let gallery = try gallery()
    let recognition = try CardRecognizer.recognize(
      photo: photo.url,
      outline: CardOutline(corners: photo.outline.map { CGPoint(x: $0.x, y: $0.y) }),
      gallery: gallery,
      trainingCropDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(
        "training-crops", isDirectory: true))
    guard case .card(let card) = recognition else { return .recognized(recognition) }
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
    let evidence = ScanTrainingCrop(
      decision: card.decision, topSimilarity: card.topSimilarity, artMargin: card.artMargin,
      reading: card.reading, recognizerVersion: "\(version) (\(build))",
      featurePrintModel: gallery.model.name, galleryVersion: gallery.version ?? "unknown")
    return .recognized(recognition, evidence)
  }

  func names(_ text: String) async throws -> [CardName] {
    _ = try gallery()
    return nameIndex?.search(text) ?? []
  }

  func printings(_ oracleID: String) async throws -> [RecognitionCandidate] {
    let gallery = try gallery()
    return (nameIndex?.printings(oracleId: oracleID) ?? []).map {
      RecognitionCandidate(printing: gallery.printings[$0])
    }
  }
}
