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

let usage = "usage: card-recognizer index <gallery-dir> <images-dir> | serve <gallery-dir> | feature-prints <image>..."

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
  if let photoPath = request.photoPath, let corners = request.outline, corners.count == 4,
     corners.allSatisfy({ $0.count == 2 }) {
    return try CardRecognizer.recognize(
      photo: URL(fileURLWithPath: photoPath),
      outline: CardOutline(corners: corners.map { CGPoint(x: $0[0], y: $0[1]) }),
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

func featurePrint(ofCardAt url: URL) -> [Float]? {
  guard let card = CardRectifier.loadCard(at: url),
        let small = CardRectifier.resized(card, width: CardRecognizer.embedWidth, height: CardRecognizer.embedHeight)
  else { return nil }
  return try? FeaturePrint.vector(of: small)
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
  let progress = OSAllocatedUnfairLock(initialState: (completed: 0, failures: [String]()))
  vectors.withUnsafeMutableBufferPointer { output in
    nonisolated(unsafe) let buffer = output
    DispatchQueue.concurrentPerform(iterations: printings.count) { row in
      autoreleasepool {
        let vector = featurePrint(ofCardAt: imagesDirectory.appendingPathComponent("\(printings[row].id).jpg"))
        if let vector {
          for component in 0 ..< dimension {
            buffer[row * dimension + component] = Float16(vector[component])
          }
        }
        progress.withLock { state in
          if vector == nil { state.failures.append(printings[row].id) }
          state.completed += 1
          if state.completed % 5000 == 0 {
            FileHandle.standardError.write(Data("indexed \(state.completed) of \(printings.count)\n".utf8))
          }
        }
      }
    }
  }
  let failures = progress.withLock { $0.failures }
  guard failures.isEmpty else {
    fail("\(failures.count) images failed, first: \(failures.prefix(5).joined(separator: ", "))")
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

func featurePrints(images: [String]) {
  for input in images {
    autoreleasepool {
      guard let vector = featurePrint(ofCardAt: URL(fileURLWithPath: input)) else {
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
default:
  fail(usage)
}
