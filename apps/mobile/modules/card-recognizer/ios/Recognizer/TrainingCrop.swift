import CoreGraphics
import Foundation
import libwebp

public enum TrainingCrop {
  static let quality: Float = 90

  public static func write(_ card: CGImage, in directory: URL) -> URL? {
    let file = directory.appendingPathComponent("\(UUID().uuidString).webp")
    guard let webp = webp(of: card),
          (try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)) != nil,
          (try? webp.write(to: file)) != nil
    else { return nil }
    return file
  }

  private static func webp(of card: CGImage) -> Data? {
    let width = card.width
    let height = card.height
    let bytesPerRow = width * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
    let drawn = pixels.withUnsafeMutableBytes { buffer in
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let context = CGContext(
              data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: bytesPerRow,
              space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
      else { return false }
      context.draw(card, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return nil }
    var output: UnsafeMutablePointer<UInt8>?
    let size = WebPEncodeRGBA(pixels, Int32(width), Int32(height), Int32(bytesPerRow), quality, &output)
    defer { WebPFree(output) }
    guard size > 0, let output else { return nil }
    return Data(bytes: output, count: size)
  }
}
