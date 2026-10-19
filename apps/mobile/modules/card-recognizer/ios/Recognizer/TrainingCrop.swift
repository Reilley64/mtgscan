import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum TrainingCrop {
  static let quality = 0.9

  static func write(_ card: CGImage, in directory: URL) -> URL? {
    let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")
    guard (try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)) != nil,
          let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, card, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    return CGImageDestinationFinalize(destination) ? file : nil
  }
}
