@testable import CardDetector
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import simd

let displayOrientation = CGImagePropertyOrientation.right

let usage = """
usage: card-detector step <image>...
  Reads lines of <index> [<intrinsic matrix of the portrait frame, 9 numbers by row>] and writes a detection sample for each,
  or lines of {"refine": <index>, "photo": <path>, "outline": [{"x":..,"y":..}, ...], "intrinsicMatrix": [[..], [..], [..]]}
  and writes the photo outline.
"""

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

func cameraIntrinsicMatrix(ofPortraitFrame matrix: [Double], buffer: CVPixelBuffer) -> simd_float3x3 {
  let transform = OrientationTransform(
    displayOrientation: displayOrientation,
    bufferWidth: Double(CVPixelBufferGetWidth(buffer)),
    bufferHeight: Double(CVPixelBufferGetHeight(buffer))
  )!
  let principalPoint = transform.bufferPoint(SIMD2(matrix[2], matrix[5]))
  return simd_float3x3(rows: [
    SIMD3(Float(matrix[4]), 0, Float(principalPoint.x)),
    SIMD3(0, Float(matrix[0]), Float(principalPoint.y)),
    SIMD3(0, 0, 1),
  ])
}

func detect(_ buffer: CVPixelBuffer, intrinsicMatrix: simd_float3x3?) -> DetectionSample {
  let startedAt = ProcessInfo.processInfo.systemUptime
  let output = CardQuadDetector.detect(
    pixelBuffer: buffer,
    displayOrientation: displayOrientation,
    intrinsicMatrix: intrinsicMatrix
  )
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

func portraitBuffer(_ path: String) -> CVPixelBuffer {
  guard let frame = loadFrame(at: URL(fileURLWithPath: path)), frame.width < frame.height,
        let buffer = analysisBuffer(of: frame)
  else { fail("cannot read the portrait frame \(path)") }
  return buffer
}

func warmedUpBuffers(_ paths: [String]) -> [CVPixelBuffer] {
  let buffers = paths.map(portraitBuffer)
  _ = detect(buffers[0], intrinsicMatrix: nil)
  return buffers
}

struct RefineRequest: Decodable {
  struct Point: Decodable {
    let x: Double
    let y: Double
  }

  let refine: Int
  let photo: String
  let outline: [Point]
  let intrinsicMatrix: [[Double]]
}

func outlineRecord(_ outline: [SIMD2<Double>]) -> [[String: Double]] {
  outline.map { ["x": $0.x, "y": $0.y] }
}

func emitPhotoOutline(frame: String, buffer: CVPixelBuffer, request: RefineRequest) {
  autoreleasepool {
    let heldStill = request.outline.map { SIMD2($0.x, $0.y) }
    let startedAt = ProcessInfo.processInfo.systemUptime
    let result = PhotoOutline.refine(
      photo: URL(fileURLWithPath: request.photo),
      frame: buffer,
      frameOrientation: displayOrientation,
      frameIntrinsicMatrix: cameraIntrinsicMatrix(ofPortraitFrame: request.intrinsicMatrix.flatMap { $0 }, buffer: buffer),
      heldStill: heldStill
    )
    emit([
      "frame": frame,
      "photo": request.photo,
      "heldStill": outlineRecord(heldStill),
      "outline": outlineRecord(result.outline),
      "outcome": result.outcome.rawValue,
      "durationMs": CardQuadDetector.elapsedMilliseconds(since: startedAt),
    ])
  }
}

func decoded<Value: Decodable>(_ type: Value.Type, from text: String) -> Value {
  guard let value = try? JSONDecoder().decode(type, from: Data(text.utf8)) else { fail("cannot read \(text)") }
  return value
}

func emitDetection(_ path: String, _ buffer: CVPixelBuffer, intrinsicMatrix: simd_float3x3?) {
  autoreleasepool {
    emit(detect(buffer, intrinsicMatrix: intrinsicMatrix).record.merging(["frame": path]) { current, _ in current })
  }
}

func detectFramesOnRequest(_ paths: [String]) {
  let buffers = warmedUpBuffers(paths)
  while let line = readLine() {
    if line.hasPrefix("{") {
      let request = decoded(RefineRequest.self, from: line)
      guard buffers.indices.contains(request.refine) else { fail("no frame at index \(request.refine)") }
      emitPhotoOutline(frame: paths[request.refine], buffer: buffers[request.refine], request: request)
      continue
    }
    let fields = line.split(separator: " ")
    guard let index = fields.first.flatMap({ Int($0) }), buffers.indices.contains(index) else {
      fail("no frame at index \(line)")
    }
    let matrix = fields.dropFirst().compactMap { Double($0) }
    guard [0, 9].contains(matrix.count) else {
      fail("the intrinsic matrix needs 9 numbers: \(line)")
    }
    emitDetection(
      paths[index],
      buffers[index],
      intrinsicMatrix: matrix.isEmpty ? nil : cameraIntrinsicMatrix(ofPortraitFrame: matrix, buffer: buffers[index])
    )
  }
}

func dumpBuffer(_ directory: URL, file: String = "frame.nv12.zlib", width: Int = 1280, height: Int = 720) -> CVPixelBuffer {
  guard let compressed = try? Data(contentsOf: directory.appendingPathComponent(file)),
        let packed = try? (compressed as NSData).decompressed(using: .zlib) as Data
  else { fail("cannot read \(file) in \(directory.path)") }
  var created: CVPixelBuffer?
  guard CVPixelBufferCreate(
    kCFAllocatorDefault, width, height, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &created
  ) == kCVReturnSuccess, let buffer = created else { fail("cannot create a buffer") }
  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
  var offset = 0
  for plane in 0 ..< 2 {
    let rows = plane == 0 ? height : height / 2
    let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, plane)
    let base = CVPixelBufferGetBaseAddressOfPlane(buffer, plane)!
    packed.withUnsafeBytes { bytes in
      for row in 0 ..< rows {
        memcpy(base + row * stride, bytes.baseAddress! + offset + row * width, width)
      }
    }
    offset += rows * width
  }
  return buffer
}

struct DumpRecord: Decodable {
  struct Frame: Decodable { let intrinsicMatrixRows: [[Double]] }
  let heldStill: [[Double]]
  let frame: Frame
}

func refinePhotoDump(_ path: String, matrixOverride: [Double]?) {
  let directory = URL(fileURLWithPath: path)
  guard let data = try? Data(contentsOf: directory.appendingPathComponent("record.json")),
        let record = try? JSONDecoder().decode(DumpRecord.self, from: data)
  else { fail("cannot read record.json in \(path)") }
  let buffer = dumpBuffer(directory)
  let rows = matrixOverride ?? record.frame.intrinsicMatrixRows.flatMap { $0 }
  let matrix = simd_float3x3(rows: [
    SIMD3(Float(rows[0]), Float(rows[1]), Float(rows[2])),
    SIMD3(Float(rows[3]), Float(rows[4]), Float(rows[5])),
    SIMD3(Float(rows[6]), Float(rows[7]), Float(rows[8])),
  ])
  let heldStill = record.heldStill.map { SIMD2($0[0], $0[1]) }
  let result = PhotoOutline.refine(
    photo: directory.appendingPathComponent("photo.jpg"),
    frame: buffer,
    frameOrientation: displayOrientation,
    frameIntrinsicMatrix: ProcessInfo.processInfo.environment["NO_MATRIX"] == nil ? matrix : nil,
    heldStill: heldStill
  )
  let detection = detect(buffer, intrinsicMatrix: matrix)
  emit([
    "dump": directory.lastPathComponent,
    "outcome": result.outcome.rawValue,
    "outline": outlineRecord(result.outline),
    "refinement": result.debug?.refinement ?? "",
    "refinementAtHeldStill": result.debug?.refinementAtHeldStill ?? "",
    "frameDetection": detection.record,
  ])
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "photo-dump" {
  for path in arguments.dropFirst() { refinePhotoDump(path, matrixOverride: nil) }
  exit(0)
}
struct FrameLine: Decodable {
  let frame: String
  let seconds: Double
  let intrinsicMatrixRows: [[Double]]?
}

func detectFrameDump(_ path: String) {
  let directory = URL(fileURLWithPath: path)
  guard let text = try? String(contentsOf: directory.appendingPathComponent("frames.jsonl"), encoding: .utf8) else {
    fail("cannot read frames.jsonl in \(path)")
  }
  for line in text.split(separator: "\n") {
    let frame = decoded(FrameLine.self, from: String(line))
    let buffer = dumpBuffer(directory, file: frame.frame)
    let matrix = frame.intrinsicMatrixRows.map { rows in
      simd_float3x3(rows: rows.map { SIMD3(Float($0[0]), Float($0[1]), Float($0[2])) })
    }
    print("[DEBUG-493] frame \(frame.frame)")
    emit(detect(buffer, intrinsicMatrix: matrix).record.merging(["frame": frame.frame, "seconds": frame.seconds]) { current, _ in current })
  }
}

if arguments.first == "frame-dump" {
  for path in arguments.dropFirst() { detectFrameDump(path) }
  exit(0)
}

guard arguments.first == "step", arguments.count > 1 else { fail(usage) }
detectFramesOnRequest(Array(arguments.dropFirst()))
