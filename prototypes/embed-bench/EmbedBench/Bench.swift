import Accelerate
import CoreGraphics
import CoreImage
import CoreML
import Foundation
import ImageIO
import Vision

// Copied from the recognizer (CardRectifier, FeaturePrint, Gallery) so the bench does the app's work.
enum Card {
  static let context = CIContext(options: [.cacheIntermediates: false])

  static func load(_ url: URL) -> CGImage? {
    guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { return nil }
    let moved = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
    return context.createCGImage(moved, from: moved.extent)
  }

  static func rotatedHalfTurn(_ image: CGImage) -> CGImage? {
    let source = CIImage(cgImage: image).oriented(.down)
    let moved = source.transformed(by: CGAffineTransform(translationX: -source.extent.minX, y: -source.extent.minY))
    return context.createCGImage(moved, from: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  }

  static func resized(_ image: CGImage, width: Int = 488, height: Int = 680) -> CGImage? {
    let source = CIImage(cgImage: image)
    let scaled = source.transformed(by: CGAffineTransform(
      scaleX: CGFloat(width) / source.extent.width,
      y: CGFloat(height) / source.extent.height
    ))
    return context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: width, height: height))
  }
}

func visionVector(of image: CGImage) throws -> [Float] {
  let request = VNGenerateImageFeaturePrintRequest()
  request.revision = VNGenerateImageFeaturePrintRequestRevision2
  request.imageCropAndScaleOption = .scaleFill
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
  guard let observation = request.results?.first else { throw BenchError.failed("no observation") }
  var vector = observation.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
  if norm > 0 { vector = vector.map { $0 / norm } }
  return vector
}

enum BenchError: Error { case failed(String) }

final class SearchGallery {
  static let searchChunkRows = 4096
  let vectors: Data
  let count: Int
  let dimension: Int

  init(url: URL, dimension: Int) throws {
    vectors = try Data(contentsOf: url, options: .alwaysMapped)
    self.dimension = dimension
    count = vectors.count / (dimension * 2)
  }

  func similarities(to queries: [[Float]]) -> [[Float]] {
    let queryCount = queries.count
    var queryMatrix = [Float](repeating: 0, count: dimension * queryCount)
    for (column, query) in queries.enumerated() {
      for row in 0 ..< dimension { queryMatrix[row * queryCount + column] = query[row] }
    }
    var scores = [[Float]](repeating: [Float](repeating: 0, count: count), count: queryCount)
    var converted = [Float](repeating: 0, count: Self.searchChunkRows * dimension)
    var products = [Float](repeating: 0, count: Self.searchChunkRows * queryCount)
    vectors.withUnsafeBytes { buffer in
      guard let base = buffer.baseAddress else { return }
      for start in stride(from: 0, to: count, by: Self.searchChunkRows) {
        let rows = min(Self.searchChunkRows, count - start)
        let values = rows * dimension
        converted.withUnsafeMutableBytes { target in
          var source = vImage_Buffer(
            data: UnsafeMutableRawPointer(mutating: base + start * dimension * MemoryLayout<Float16>.size),
            height: 1, width: vImagePixelCount(values), rowBytes: values * MemoryLayout<Float16>.size
          )
          var destination = vImage_Buffer(
            data: target.baseAddress, height: 1, width: vImagePixelCount(values), rowBytes: values * MemoryLayout<Float>.size
          )
          vImageConvert_Planar16FtoPlanarF(&source, &destination, vImage_Flags(kvImageNoFlags))
        }
        vDSP_mmul(
          converted, 1, queryMatrix, 1, &products, 1,
          vDSP_Length(rows), vDSP_Length(queryCount), vDSP_Length(dimension)
        )
        for row in 0 ..< rows {
          for column in 0 ..< queryCount {
            scores[column][start + row] = products[row * queryCount + column]
          }
        }
      }
    }
    return scores
  }

  func top(_ count: Int, of scores: [Float]) -> [Int] {
    var best: [(Int, Float)] = []
    best.reserveCapacity(count + 1)
    for (index, score) in scores.enumerated() {
      if best.count < count {
        best.append((index, score))
        if best.count == count { best.sort { $0.1 > $1.1 } }
      } else if score > best[count - 1].1 {
        var position = count - 1
        while position > 0 && best[position - 1].1 < score { position -= 1 }
        best.insert((index, score), at: position)
        best.removeLast()
      }
    }
    if best.count < count { best.sort { $0.1 > $1.1 } }
    return best.map { $0.0 }
  }
}

// PE-Core S16, "pad 384": keep the aspect ratio, pad the sides with the model mean colour (0.5).
// SigLIP 2 B/16, "squash 256": stretch the card to the square input.
// The models take pixels in [0, 1] and normalise them themselves.
final class Embedder {
  let side: Int
  let squash: Bool
  let model: MLModel
  let input: MLMultiArray
  let provider: MLDictionaryFeatureProvider
  private var rgba: [UInt8]

  init(model: MLModel, name: String) throws {
    self.model = model
    squash = name.hasPrefix("siglip")
    side = squash ? 256 : 384
    rgba = [UInt8](repeating: 0, count: side * side * 4)
    input = try MLMultiArray(shape: [1, 3, NSNumber(value: side), NSNumber(value: side)], dataType: .float32)
    provider = try MLDictionaryFeatureProvider(dictionary: ["pixels": MLFeatureValue(multiArray: input)])
  }

  func fill(from image: CGImage) {
    let side = self.side
    let scale = min(Double(side) / Double(image.width), Double(side) / Double(image.height))
    let width = squash ? side : max(1, Int((Double(image.width) * scale).rounded()))
    let height = squash ? side : max(1, Int((Double(image.height) * scale).rounded()))
    rgba.withUnsafeMutableBytes { pixels in
      let context = CGContext(
        data: pixels.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
      )!
      let grey = CGFloat(127) / 255
      context.setFillColor(CGColor(srgbRed: grey, green: grey, blue: grey, alpha: 1))
      context.fill(CGRect(x: 0, y: 0, width: side, height: side))
      context.interpolationQuality = .high
      context.draw(image, in: CGRect(x: (side - width) / 2, y: (side - height) / 2, width: width, height: height))
    }
    let count = side * side
    let destination = input.dataPointer.assumingMemoryBound(to: Float.self)
    rgba.withUnsafeBufferPointer { pixels in
      for channel in 0 ..< 3 {
        vDSP_vfltu8(pixels.baseAddress! + channel, 4, destination + channel * count, 1, vDSP_Length(count))
        var divisor: Float = 255
        vDSP_vsdiv(destination + channel * count, 1, &divisor, destination + channel * count, 1, vDSP_Length(count))
      }
    }
  }

  func fill(fromTensor values: UnsafePointer<Float>) {
    input.dataPointer.assumingMemoryBound(to: Float.self).update(from: values, count: 3 * side * side)
  }

  func predict(normalised: Bool = true) throws -> [Float] {
    let output = try model.prediction(from: provider)
    guard let array = output.featureValue(for: "embedding")?.multiArrayValue else { throw BenchError.failed("no output") }
    var vector = MLShapedArray<Float>(converting: array).scalars
    if normalised {
      let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
      if norm > 0 { vector = vector.map { $0 / norm } }
    }
    return vector
  }

  func embed(_ image: CGImage) throws -> [Float] {
    fill(from: image)
    return try predict()
  }
}

enum Bench {
  static let payload = Bundle.main.bundleURL.appendingPathComponent("BenchData")
  static let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  static let results = documents.appendingPathComponent("results")

  static func log(_ line: String) {
    print(line)
    fflush(stdout)
    let url = documents.appendingPathComponent("log.txt")
    if let handle = try? FileHandle(forWritingTo: url) {
      handle.seekToEndOfFile()
      handle.write((line + "\n").data(using: .utf8)!)
      try? handle.close()
    } else {
      try? (line + "\n").write(to: url, atomically: true, encoding: .utf8)
    }
  }

  static func memory() -> [String: Double] {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    _ = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    let mb = 1_048_576.0
    return [
      "footprintMB": Double(info.phys_footprint) / mb,
      "footprintPeakMB": Double(info.ledger_phys_footprint_peak) / mb,
      "residentMB": Double(info.resident_size) / mb,
      "residentPeakMB": Double(info.resident_size_peak) / mb,
    ]
  }

  static func units(_ name: String) -> MLComputeUnits {
    switch name {
    case "all": return .all
    case "gpu": return .cpuAndGPU
    case "ane": return .cpuAndNeuralEngine
    default: return .cpuOnly
    }
  }

  static func now() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

  static func loadModel(_ name: String, _ unitName: String) throws -> (MLModel, Double) {
    let configuration = MLModelConfiguration()
    configuration.computeUnits = units(unitName)
    let start = now()
    let model = try MLModel(contentsOf: payload.appendingPathComponent("models/\(name).mlmodelc"), configuration: configuration)
    return (model, now() - start)
  }

  static func crops() -> [URL] {
    let list = try! String(contentsOf: payload.appendingPathComponent("crops.txt"), encoding: .utf8)
    return list.split(separator: "\n").map { payload.appendingPathComponent("crops/\($0)") }
  }

  static func write(_ vectors: [[Float]], _ name: String) throws {
    let flat = vectors.flatMap { $0 }
    try flat.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: results.appendingPathComponent(name))
  }

  static func report(_ task: String, _ result: [String: Any]) {
    var all = result
    all["task"] = task
    all["memory"] = memory()
    let data = try! JSONSerialization.data(withJSONObject: all, options: [.sortedKeys])
    try? data.write(to: results.appendingPathComponent(task.replacingOccurrences(of: ":", with: "_") + ".json"))
    log("RESULT " + String(data: data, encoding: .utf8)!)
  }

  static func percentile(_ values: [Double], _ p: Double) -> Double {
    let sorted = values.sorted()
    return sorted[min(sorted.count - 1, Int((Double(sorted.count - 1) * p).rounded()))]
  }

  static func stats(_ values: [Double]) -> [String: Double] {
    ["p50": percentile(values, 0.5), "p95": percentile(values, 0.95), "mean": values.reduce(0, +) / Double(values.count), "min": values.min()!]
  }

  static func run(_ tasks: [String]) {
    try? FileManager.default.createDirectory(at: results, withIntermediateDirectories: true)
    log("START \(tasks) \(memory())")
    let launched = now()
    for task in tasks {
      log("BEGIN \(task) t=\(Int(now() - launched))ms \(memory())")
      do { try autoreleasepool {
        let parts = task.split(separator: ":").map(String.init)
        switch parts[0] {
        case "compile": try compile(task, parts[1])
        case "load": try load(task, parts[1], parts[2])
        case "parity": try parity(task, parts[1], parts[2])
        case "speed": try speed(task, parts[1], parts[2], scans: Int(parts[3]) ?? 150)
        case "memory": try memoryRun(task, parts[1], parts[2])
        default: log("unknown task \(task)")
        }
      } } catch {
        report(task, ["error": "\(error)"])
      }
    }
    log("END \(memory())")
  }

  // Compile a downloaded .mlpackage on the device, as a runtime download would.
  static func compile(_ task: String, _ name: String) throws {
    let start = now()
    let compiled = try MLModel.compileModel(at: payload.appendingPathComponent("packages/\(name).mlpackage"))
    let compileMs = now() - start
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    let loadStart = now()
    let model = try MLModel(contentsOf: compiled, configuration: configuration)
    let loadMs = now() - loadStart
    let embedder = try Embedder(model: model, name: name)
    let firstStart = now()
    _ = try embedder.predict()
    report(task, ["compileMs": compileMs, "firstLoadAllMs": loadMs, "firstPredictMs": now() - firstStart])
    try? FileManager.default.removeItem(at: compiled)
  }

  static func load(_ task: String, _ name: String, _ unitName: String) throws {
    let (model, loadMs) = try loadModel(name, unitName)
    let embedder = try Embedder(model: model, name: name)
    let firstStart = now()
    _ = try embedder.predict()
    let firstMs = now() - firstStart
    let (_, secondLoadMs) = try loadModel(name, unitName)
    report(task, ["loadMs": loadMs, "firstPredictMs": firstMs, "secondLoadMs": secondLoadMs])
  }

  static func parity(_ task: String, _ name: String, _ unitName: String) throws {
    let (model, _) = try loadModel(name, unitName)
    let embedder = try Embedder(model: model, name: name)
    let tensors = try Data(contentsOf: payload.appendingPathComponent(name.hasPrefix("siglip") ? "siglip_ref24_pixels01.f32" : "ref24_pixels01.f32"))
    let size = 3 * embedder.side * embedder.side
    var tensorVectors: [[Float]] = []
    try tensors.withUnsafeBytes { buffer in
      let floats = buffer.bindMemory(to: Float.self)
      for index in 0 ..< floats.count / size {
        try autoreleasepool {
          embedder.fill(fromTensor: floats.baseAddress! + index * size)
          tensorVectors.append(try embedder.predict(normalised: false))
        }
      }
    }
    var upright: [[Float]] = []
    var turned: [[Float]] = []
    for url in crops() { try autoreleasepool {
      guard let card = Card.load(url), let turnedCard = Card.rotatedHalfTurn(card),
            let small = Card.resized(card), let turnedSmall = Card.resized(turnedCard) else { throw BenchError.failed("load \(url)") }
      upright.append(try embedder.embed(small))
      turned.append(try embedder.embed(turnedSmall))
    } }
    let base = "\(name)_\(unitName)"
    try write(tensorVectors, base + "_t24.f32")
    try write(upright, base + "_e2e.f32")
    try write(turned, base + "_e2erot.f32")
    let nan = (tensorVectors + upright + turned).flatMap { $0 }.filter { $0.isNaN }.count
    report(task, ["nan": nan, "tensors": tensorVectors.count, "crops": upright.count])
  }

  static func smallCards(_ count: Int) throws -> [CGImage] {
    try crops().prefix(count).map { url in
      guard let card = Card.load(url) else { throw BenchError.failed("load \(url)") }
      return card
    }
  }

  // One scan: turn the rectified card, resize both views to 488 x 680 (the app's "resize" stage),
  // then embed both (the "embed" stage). Times are in ms.
  static func speed(_ task: String, _ name: String, _ unitName: String, scans: Int) throws {
    let cards = try smallCards(261)
    var embedder: Embedder?
    var loadMs = 0.0
    if name != "vision" {
      let (model, ms) = try loadModel(name, unitName)
      embedder = try Embedder(model: model, name: name)
      loadMs = ms
    }
    var resize: [Double] = []
    var embed: [Double] = []
    var modelOnly: [Double] = []
    let warmUp = 20
    for scan in 0 ..< warmUp + scans { try autoreleasepool {
      let card = cards[scan % cards.count]
      var start = now()
      guard let turned = Card.rotatedHalfTurn(card), let upright = Card.resized(card), let turnedSmall = Card.resized(turned)
      else { throw BenchError.failed("resize") }
      let resizeMs = now() - start
      start = now()
      var modelMs = 0.0
      if let embedder {
        for image in [upright, turnedSmall] {
          embedder.fill(from: image)
          let predictStart = now()
          _ = try embedder.predict()
          modelMs += now() - predictStart
        }
      } else {
        _ = try visionVector(of: upright)
        _ = try visionVector(of: turnedSmall)
      }
      let embedMs = now() - start
      if scan >= warmUp {
        resize.append(resizeMs)
        embed.append(embedMs)
        modelOnly.append(modelMs)
      }
    } }
    var result: [String: Any] = ["scans": scans, "loadMs": loadMs, "resizeMs": stats(resize), "embedTwoMs": stats(embed)]
    if name != "vision" { result["modelTwoMs"] = stats(modelOnly) }
    report(task, result)
  }

  // Peak memory with the model loaded and its gallery mapped and searched as Gallery.swift does.
  static func memoryRun(_ task: String, _ name: String, _ unitName: String) throws {
    var stages: [String: [String: Double]] = [:]
    let cards = try smallCards(40)
    stages["cardsLoaded"] = memory()
    var embedder: Embedder?
    if name != "vision" {
      let (model, _) = try loadModel(name, unitName)
      embedder = try Embedder(model: model, name: name)
      _ = try embedder!.predict()
      stages["modelLoaded"] = memory()
    }
    let galleryName = name == "vision" ? "vision.f16" : "pes16-int8.f16"
    let gallery = try SearchGallery(
      url: documents.appendingPathComponent("galleries/\(galleryName)"), dimension: name == "vision" ? 768 : 512
    )
    var tops = 0
    for scan in 0 ..< 100 { try autoreleasepool {
      let card = cards[scan % cards.count]
      guard let turned = Card.rotatedHalfTurn(card), let upright = Card.resized(card), let turnedSmall = Card.resized(turned)
      else { throw BenchError.failed("resize") }
      let vectors = try embedder.map { [try $0.embed(upright), try $0.embed(turnedSmall)] }
        ?? [try visionVector(of: upright), try visionVector(of: turnedSmall)]
      let scores = gallery.similarities(to: vectors)
      tops += gallery.top(50, of: scores[0]).count + gallery.top(50, of: scores[1]).count
      if scan == 0 { stages["firstScan"] = memory() }
    } }
    stages["after100Scans"] = memory()
    report(task, ["stages": stages, "galleryRows": gallery.count, "galleryBytes": gallery.vectors.count, "tops": tops])
  }
}
