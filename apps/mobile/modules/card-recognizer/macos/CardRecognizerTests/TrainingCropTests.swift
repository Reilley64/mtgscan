@testable import CardRecognizer
import CoreGraphics
import Foundation
import ImageIO
import Testing

private func card(seed: Int) throws -> CGImage {
  let width = CardRecognizer.readWidth
  let height = CardRecognizer.readHeight
  let context = try #require(CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ))
  var value = UInt64(seed)
  func next() -> CGFloat {
    value = value &* 6364136223846793005 &+ 1442695040888963407
    return CGFloat(value >> 40) / CGFloat(1 << 24)
  }
  for _ in 0 ..< 40 {
    context.setFillColor(red: next(), green: next(), blue: next(), alpha: 1)
    context.fill(CGRect(x: next() * CGFloat(width), y: next() * CGFloat(height), width: next() * 600, height: next() * 600))
  }
  return try #require(context.makeImage())
}

private func featurePrint(of image: CGImage) throws -> [Float16] {
  try FeaturePrint.vector(of: #require(FeaturePrint.input(of: image))).map { Float16($0) }
}

private func printing(_ id: String, art: String, frame: String = "1997") -> [String: Any] {
  ["id": id, "oracleId": id, "illustrationId": art, "name": id, "set": "tst", "collectorNumber": id, "frame": frame]
}

private func emptyDirectory() -> URL {
  FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
}

private func cardRecognition(_ recognition: Recognition) throws -> CardRecognition {
  var card: CardRecognition?
  if case let .card(recognized) = recognition {
    card = recognized
  }
  return try #require(card, "expected a card recognition")
}

private func jpegSize(at uri: String?) throws -> (type: String, width: Int, height: Int) {
  let url = try #require(uri.flatMap(URL.init(string:)))
  let source = try #require(CGImageSourceCreateWithURL(url as CFURL, nil))
  let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
  return (try #require(CGImageSourceGetType(source)) as String, image.width, image.height)
}

private let otherArt = [Float16](repeating: 0, count: FeaturePrint.dimension)

@Test("an accepted card recognition writes the straightened card as a 488 x 680 JPEG training crop")
func anAcceptedCardRecognitionWritesATrainingCrop() throws {
  let photo = try card(seed: 1)
  let gallery = try fixtureGallery(
    printings: [printing("only", art: "only-art"), printing("other", art: "other-art")],
    vectors: try featurePrint(of: photo) + otherArt
  )
  let directory = emptyDirectory()
  let recognition = try cardRecognition(CardRecognizer.recognize(card: photo, gallery: gallery, trainingCropDirectory: directory))
  #expect(recognition.decision.accepted)
  let crop = try jpegSize(at: recognition.trainingCrop)
  #expect(crop.type == "public.jpeg")
  #expect(crop.width == 488)
  #expect(crop.height == 680)
  #expect(URL(string: recognition.trainingCrop!)?.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL)
}

@Test("an abstained card recognition writes a 488 x 680 JPEG training crop")
func anAbstainedCardRecognitionWritesATrainingCrop() throws {
  let photo = try card(seed: 2)
  let vector = try featurePrint(of: photo)
  let gallery = try fixtureGallery(
    printings: [printing("first", art: "shared-art"), printing("reprint", art: "shared-art"), printing("other", art: "other-art")],
    vectors: vector + vector + otherArt
  )
  let recognition = try cardRecognition(CardRecognizer.recognize(card: photo, gallery: gallery, trainingCropDirectory: emptyDirectory()))
  #expect(!recognition.decision.accepted)
  let crop = try jpegSize(at: recognition.trainingCrop)
  #expect(crop.type == "public.jpeg")
  #expect(crop.width == 488)
  #expect(crop.height == 680)
}

@Test("a photo that is not a card writes no training crop")
func aPhotoThatIsNotACardWritesNoTrainingCrop() throws {
  let gallery = try fixtureGallery(printings: [printing("only", art: "only-art")], vectors: otherArt)
  let directory = emptyDirectory()
  let recognition = try CardRecognizer.recognize(card: card(seed: 3), gallery: gallery, trainingCropDirectory: directory)
  guard case .notACard = recognition else {
    Issue.record("expected a photo that is not a card")
    return
  }
  #expect((try? FileManager.default.contentsOfDirectory(atPath: directory.path))?.isEmpty ?? true)
}
