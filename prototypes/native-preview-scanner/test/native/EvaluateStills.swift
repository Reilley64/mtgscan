import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd
import UniformTypeIdentifiers

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
  fputs("usage: evaluate-stills <output-directory> <image>...\n", stderr)
  exit(2)
}
let outputDirectory = URL(fileURLWithPath: arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

func loadImage(_ path: String) -> CGImage? {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else {
    return nil
  }
  return CGImageSourceCreateThumbnailAtIndex(source, 0, [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: 1280,
  ] as CFDictionary)
}

func lumaBuffer(_ image: CGImage) -> CVPixelBuffer {
  var created: CVPixelBuffer?
  CVPixelBufferCreate(
    kCFAllocatorDefault,
    image.width,
    image.height,
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary,
    &created
  )
  let buffer = created!
  CVPixelBufferLockBaseAddress(buffer, [])
  let context = CGContext(
    data: CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
    width: image.width,
    height: image.height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRowOfPlane(buffer, 0),
    space: CGColorSpaceCreateDeviceGray(),
    bitmapInfo: CGImageAlphaInfo.none.rawValue
  )!
  context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  let chroma = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)!
  memset(chroma, 128, CVPixelBufferGetBytesPerRowOfPlane(buffer, 1) * CVPixelBufferGetHeightOfPlane(buffer, 1))
  CVPixelBufferUnlockBaseAddress(buffer, [])
  return buffer
}

func strokeQuad(_ context: CGContext, _ points: [SIMD2<Double>], _ width: Int, _ height: Int, _ color: CGColor, _ lineWidth: CGFloat) {
  context.setStrokeColor(color)
  context.setLineWidth(lineWidth)
  let mapped = points.map { CGPoint(x: $0.x * Double(width), y: (1.0 - $0.y) * Double(height)) }
  context.addLines(between: mapped + [mapped[0]])
  context.strokePath()
}

var quadRecords: [[String: Any]] = []

for (index, path) in arguments.dropFirst(2).enumerated() {
  guard let image = loadImage(path) else {
    print("\(index)\tunreadable")
    continue
  }
  let buffer = lumaBuffer(image)
  let startedAt = ProcessInfo.processInfo.systemUptime
  let output = MTGCardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: .up)
  let totalMs = MTGCardQuadDetector.elapsedMilliseconds(since: startedAt)
  quadRecords.append([
    "index": index,
    "path": path,
    "refinementStatus": output.refinementStatus.rawValue,
    "corners": (output.refined ?? []).map { ["x": $0.x, "y": $0.y] },
  ])
  let shifts = output.shifts.map { String(format: "%+.3f", $0) }.joined(separator: ",")
  print(String(
    format: "%d\tstatus %d\tconfidence %.2f\tsupport %.2f\tarea %.3f\taspect %.3f\tshifts %@\tproposal %.1f ms\ttotal %.1f ms",
    index,
    output.refinementStatus.rawValue,
    output.confidence,
    output.edgeSupportMin,
    output.areaRatio,
    output.aspectRatio,
    shifts,
    output.proposalDurationMs,
    totalMs
  ))

  let context = CGContext(
    data: nil,
    width: image.width,
    height: image.height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )!
  context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  if let proposal = output.proposal {
    strokeQuad(context, proposal, image.width, image.height, CGColor(red: 0, green: 0.9, blue: 1, alpha: 1), 3)
  }
  if let refined = output.refined {
    strokeQuad(context, refined, image.width, image.height, CGColor(red: 1, green: 0.3, blue: 0.85, alpha: 1), 3)
  }
  let destinationURL = outputDirectory.appendingPathComponent(String(format: "%03d.png", index))
  let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, context.makeImage()!, nil)
  CGImageDestinationFinalize(destination)
}

let quadData = try JSONSerialization.data(withJSONObject: quadRecords, options: [.prettyPrinted, .sortedKeys])
try quadData.write(to: outputDirectory.appendingPathComponent("quads.json"))
