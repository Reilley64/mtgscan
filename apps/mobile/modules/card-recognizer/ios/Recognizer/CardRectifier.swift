import CoreGraphics
import CoreImage
import Foundation
import ImageIO

public struct CardOutline: Sendable, Equatable {
  public var topLeft: CGPoint
  public var topRight: CGPoint
  public var bottomRight: CGPoint
  public var bottomLeft: CGPoint

  public init(corners: [CGPoint]) {
    topLeft = corners[0]
    topRight = corners[1]
    bottomRight = corners[2]
    bottomLeft = corners[3]
  }

  public func portraitOrdered(imageWidth: CGFloat, imageHeight: CGFloat) -> CardOutline {
    func length(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
      hypot((a.x - b.x) * imageWidth, (a.y - b.y) * imageHeight)
    }
    let top = length(topLeft, topRight) + length(bottomLeft, bottomRight)
    let sides = length(topLeft, bottomLeft) + length(topRight, bottomRight)
    guard top > sides else { return self }
    return CardOutline(corners: [bottomLeft, topLeft, topRight, bottomRight])
  }
}

public enum CardRectifier {
  static let context = CIContext(options: [.cacheIntermediates: false])

  public static func loadOrientedImage(at url: URL) -> CIImage? {
    guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      return nil
    }
    return image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  }

  public static func loadCard(at url: URL) -> CGImage? {
    guard let image = loadOrientedImage(at: url) else { return nil }
    return context.createCGImage(image, from: image.extent)
  }

  public static func rectify(_ image: CIImage, outline: CardOutline, width: Int, height: Int) -> CGImage? {
    let extent = image.extent
    func point(_ normalized: CGPoint) -> CIVector {
      CIVector(x: normalized.x * extent.width, y: (1 - normalized.y) * extent.height)
    }
    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(point(outline.topLeft), forKey: "inputTopLeft")
    filter.setValue(point(outline.topRight), forKey: "inputTopRight")
    filter.setValue(point(outline.bottomRight), forKey: "inputBottomRight")
    filter.setValue(point(outline.bottomLeft), forKey: "inputBottomLeft")
    guard let corrected = filter.outputImage else { return nil }
    let scaled = corrected
      .transformed(by: CGAffineTransform(translationX: -corrected.extent.minX, y: -corrected.extent.minY))
      .transformed(by: CGAffineTransform(
        scaleX: CGFloat(width) / corrected.extent.width,
        y: CGFloat(height) / corrected.extent.height
      ))
    return context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: width, height: height))
  }

  public static func rectifiedCard(photo: URL, outline: CardOutline) throws(RecognitionFailure) -> CGImage {
    guard let image = loadOrientedImage(at: photo) else { throw .unreadablePhoto }
    guard let card = rectify(
      image,
      outline: outline.portraitOrdered(imageWidth: image.extent.width, imageHeight: image.extent.height),
      width: CardRecognizer.readWidth,
      height: CardRecognizer.readHeight
    ) else { throw .rectificationFailed }
    return card
  }

  public static func rotatedHalfTurn(_ image: CGImage) -> CGImage? {
    let source = CIImage(cgImage: image).oriented(.down)
    let moved = source.transformed(by: CGAffineTransform(translationX: -source.extent.minX, y: -source.extent.minY))
    return context.createCGImage(moved, from: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  }

  public static func resized(_ image: CGImage, width: Int, height: Int) -> CGImage? {
    let source = CIImage(cgImage: image)
    let scaled = source.transformed(by: CGAffineTransform(
      scaleX: CGFloat(width) / source.extent.width,
      y: CGFloat(height) / source.extent.height
    ))
    return context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: width, height: height))
  }

  static func cropped(_ image: CGImage, top: Double, bottom: Double, scale: Double) -> CGImage? {
    let source = CIImage(cgImage: image)
    let height = source.extent.height
    let region = CGRect(x: 0, y: height * (1 - bottom), width: source.extent.width, height: height * (bottom - top))
    let strip = source.cropped(to: region)
      .transformed(by: CGAffineTransform(translationX: 0, y: -region.minY))
    let output: CIImage
    if scale == 1 {
      output = strip
    } else {
      guard let filter = CIFilter(name: "CILanczosScaleTransform") else { return nil }
      filter.setValue(strip, forKey: kCIInputImageKey)
      filter.setValue(scale, forKey: kCIInputScaleKey)
      filter.setValue(1.0, forKey: kCIInputAspectRatioKey)
      guard let result = filter.outputImage else { return nil }
      output = result
    }
    return context.createCGImage(output, from: output.extent.integral)
  }
}
