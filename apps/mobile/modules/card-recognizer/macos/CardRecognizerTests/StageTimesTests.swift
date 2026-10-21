@testable import CardRecognizer
import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

private func jpegFile(of image: CGImage) throws -> URL {
  let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
  let destination = try #require(CGImageDestinationCreateWithURL(file as CFURL, UTType.jpeg.identifier as CFString, 1, nil))
  CGImageDestinationAddImage(destination, image, nil)
  #expect(CGImageDestinationFinalize(destination))
  return file
}

@Test("the stage times of a recognition add up to the whole recognition of the photo")
func theStageTimesAddUpToTheWholeRecognition() throws {
  let photo = try card(seed: 1)
  let gallery = try fixtureGallery(
    printings: [
      ["id": "only", "oracleId": "only", "illustrationId": "only-art", "name": "only", "set": "tst", "collectorNumber": "1", "frame": "1997"],
      ["id": "other", "oracleId": "other", "illustrationId": "other-art", "name": "other", "set": "tst", "collectorNumber": "2", "frame": "1997"],
    ],
    vectors: try featurePrint(of: photo) + [Float16](repeating: 0, count: fixtureModel.vectorSize)
  )
  let file = try jpegFile(of: photo)
  let outline = try CardOutline(corners: [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 1)])
  let cropDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)

  let startedAt = ProcessInfo.processInfo.systemUptime
  let recognition = try CardRecognizer.recognize(photo: file, outline: outline, gallery: gallery, trainingCropDirectory: cropDirectory)
  let wholeMs = (ProcessInfo.processInfo.systemUptime - startedAt) * 1000

  guard case let .card(card) = recognition else {
    Issue.record("expected a card recognition")
    return
  }
  #expect(card.trainingCrop != nil)
  let stagesMs = card.stageMs.values.reduce(0, +)
  #expect(abs(wholeMs - stagesMs) < 5, "stages \(card.stageMs) add up to \(stagesMs) ms of \(wholeMs) ms")
}
