@testable import CardRecognizer
import Foundation
import Testing

private var printings: [[String: Any]] {
  ["only", "other"].map { id in
    ["id": id, "oracleId": id, "illustrationId": "\(id)-art", "name": id, "set": "tst", "collectorNumber": id, "frame": "1997"]
  }
}

@Test("a gallery version whose not-a-card threshold is above the top similarity calls the same photo not a card")
func aGalleryVersionWhoseNotACardThresholdIsAboveTheTopSimilarityCallsThePhotoNotACard() throws {
  let photo = try card(seed: 4)
  let vectors = try featurePrint(of: photo) + [Float16](repeating: 0, count: fixtureModel.vectorSize)
  guard case let .card(recognized) = try CardRecognizer.recognize(card: photo, gallery: fixtureGallery(printings: printings, vectors: vectors))
  else {
    Issue.record("expected a card recognition with the fixture thresholds")
    return
  }
  let stricter = RecognizerThresholds(
    notACard: Float(recognized.topSimilarity) + 0.01,
    orientationMargin: fixtureThresholds.orientationMargin,
    artMargin: fixtureThresholds.artMargin
  )

  let recognition = try CardRecognizer.recognize(
    card: photo,
    gallery: fixtureGallery(printings: printings, vectors: vectors, thresholds: stricter)
  )

  guard case .notACard = recognition else {
    Issue.record("expected a photo that is not a card")
    return
  }
}

@Test("a gallery version whose vector size differs from the feature print gives an unreadable photo")
func aGalleryVersionWhoseVectorSizeDiffersFromTheFeaturePrintGivesAnUnreadablePhoto() throws {
  let vectorSize = 768
  let gallery = try fixtureGallery(
    printings: printings,
    vectors: [Float16](repeating: 0.05, count: printings.count * vectorSize),
    vectorSize: vectorSize
  )

  #expect(throws: RecognitionFailure.unreadablePhoto) {
    try CardRecognizer.recognize(card: card(seed: 5), gallery: gallery)
  }
}

@Test("a gallery installed before gallery format 2 does not load")
func aGalleryInstalledBeforeGalleryFormat2DoesNotLoad() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try JSONSerialization.data(withJSONObject: printings).write(to: directory.appendingPathComponent(GalleryFile.printingList))
  try JSONSerialization.data(withJSONObject: [
    "count": 2, "dimension": 768, "revision": 2, "createdAt": "2026-10-12T09:00:00Z", "encoding": "float16", "version": "20261012-cf1753",
  ]).write(to: directory.appendingPathComponent(GalleryFile.header))
  try [Float16](repeating: 0, count: 2 * 768).withUnsafeBufferPointer { Data(buffer: $0) }
    .write(to: directory.appendingPathComponent(GalleryFile.float16Vectors))

  #expect(throws: DecodingError.self) {
    try Gallery(directory: directory)
  }
}
