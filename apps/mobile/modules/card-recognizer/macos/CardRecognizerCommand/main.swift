import CardRecognizer
import CoreGraphics
import Foundation
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
usage: card-recognizer serve <gallery-dir> | feature-prints <image>... | encode <image-list> <output>
  | install <version-dir> <gallery-dir> | about
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

func serve(galleryDirectory: URL) {
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
  let model: FeaturePrintModel
  let thresholds: RecognizerThresholds
}

func about() {
  let version = ProcessInfo.processInfo.operatingSystemVersion
  emit(About(
    macOS: "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
    machine: machineName(),
    model: FeaturePrint.model,
    thresholds: FeaturePrint.thresholds
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
