import CoreGraphics
import Foundation

struct ServeRequest: Codable {
  let requestId: String
  let photoPath: String?
  let cropPath: String?
  let quad: [[Double]]?
  let cropOutputPath: String?
  let excludeIds: [String]?
}

struct ServeResponse: Codable {
  let requestId: String
  let recognition: MTGRecognition?
  let error: String?
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
  exit(1)
}

func emit<T: Encodable>(_ value: T) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
  guard let data = try? encoder.encode(value), let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func buildGallery(catalogDirectory: URL, imagesDirectory: URL) {
  let printings: [MTGCatalogPrinting]
  do {
    printings = try JSONDecoder().decode(
      [MTGCatalogPrinting].self,
      from: Data(contentsOf: catalogDirectory.appendingPathComponent("catalog.json"))
    )
  } catch {
    fail("cannot read catalog.json: \(error)")
  }
  let dimension = MTGCardEmbedder.dimension
  var vectors = [Float16](repeating: 0, count: printings.count * dimension)
  var failures: [String] = []
  let lock = NSLock()
  let startedAt = Date()
  let progressStep = 5000
  var completed = 0
  vectors.withUnsafeMutableBufferPointer { output in
    let buffer = output
    DispatchQueue.concurrentPerform(iterations: printings.count) { index in
      autoreleasepool {
        let url = imagesDirectory.appendingPathComponent("\(printings[index].id).jpg")
        do {
          guard let image = MTGCardRectifier.loadOrientedImage(at: url),
                let card = MTGCardRectifier.context.createCGImage(image, from: image.extent),
                let small = MTGCardRectifier.resized(
                  card, width: MTGCardRecognizer.embedWidth, height: MTGCardRecognizer.embedHeight
                )
          else { throw MTGCardRecognizer.Failure.unreadableImage }
          let vector = try MTGCardEmbedder.featurePrint(of: small)
          for component in 0 ..< dimension {
            buffer[index * dimension + component] = Float16(vector[component])
          }
        } catch {
          lock.lock()
          failures.append(printings[index].id)
          lock.unlock()
        }
        lock.lock()
        completed += 1
        if completed % progressStep == 0 {
          FileHandle.standardError.write("embedded \(completed) of \(printings.count)\n".data(using: .utf8)!)
        }
        lock.unlock()
      }
    }
  }
  guard failures.isEmpty else {
    fail("\(failures.count) reference images failed, first: \(failures.prefix(5).joined(separator: ", "))")
  }
  let data = vectors.withUnsafeBufferPointer { Data(buffer: $0) }
  do {
    try data.write(to: catalogDirectory.appendingPathComponent("gallery.f16"))
    let header = MTGGalleryHeader(
      count: printings.count,
      dimension: dimension,
      revision: 2,
      createdAt: ISO8601DateFormatter().string(from: Date()),
      encoding: "float16"
    )
    try JSONEncoder().encode(header).write(to: catalogDirectory.appendingPathComponent("gallery.json"))
  } catch {
    fail("cannot write gallery: \(error)")
  }
  emit(["printings": printings.count, "seconds": Int(Date().timeIntervalSince(startedAt))])
}

struct EmbedLabels: Codable {
  struct Card: Codable {
    let photo: String?
    let crop: String?
    let quad: [[Double]]?
  }

  let cards: [Card]
  let nonCards: [String]?
}

func embedLabels(labelsPath: URL, outputPath: URL) {
  let labels: EmbedLabels
  do {
    labels = try JSONDecoder().decode(EmbedLabels.self, from: Data(contentsOf: labelsPath))
  } catch {
    fail("cannot read labels: \(error)")
  }
  let inputs = labels.cards + (labels.nonCards ?? []).map { EmbedLabels.Card(photo: nil, crop: $0, quad: nil) }
  let dimension = MTGCardEmbedder.dimension
  var vectors = [Float](repeating: .nan, count: inputs.count * 2 * dimension)
  vectors.withUnsafeMutableBufferPointer { output in
    let buffer = output
    DispatchQueue.concurrentPerform(iterations: inputs.count) { index in
      autoreleasepool {
        let input = inputs[index]
        var card: CGImage?
        if let photo = input.photo, let corners = input.quad,
           let image = MTGCardRectifier.loadOrientedImage(at: URL(fileURLWithPath: photo)) {
          let quad = MTGCardQuad(corners: corners.map { CGPoint(x: $0[0], y: $0[1]) })
          card = MTGCardRectifier.rectify(
            image,
            normalizedQuad: quad.portraitOrdered(imageWidth: image.extent.width, imageHeight: image.extent.height),
            width: MTGCardRecognizer.readWidth,
            height: MTGCardRecognizer.readHeight
          )
        } else if let crop = input.crop, let image = MTGCardRectifier.loadOrientedImage(at: URL(fileURLWithPath: crop)) {
          card = MTGCardRectifier.context.createCGImage(image, from: image.extent)
        }
        guard let card, let turned = MTGCardRectifier.rotatedHalfTurn(card) else { return }
        for (offset, image) in [card, turned].enumerated() {
          guard let small = MTGCardRectifier.resized(
            image, width: MTGCardRecognizer.embedWidth, height: MTGCardRecognizer.embedHeight
          ), let vector = try? MTGCardEmbedder.featurePrint(of: small) else { continue }
          for component in 0 ..< dimension {
            buffer[(index * 2 + offset) * dimension + component] = vector[component]
          }
        }
      }
    }
  }
  do {
    try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: outputPath)
  } catch {
    fail("cannot write vectors: \(error)")
  }
  emit(["inputs": inputs.count])
}

func serve(catalogDirectory: URL) {
  let catalog: MTGCardCatalog
  do {
    catalog = try MTGCardCatalog(directory: catalogDirectory)
  } catch {
    fail("cannot load catalog: \(error)")
  }
  emit(["ready": catalog.printings.count])
  let decoder = JSONDecoder()
  while let line = readLine() {
    guard let data = line.data(using: .utf8), let request = try? decoder.decode(ServeRequest.self, from: data) else {
      emit(ServeResponse(requestId: "", recognition: nil, error: "invalid request"))
      continue
    }
    autoreleasepool {
      do {
        let output = request.cropOutputPath.map { URL(fileURLWithPath: $0) }
        let excluded = Set((request.excludeIds ?? []).compactMap { catalog.index(id: $0) })
        let recognition: MTGRecognition
        if let photoPath = request.photoPath, let corners = request.quad, corners.count == 4,
           corners.allSatisfy({ $0.count == 2 }) {
          let quad = MTGCardQuad(corners: corners.map { CGPoint(x: $0[0], y: $0[1]) })
          recognition = try MTGCardRecognizer.recognize(
            photo: URL(fileURLWithPath: photoPath), quad: quad, catalog: catalog, cropOutput: output,
            excluded: excluded
          )
        } else if let cropPath = request.cropPath {
          recognition = try MTGCardRecognizer.recognize(
            crop: URL(fileURLWithPath: cropPath), catalog: catalog, cropOutput: output, excluded: excluded
          )
        } else {
          emit(ServeResponse(requestId: request.requestId, recognition: nil, error: "photoPath with quad, or cropPath, is required"))
          return
        }
        emit(ServeResponse(requestId: request.requestId, recognition: recognition, error: nil))
      } catch {
        emit(ServeResponse(requestId: request.requestId, recognition: nil, error: "\(error)"))
      }
    }
  }
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
  fail("usage: mtg-catalog-recognizer index <catalog-dir> <images-dir> | serve <catalog-dir> | embed <labels.json> <vectors.f32>")
}
switch arguments[1] {
case "index" where arguments.count == 4:
  buildGallery(
    catalogDirectory: URL(fileURLWithPath: arguments[2]),
    imagesDirectory: URL(fileURLWithPath: arguments[3])
  )
case "serve":
  serve(catalogDirectory: URL(fileURLWithPath: arguments[2]))
case "embed" where arguments.count == 4:
  embedLabels(labelsPath: URL(fileURLWithPath: arguments[2]), outputPath: URL(fileURLWithPath: arguments[3]))
default:
  fail("usage: mtg-catalog-recognizer index <catalog-dir> <images-dir> | serve <catalog-dir> | embed <labels.json> <vectors.f32>")
}
