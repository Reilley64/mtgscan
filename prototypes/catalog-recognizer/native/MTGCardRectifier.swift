import CoreGraphics
import CoreImage
import Foundation
import ImageIO

struct MTGCardQuad {
  var topLeft: CGPoint
  var topRight: CGPoint
  var bottomRight: CGPoint
  var bottomLeft: CGPoint

  var corners: [CGPoint] { [topLeft, topRight, bottomRight, bottomLeft] }

  init(topLeft: CGPoint, topRight: CGPoint, bottomRight: CGPoint, bottomLeft: CGPoint) {
    self.topLeft = topLeft
    self.topRight = topRight
    self.bottomRight = bottomRight
    self.bottomLeft = bottomLeft
  }

  init(corners: [CGPoint]) {
    self.init(topLeft: corners[0], topRight: corners[1], bottomRight: corners[2], bottomLeft: corners[3])
  }

  func portraitOrdered(imageWidth: CGFloat, imageHeight: CGFloat) -> MTGCardQuad {
    func length(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
      hypot((a.x - b.x) * imageWidth, (a.y - b.y) * imageHeight)
    }
    let top = length(topLeft, topRight) + length(bottomLeft, bottomRight)
    let sides = length(topLeft, bottomLeft) + length(topRight, bottomRight)
    guard top > sides else { return self }
    return MTGCardQuad(corners: [bottomLeft, topLeft, topRight, bottomRight])
  }

  func rotatedHalfTurn() -> MTGCardQuad {
    MTGCardQuad(corners: [bottomRight, bottomLeft, topLeft, topRight])
  }
}

enum MTGCardRectifier {
  static let context = CIContext(options: [.cacheIntermediates: false])

  static func loadOrientedImage(at url: URL) -> CIImage? {
    guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      return nil
    }
    return image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  }

  static func rectify(_ image: CIImage, normalizedQuad: MTGCardQuad, width: Int, height: Int) -> CGImage? {
    let extent = image.extent
    func point(_ normalized: CGPoint) -> CIVector {
      CIVector(x: normalized.x * extent.width, y: (1 - normalized.y) * extent.height)
    }
    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(point(normalizedQuad.topLeft), forKey: "inputTopLeft")
    filter.setValue(point(normalizedQuad.topRight), forKey: "inputTopRight")
    filter.setValue(point(normalizedQuad.bottomRight), forKey: "inputBottomRight")
    filter.setValue(point(normalizedQuad.bottomLeft), forKey: "inputBottomLeft")
    guard let corrected = filter.outputImage else { return nil }
    let scaled = corrected
      .transformed(by: CGAffineTransform(translationX: -corrected.extent.minX, y: -corrected.extent.minY))
      .transformed(by: CGAffineTransform(
        scaleX: CGFloat(width) / corrected.extent.width,
        y: CGFloat(height) / corrected.extent.height
      ))
    return context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: width, height: height))
  }

  static func rotatedHalfTurn(_ image: CGImage) -> CGImage? {
    let source = CIImage(cgImage: image).oriented(.down)
    let moved = source.transformed(by: CGAffineTransform(translationX: -source.extent.minX, y: -source.extent.minY))
    return context.createCGImage(moved, from: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  }

  static func resized(_ image: CGImage, width: Int, height: Int) -> CGImage? {
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

  static func jpegData(_ image: CGImage, quality: Double) -> Data? {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, "public.jpeg" as CFString, 1, nil) else {
      return nil
    }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return data as Data
  }
}
