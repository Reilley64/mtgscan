@testable import CardRecognizer
import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

private struct ReferenceImageMissing: Error {}

private func cardImage(seed: Int) throws -> Data {
  let width = 488
  let height = 680
  let context = try #require(CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
  ))
  for band in 0 ..< 12 {
    let shade = Double((band * 37 + seed * 71) % 255) / 255
    context.setFillColor(red: shade, green: 1 - shade, blue: Double((seed * 53 + band * 19) % 255) / 255, alpha: 1)
    if seed % 2 == 0 {
      context.fill(CGRect(x: 0, y: band * height / 12, width: width, height: height / 12))
    } else {
      context.fillEllipse(in: CGRect(x: band * 30, y: band * 45, width: 160 + seed * 10, height: 120))
    }
  }
  let data = NSMutableData()
  let destination = try #require(CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil))
  CGImageDestinationAddImage(destination, try #require(context.makeImage()), nil)
  CGImageDestinationFinalize(destination)
  return data as Data
}

private func galleryOfImages(_ images: [Data]) throws -> Gallery {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  var vectors: [Float16] = []
  var printings: [[String: Any]] = []
  for (row, image) in images.enumerated() {
    let file = directory.appendingPathComponent("\(row).png")
    try image.write(to: file)
    vectors += try #require(FeaturePrint.vector(ofCardAt: file)).map { Float16($0) }
    printings.append([
      "id": "printing-\(row)", "oracleId": "oracle-\(row)", "name": "Card \(row)", "set": "tst",
      "collectorNumber": "\(row)", "frame": "2015",
    ])
  }
  try JSONSerialization.data(withJSONObject: printings).write(to: directory.appendingPathComponent(GalleryFile.printingList))
  try JSONEncoder().encode(
    GalleryHeader(count: images.count, dimension: FeaturePrint.dimension, revision: FeaturePrint.revision, createdAt: "", encoding: nil)
  ).write(to: directory.appendingPathComponent(GalleryFile.header))
  try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: directory.appendingPathComponent(GalleryFile.float16Vectors))
  return try Gallery(directory: directory)
}

private func row(of printing: GalleryPrinting) -> Int {
  Int(printing.collectorNumber) ?? -1
}

@Test("the parity check takes 24 evenly spaced gallery rows as reference images")
func theParityCheckTakes24EvenlySpacedGalleryRowsAsReferenceImages() {
  #expect(GalleryParity.referenceRows(rowCount: 102_730).count == 24)
  #expect(GalleryParity.referenceRows(rowCount: 102_730).prefix(3) == [0, 4280, 8560])
  #expect(GalleryParity.referenceRows(rowCount: 3) == [0, 1, 2])
}

@Test("the parity check fetches each reference image from the Scryfall image host")
func theParityCheckFetchesEachReferenceImageFromTheScryfallImageHost() {
  #expect(
    GalleryParity.imageURL(printingId: "77285d12-e658-4eb3-ba13-ff202afab9c8")?.absoluteString
      == "https://cards.scryfall.io/normal/front/7/7/77285d12-e658-4eb3-ba13-ff202afab9c8.jpg"
  )
}

@Test("feature prints of the same images match the gallery rows")
func featurePrintsOfTheSameImagesMatchTheGalleryRows() async throws {
  let images = try (0 ..< 3).map(cardImage)
  let gallery = try galleryOfImages(images)

  let parity = await GalleryParity.check(gallery: gallery) { images[row(of: $0)] }

  #expect(parity.references == 3)
  #expect(parity.lowestCosine > 0.999)
  #expect(parity.meanCosine > 0.999)
  #expect(parity.failures.isEmpty)
}

@Test("a reference image that differs from its gallery row lowers the lowest cosine")
func aReferenceImageThatDiffersFromItsGalleryRowLowersTheLowestCosine() async throws {
  let images = try (0 ..< 3).map(cardImage)
  let gallery = try galleryOfImages(images)
  let changed = try cardImage(seed: 7)

  let parity = await GalleryParity.check(gallery: gallery) { row(of: $0) == 1 ? changed : images[row(of: $0)] }

  #expect(parity.references == 3)
  #expect(parity.lowestCosine < 0.98)
  #expect(parity.meanCosine > parity.lowestCosine)
}

@Test("a reference image that cannot be fetched is a failure and not a reference")
func aReferenceImageThatCannotBeFetchedIsAFailureAndNotAReference() async throws {
  let images = try (0 ..< 3).map(cardImage)
  let gallery = try galleryOfImages(images)

  let parity = await GalleryParity.check(gallery: gallery) { printing in
    guard row(of: printing) != 2 else { throw ReferenceImageMissing() }
    return images[row(of: printing)]
  }

  #expect(parity.references == 2)
  #expect(parity.failures.count == 1)
  #expect(parity.failures.first?.hasPrefix("printing-2") == true)
  #expect(parity.lowestCosine > 0.999)
}
