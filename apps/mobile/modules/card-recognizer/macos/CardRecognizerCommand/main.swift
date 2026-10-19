import CardRecognizer
import CoreGraphics
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers
import os

struct ServeRequest: Decodable {
  let requestId: String
  let photoPath: String?
  let outline: [[Double]]?
  let cropPath: String?
  let excludeIds: [String]?
}

struct ServeResponse: Encodable {
  let requestId: String
  let recognition: Recognition?
  let error: String?
}

struct FeaturePrintLine: Encodable {
  let input: String
  let vector: String?
  let error: String?
}

let usage = """
usage: card-recognizer index <gallery-dir> <images-dir> | serve <gallery-dir> | feature-prints <image>...
  | encode <image-list> <output> | install <version-dir> <gallery-dir> | about
"""

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

func emit<T: Encodable>(_ value: T) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
  guard let data = try? encoder.encode(value), let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func recognize(_ request: ServeRequest, gallery: Gallery) throws(RecognitionFailure) -> Recognition {
  let excluded = Set((request.excludeIds ?? []).compactMap { gallery.index(id: $0) })
  if let photoPath = request.photoPath, let corners = request.outline {
    return try CardRecognizer.recognize(
      photo: URL(fileURLWithPath: photoPath),
      outline: try CardOutline(corners: corners.compactMap { $0.count == 2 ? CGPoint(x: $0[0], y: $0[1]) : nil }),
      gallery: gallery,
      excluded: excluded
    )
  }
  guard let cropPath = request.cropPath, let card = CardRectifier.loadCard(at: URL(fileURLWithPath: cropPath)) else {
    throw .unreadablePhoto
  }
  return try CardRecognizer.recognize(card: card, gallery: gallery, excluded: excluded)
}

// Prototype (embedding replay). RECOGNIZER_DUMP_DIR writes every embedding input as <pixel sha256>.png and
// still uses Vision. RECOGNIZER_QUERY_VECTORS names a folder with keys.txt (one pixel sha256 per line),
// vectors.f32 (one row per key), and dimension.txt; the recognizer then uses those vectors instead of Vision.
func pixelKey(_ image: CGImage) -> String {
  let width = image.width
  let height = image.height
  var pixels = [UInt8](repeating: 0, count: width * height * 4)
  pixels.withUnsafeMutableBytes { buffer in
    let context = CGContext(
      data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  }
  return SHA256.hash(data: Data(pixels)).map { String(format: "%02x", $0) }.joined()
}

func configureEmbedding() {
  let environment = ProcessInfo.processInfo.environment
  if let dump = environment["RECOGNIZER_DUMP_DIR"] {
    let directory = URL(fileURLWithPath: dump)
    let log = directory.appendingPathComponent("keys-\(ProcessInfo.processInfo.processIdentifier).txt")
    FileManager.default.createFile(atPath: log.path, contents: nil)
    let logHandle = try! FileHandle(forWritingTo: log)
    FeaturePrint.override = FeaturePrint.Override(dimension: FeaturePrint.dimension) { image in
      let key = pixelKey(image)
      logHandle.write(Data("\(key)\n".utf8))
      let file = directory.appendingPathComponent("\(key).png")
      if !FileManager.default.fileExists(atPath: file.path),
         let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil) {
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
      }
      return try FeaturePrint.visionVector(of: image)
    }
    return
  }
  guard let folder = environment["RECOGNIZER_QUERY_VECTORS"] else { return }
  let directory = URL(fileURLWithPath: folder)
  guard let keys = try? String(contentsOf: directory.appendingPathComponent("keys.txt"), encoding: .utf8).split(separator: "\n"),
        let dimensionText = try? String(contentsOf: directory.appendingPathComponent("dimension.txt"), encoding: .utf8),
        let dimension = Int(dimensionText.trimmingCharacters(in: .whitespacesAndNewlines)),
        let data = try? Data(contentsOf: directory.appendingPathComponent("vectors.f32"))
  else { fail("cannot read the query vectors in \(folder)") }
  let values = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  guard values.count == keys.count * dimension else { fail("vectors.f32 does not match keys.txt") }
  var vectors: [String: [Float]] = [:]
  for (row, key) in keys.enumerated() {
    vectors[String(key)] = Array(values[row * dimension ..< (row + 1) * dimension])
  }
  let table = vectors
  FeaturePrint.override = FeaturePrint.Override(dimension: dimension) { image in
    let key = pixelKey(image)
    guard let vector = table[key] else {
      FileHandle.standardError.write(Data("no query vector for \(key)\n".utf8))
      throw FeaturePrint.Failure.noObservation
    }
    return vector
  }
}

func serve(galleryDirectory: URL) {
  configureEmbedding()
  let gallery: Gallery
  do {
    gallery = try Gallery(directory: galleryDirectory)
  } catch {
    fail("cannot load the gallery: \(error)")
  }
  emit(["ready": gallery.printings.count])
  let decoder = JSONDecoder()
  while let line = readLine() {
    guard let request = try? decoder.decode(ServeRequest.self, from: Data(line.utf8)) else {
      emit(ServeResponse(requestId: "", recognition: nil, error: "invalid request"))
      continue
    }
    autoreleasepool {
      do throws(RecognitionFailure) {
        emit(ServeResponse(requestId: request.requestId, recognition: try recognize(request, gallery: gallery), error: nil))
      } catch {
        emit(ServeResponse(requestId: request.requestId, recognition: nil, error: error.code))
      }
    }
  }
}

func forEachFeaturePrint(of images: [URL], _ body: @Sendable (Int, [Float]) -> Void) {
  let progress = OSAllocatedUnfairLock(initialState: (completed: 0, failures: [String]()))
  DispatchQueue.concurrentPerform(iterations: images.count) { row in
    autoreleasepool {
      let vector = FeaturePrint.vector(ofCardAt: images[row])
      if let vector { body(row, vector) }
      progress.withLock { state in
        if vector == nil { state.failures.append(images[row].lastPathComponent) }
        state.completed += 1
        if state.completed % 5000 == 0 {
          FileHandle.standardError.write(Data("computed \(state.completed) of \(images.count) feature prints\n".utf8))
        }
      }
    }
  }
  let failures = progress.withLock { $0.failures }
  guard failures.isEmpty else {
    fail("\(failures.count) images failed, first: \(failures.prefix(5).joined(separator: ", "))")
  }
}

func index(galleryDirectory: URL, imagesDirectory: URL) {
  let printings: [GalleryPrinting]
  do {
    printings = try Gallery.printingList(in: galleryDirectory)
  } catch {
    fail("cannot read the printing list: \(error)")
  }
  let dimension = FeaturePrint.dimension
  let startedAt = Date()
  var vectors = [Float16](repeating: 0, count: printings.count * dimension)
  vectors.withUnsafeMutableBufferPointer { output in
    nonisolated(unsafe) let buffer = output
    forEachFeaturePrint(of: printings.map { imagesDirectory.appendingPathComponent("\($0.id).jpg") }) { row, vector in
      for component in 0 ..< dimension {
        buffer[row * dimension + component] = Float16(vector[component])
      }
    }
  }
  do {
    try vectors.withUnsafeBufferPointer { Data(buffer: $0) }
      .write(to: galleryDirectory.appendingPathComponent(GalleryFile.float16Vectors))
    let header = GalleryHeader(
      count: printings.count,
      dimension: dimension,
      revision: FeaturePrint.revision,
      createdAt: ISO8601DateFormatter().string(from: Date()),
      encoding: GalleryHeader.float16
    )
    try JSONEncoder().encode(header).write(to: galleryDirectory.appendingPathComponent(GalleryFile.header))
  } catch {
    fail("cannot write the gallery: \(error)")
  }
  emit(["printings": printings.count, "seconds": Int(Date().timeIntervalSince(startedAt))])
}

func encode(imageList: URL, output: URL) {
  let images: [URL]
  do {
    images = try String(contentsOf: imageList, encoding: .utf8)
      .split(separator: "\n")
      .map { URL(fileURLWithPath: String($0)) }
  } catch {
    fail("cannot read the image list: \(error)")
  }
  let dimension = FeaturePrint.dimension
  let startedAt = Date()
  var codes = [Int8](repeating: 0, count: images.count * dimension)
  codes.withUnsafeMutableBufferPointer { output in
    nonisolated(unsafe) let buffer = output
    forEachFeaturePrint(of: images) { row, vector in
      for (component, code) in GalleryEncoding.int8Codes(of: vector).enumerated() {
        buffer[row * dimension + component] = code
      }
    }
  }
  do {
    try codes.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: output)
  } catch {
    fail("cannot write the feature prints: \(error)")
  }
  emit(["featurePrints": images.count, "seconds": Int(Date().timeIntervalSince(startedAt))])
}

func install(versionDirectory: URL, galleryDirectory: URL) {
  let startedAt = Date()
  do {
    try GalleryInstaller.install(from: versionDirectory, into: galleryDirectory)
  } catch {
    fail("cannot install the gallery: \(error)")
  }
  emit(["seconds": Int(Date().timeIntervalSince(startedAt))])
}

func machineName() -> String {
  var size = 0
  sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0)
  var name = [CChar](repeating: 0, count: size)
  sysctlbyname("machdep.cpu.brand_string", &name, &size, nil, 0)
  return String(decoding: name.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
}

struct About: Encodable {
  let macOS: String
  let machine: String
  let featurePrintRevision: Int
  let dimension: Int
}

func about() {
  let version = ProcessInfo.processInfo.operatingSystemVersion
  emit(About(
    macOS: "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
    machine: machineName(),
    featurePrintRevision: FeaturePrint.revision,
    dimension: FeaturePrint.dimension
  ))
}

func featurePrints(images: [String]) {
  for input in images {
    autoreleasepool {
      guard let vector = FeaturePrint.vector(ofCardAt: URL(fileURLWithPath: input)) else {
        emit(FeaturePrintLine(input: input, vector: nil, error: RecognitionFailure.unreadablePhoto.code))
        return
      }
      let data = vector.withUnsafeBufferPointer { Data(buffer: $0) }
      emit(FeaturePrintLine(input: input, vector: data.base64EncodedString(), error: nil))
    }
  }
}

let arguments = CommandLine.arguments
switch arguments.dropFirst().first {
case "index" where arguments.count == 4:
  index(galleryDirectory: URL(fileURLWithPath: arguments[2]), imagesDirectory: URL(fileURLWithPath: arguments[3]))
case "serve" where arguments.count == 3:
  serve(galleryDirectory: URL(fileURLWithPath: arguments[2]))
case "feature-prints" where arguments.count > 2:
  featurePrints(images: Array(arguments.dropFirst(2)))
case "encode" where arguments.count == 4:
  encode(imageList: URL(fileURLWithPath: arguments[2]), output: URL(fileURLWithPath: arguments[3]))
case "install" where arguments.count == 4:
  install(versionDirectory: URL(fileURLWithPath: arguments[2]), galleryDirectory: URL(fileURLWithPath: arguments[3]))
case "about" where arguments.count == 2:
  about()
default:
  fail(usage)
}
