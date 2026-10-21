@testable import CardDetector
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO

let displayOrientation = CGImagePropertyOrientation.right

let usage = "usage: card-detector frames <image>..."

struct Frame {
  let width: Int
  let height: Int
  let rgba: [UInt8]
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

func loadFrame(at url: URL) -> Frame? {
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
        let space = image.colorSpace, space.model == .rgb
  else { return nil }
  var rgba = [UInt8](repeating: 0, count: image.width * image.height * 4)
  let drawn = rgba.withUnsafeMutableBytes { bytes in
    guard let context = CGContext(
      data: bytes.baseAddress,
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bytesPerRow: image.width * 4,
      space: space,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { return false }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return true
  }
  return drawn ? Frame(width: image.width, height: image.height, rgba: rgba) : nil
}

func luma(_ red: Double, _ green: Double, _ blue: Double) -> Double {
  0.2126 * red + 0.7152 * green + 0.0722 * blue
}

func byte(_ value: Double) -> UInt8 {
  UInt8(max(0, min(255, value.rounded())))
}

func analysisBuffer(of frame: Frame) -> CVPixelBuffer? {
  let transform = OrientationTransform(
    displayOrientation: displayOrientation,
    bufferWidth: Double(frame.height),
    bufferHeight: Double(frame.width)
  )!
  let bufferWidth = frame.height
  let bufferHeight = frame.width
  var created: CVPixelBuffer?
  guard CVPixelBufferCreate(
    kCFAllocatorDefault,
    bufferWidth,
    bufferHeight,
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary,
    &created
  ) == kCVReturnSuccess, let buffer = created else { return nil }
  var rgb = [Double](repeating: 0, count: bufferWidth * bufferHeight * 3)
  for y in 0 ..< frame.height {
    for x in 0 ..< frame.width {
      let target = transform.bufferPoint(SIMD2(Double(x) + 0.5, Double(y) + 0.5))
      let destination = (Int(target.y) * bufferWidth + Int(target.x)) * 3
      let source = (y * frame.width + x) * 4
      for channel in 0 ..< 3 {
        rgb[destination + channel] = Double(frame.rgba[source + channel])
      }
    }
  }
  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
  let lumaPlane = CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!.assumingMemoryBound(to: UInt8.self)
  let lumaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
  for y in 0 ..< bufferHeight {
    for x in 0 ..< bufferWidth {
      let pixel = (y * bufferWidth + x) * 3
      lumaPlane[y * lumaStride + x] = byte(luma(rgb[pixel], rgb[pixel + 1], rgb[pixel + 2]))
    }
  }
  let chromaPlane = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)!.assumingMemoryBound(to: UInt8.self)
  let chromaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
  for row in 0 ..< bufferHeight / 2 {
    for column in 0 ..< bufferWidth / 2 {
      var mean = [0.0, 0.0, 0.0]
      for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        let pixel = ((2 * row + dy) * bufferWidth + 2 * column + dx) * 3
        for channel in 0 ..< 3 {
          mean[channel] += rgb[pixel + channel] / 4
        }
      }
      let y = luma(mean[0], mean[1], mean[2])
      chromaPlane[row * chromaStride + 2 * column] = byte((mean[2] - y) / 1.8556 + 128)
      chromaPlane[row * chromaStride + 2 * column + 1] = byte((mean[0] - y) / 1.5748 + 128)
    }
  }
  return buffer
}

func emit(_ record: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys, .withoutEscapingSlashes]),
        let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
  fflush(stdout)
}

func detect(_ buffer: CVPixelBuffer) -> DetectionSample {
  let startedAt = ProcessInfo.processInfo.systemUptime
  let output = CardQuadDetector.detect(pixelBuffer: buffer, displayOrientation: displayOrientation)
  return DetectionSample(
    output: output,
    transform: OrientationTransform(
      displayOrientation: displayOrientation,
      bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
      bufferHeight: Double(CVPixelBufferGetHeight(buffer))
    ),
    nativeDurationMs: CardQuadDetector.elapsedMilliseconds(since: startedAt),
    sampledAtMs: 0
  )
}

func detectFrames(_ paths: [String]) {
  let buffers = paths.map { path in
    guard let frame = loadFrame(at: URL(fileURLWithPath: path)), frame.width < frame.height,
          let buffer = analysisBuffer(of: frame)
    else { fail("cannot read the portrait frame \(path)") }
    return buffer
  }
  _ = detect(buffers[0])
  for (path, buffer) in zip(paths, buffers) {
    autoreleasepool {
      emit(detect(buffer).record.merging(["frame": path]) { current, _ in current })
    }
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
switch arguments.first {
case "frames" where arguments.count > 1:
  detectFrames(Array(arguments.dropFirst()))
default:
  fail(usage)
}
