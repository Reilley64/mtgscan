@testable import CardRecognizer
import CoreGraphics
import Foundation
import Testing

private func printing(_ id: String) -> [String: Any] {
  ["id": id, "oracleId": id, "illustrationId": "\(id)-art", "name": id, "set": "tst", "collectorNumber": id, "frame": "1997"]
}

private func cardRecognition(_ recognition: Recognition) throws -> CardRecognition {
  var card: CardRecognition?
  if case let .card(recognized) = recognition {
    card = recognized
  }
  return try #require(card, "expected a card recognition")
}

private func image(width: Int, height: Int, draw: (CGContext) -> Void) throws -> CGImage {
  let space = try #require(CGColorSpace(name: CGColorSpace.sRGB))
  let context = try #require(CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ))
  draw(context)
  return try #require(context.makeImage())
}

private func cosine(_ a: [Float], _ b: [Float]) -> Float {
  zip(a, b).reduce(0) { $0 + $1.0 * $1.1 }
}

@Test("a photo is recognized as the card printing whose gallery row the model made from the same card")
func aPhotoIsRecognizedAsTheCardPrintingWhoseGalleryRowTheModelMadeFromTheSameCard() throws {
  let cards = try (1 ... 3).map { try card(seed: $0) }
  let gallery = try fixtureGallery(
    printings: ["first", "second", "third"].map(printing),
    vectors: try cards.flatMap(featurePrint)
  )

  let recognition = try cardRecognition(CardRecognizer.recognize(card: cards[1], gallery: gallery))

  #expect(recognition.candidates.first?.printingId == "second")
  #expect(recognition.topSimilarity > 0.999)
  #expect(recognition.rotation == 0)
}

@Test("a feature print is a unit vector of the gallery version's vector size")
func aFeaturePrintIsAUnitVectorOfTheGalleryVersionsVectorSize() throws {
  let gallery = try fixtureGallery(printings: [], vectors: [])

  let vector = try gallery.featurePrint(of: card(seed: 6))

  #expect(vector.count == gallery.dimension)
  #expect(abs(sqrt(vector.reduce(0) { $0 + $1 * $1 }) - 1) < 0.0001)
}

@Test("a card is padded to the square input size with the model's mean color, keeping its aspect ratio")
func aCardIsPaddedToTheInputSizeWithTheModelsMeanColor() throws {
  let size = fixtureModel.inputSize
  let cardWidth = size.height * 488 / 680
  let left = (size.width - cardWidth) / 2
  func drawCard(_ context: CGContext, x: Int) {
    context.setFillColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1)
    context.fill(CGRect(x: x, y: 0, width: cardWidth, height: size.height))
    context.setFillColor(red: 0.1, green: 0.3, blue: 0.8, alpha: 1)
    context.fill(CGRect(x: x + cardWidth / 4, y: size.height / 2, width: cardWidth / 2, height: size.height / 3))
  }
  let narrow = try image(width: cardWidth, height: size.height) { drawCard($0, x: 0) }
  let largerNarrow = try image(width: cardWidth * 2, height: size.height * 2) { context in
    context.scaleBy(x: 2, y: 2)
    drawCard(context, x: 0)
  }
  let squareOnMeanColor = try image(width: size.width, height: size.height) { context in
    context.setFillColor(red: 0.5, green: 0.5, blue: 0.5, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: size.width, height: size.height))
    drawCard(context, x: left)
  }
  let squareOnBlack = try image(width: size.width, height: size.height) { drawCard($0, x: left) }

  let padded = try fixtureCompiledModel.featurePrint(of: narrow, inputSize: size)

  #expect(cosine(padded, try fixtureCompiledModel.featurePrint(of: largerNarrow, inputSize: size)) > 0.999)
  #expect(cosine(padded, try fixtureCompiledModel.featurePrint(of: squareOnMeanColor, inputSize: size)) > 0.99)
  #expect(cosine(padded, try fixtureCompiledModel.featurePrint(of: squareOnBlack, inputSize: size)) < 0.95)
}

@Test("a model that returns NaN makes the scan fail as an unreadable photo")
func aModelThatReturnsNaNMakesTheScanFailAsAnUnreadablePhoto() throws {
  let gallery = try fixtureGallery(printings: [printing("only")], vectors: try featurePrint(of: card(seed: 1)))
  let black = try image(width: CardRecognizer.readWidth, height: CardRecognizer.readHeight) { context in
    context.setFillColor(red: 0, green: 0, blue: 0, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: CardRecognizer.readWidth, height: CardRecognizer.readHeight))
  }

  #expect(throws: RecognitionFailure.unreadablePhoto) {
    try CardRecognizer.recognize(card: black, gallery: gallery)
  }
}

@Test("a gallery version whose input size the model does not take makes the scan fail as an unreadable photo")
func aGalleryVersionWhoseInputSizeTheModelDoesNotTakeMakesTheScanFail() throws {
  let gallery = try fixtureGallery(
    printings: [printing("only")],
    vectors: try featurePrint(of: card(seed: 1)),
    inputSize: .init(width: 488, height: 680)
  )

  #expect(throws: RecognitionFailure.unreadablePhoto) {
    try CardRecognizer.recognize(card: card(seed: 1), gallery: gallery)
  }
}
