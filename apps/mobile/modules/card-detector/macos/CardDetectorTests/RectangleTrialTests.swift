import CoreVideo
import Foundation
import ImageIO
import simd
import Testing

@testable import CardDetector

private let roundedCorners: Comment = "The trial puts each corner on the rounded card corner, inside the outer corner"

private func rectangleTrial(_ image: GrayImage, orientation: CGImagePropertyOrientation = .right) -> CardQuadDetector.Output {
  CardQuadDetector.detect(
    pixelBuffer: makeBuffer(oriented: image, orientation: orientation),
    displayOrientation: orientation,
    rectangleTrial: true
  )
}

private func outlineError(_ output: CardQuadDetector.Output, _ card: SyntheticCard) -> Double {
  guard let refined = output.refined else { return .infinity }
  return maximumCornerError(
    refined.map { SIMD2($0.x * 720.0, $0.y * 1280.0) },
    CardQuadGeometry.orderedClockwise(card.corners)!
  )
}

private func detects(_ output: CardQuadDetector.Output) -> Bool {
  DetectionSample(
    output: output,
    transform: OrientationTransform(displayOrientation: .right, bufferWidth: 1280, bufferHeight: 720),
    nativeDurationMs: 0,
    sampledAtMs: 0
  ).detected
}

private func expectOuterEdges(_ card: SyntheticCard, background: Double) {
  let output = rectangleTrial(renderCard(card, width: 720, height: 1280, background: background))
  #expect(detects(output))
  withKnownIssue(roundedCorners) {
    let error = outlineError(output, card)
    #expect(error < 1.5, "corner error \(error) px")
  }
}

@Test("the rectangle trial fits a 7-degree turned card to its outer edges in every orientation")
func rectangleTrialFitsOuterEdges() {
  let card = SyntheticCard(center: SIMD2(372, 610), width: 400, angle: 7.0 * Double.pi / 180.0)
  let image = renderCard(card, width: 720, height: 1280, background: 190)
  for orientation in [CGImagePropertyOrientation.right, .up, .left] {
    let output = rectangleTrial(image, orientation: orientation)
    withKnownIssue(roundedCorners) {
      let error = outlineError(output, card)
      #expect(error < 1.5, "orientation \(orientation.rawValue) corner error \(error) px")
    }
  }
}

@Test("the rectangle trial finds no card on a blank surface")
func rectangleTrialRejectsBlankSurface() {
  #expect(!detects(rectangleTrial(renderCard(nil, width: 720, height: 1280, background: 150))))
}

@Test("the rectangle trial finds a slightly turned card in a portrait frame")
func rectangleTrialEndToEnd() {
  expectOuterEdges(SyntheticCard(center: SIMD2(350, 590), width: 420, angle: -5.0 * Double.pi / 180.0), background: 185)
}

@Test("the rectangle trial finds a card that lies sideways")
func rectangleTrialFindsSidewaysCard() {
  expectOuterEdges(SyntheticCard(center: SIMD2(360, 640), width: 400, angle: Double.pi / 2.0), background: 185)
}

@Test("the rectangle trial finds a 20-degree turned card")
func rectangleTrialFindsTurnedCard() {
  expectOuterEdges(SyntheticCard(center: SIMD2(360, 640), width: 380, angle: 20.0 * Double.pi / 180.0), background: 185)
}

@Test("the rectangle trial gives a shifted card a matching signature and different art a different one")
func rectangleTrialCardSignature() {
  func signature(for card: SyntheticCard, artOffset: Double) -> [Double] {
    var image = renderCard(card, width: 720, height: 1280, background: 185)
    let box = card.corners
    let left = Int(box.map(\.x).min()! + card.width * (0.15 + artOffset))
    let top = Int(box.map(\.y).min()! + card.height * 0.2)
    for y in top ..< top + Int(card.height * 0.12) {
      for x in left ..< left + Int(card.width * 0.4) {
        image.pixels[y * 720 + x] = 60
      }
    }
    let output = rectangleTrial(image)
    #expect(output.signature.count == 48, "signature has \(output.signature.count) cells")
    return output.signature
  }
  let base = SyntheticCard(center: SIMD2(350, 600), width: 420, angle: 0.0)
  let shifted = SyntheticCard(center: SIMD2(356, 606), width: 420, angle: 1.0 * Double.pi / 180.0)
  let baseSignature = signature(for: base, artOffset: 0.0)
  let same = correlation(baseSignature, signature(for: shifted, artOffset: 0.0))
  let different = correlation(baseSignature, signature(for: base, artOffset: 0.4))
  #expect(same > 0.9, "same card signature correlation \(same)")
  #expect(different < 0.6, "different card signature correlation \(different)")
}

@Test("the rectangle trial fits a card with one edge that shows no step")
func rectangleTrialOneFlatEdge() {
  let card = SyntheticCard(center: SIMD2(360, 620), width: 400, angle: 0.0)
  var image = renderCard(card, width: 720, height: 1280, background: 190)
  let flatFrom = Int(card.corners.map(\.x).max()! - card.width * 0.2)
  for y in 0 ..< 1280 {
    for x in flatFrom ..< 720 {
      image.pixels[y * 720 + x] = 28
    }
  }
  let output = rectangleTrial(image)
  withKnownIssue("The trial finds the text box, which the area gate refuses") {
    #expect(detects(output))
    let error = outlineError(output, card)
    #expect(error < 2.0, "corner error \(error) px")
  }
}

@Test("the rectangle trial refuses a square")
func rectangleTrialRefusesSquare() {
  var image = GrayImage(width: 720, height: 1280, fill: 190)
  for y in 440 ..< 840 {
    for x in 160 ..< 560 {
      image.pixels[y * 720 + x] = 30
    }
  }
  #expect(!detects(rectangleTrial(image)))
}
