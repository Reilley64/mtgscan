@testable import CardRecognizer
import Foundation

func fixtureGallery(printings: [[String: Any]], vectors: [Float16], version: String? = nil) throws -> Gallery {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try JSONSerialization.data(withJSONObject: printings).write(to: directory.appendingPathComponent(GalleryFile.printingList))
  try JSONEncoder().encode(
    GalleryHeader(count: printings.count, dimension: FeaturePrint.dimension, revision: FeaturePrint.revision, createdAt: "", encoding: nil, version: version)
  ).write(to: directory.appendingPathComponent(GalleryFile.header))
  try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: directory.appendingPathComponent(GalleryFile.float16Vectors))
  return try Gallery(directory: directory)
}
