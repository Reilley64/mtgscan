import Accelerate
import Foundation

struct MTGCatalogPrinting: Codable {
  let id: String
  let oracleId: String
  let illustrationId: String?
  let name: String
  let set: String
  let collectorNumber: String
  let frame: String
}

struct MTGGalleryHeader: Codable {
  let count: Int
  let dimension: Int
  let revision: Int
  let createdAt: String
}

final class MTGCardCatalog {
  let printings: [MTGCatalogPrinting]
  let dimension: Int
  private let vectors: [Float]
  private let indexBySetAndNumber: [String: Int]
  private let indexById: [String: Int]
  let printingsByIllustration: [String: [Int]]
  let setCodes: Set<String>

  enum Failure: Error {
    case galleryMismatch(String)
  }

  init(directory: URL) throws {
    let decoder = JSONDecoder()
    printings = try decoder.decode(
      [MTGCatalogPrinting].self,
      from: Data(contentsOf: directory.appendingPathComponent("catalog.json"))
    )
    let header = try decoder.decode(
      MTGGalleryHeader.self,
      from: Data(contentsOf: directory.appendingPathComponent("gallery.json"))
    )
    guard header.count == printings.count, header.dimension == MTGCardEmbedder.dimension else {
      throw Failure.galleryMismatch("gallery has \(header.count)x\(header.dimension), catalog has \(printings.count)")
    }
    dimension = header.dimension
    let raw = try Data(contentsOf: directory.appendingPathComponent("gallery.f16"), options: .alwaysMapped)
    guard raw.count == header.count * header.dimension * MemoryLayout<Float16>.size else {
      throw Failure.galleryMismatch("gallery.f16 has \(raw.count) bytes")
    }
    vectors = raw.withUnsafeBytes { buffer in
      buffer.bindMemory(to: Float16.self).map { Float($0) }
    }
    var bySetAndNumber: [String: Int] = [:]
    var byIllustration: [String: [Int]] = [:]
    for (index, printing) in printings.enumerated() {
      bySetAndNumber[Self.key(set: printing.set, collectorNumber: printing.collectorNumber)] = index
      if let illustration = printing.illustrationId {
        byIllustration[illustration, default: []].append(index)
      }
    }
    indexBySetAndNumber = bySetAndNumber
    indexById = Dictionary(uniqueKeysWithValues: printings.enumerated().map { ($1.id, $0) })
    printingsByIllustration = byIllustration
    setCodes = Set(printings.map { $0.set })
  }

  static func key(set: String, collectorNumber: String) -> String {
    let trimmed = collectorNumber.drop { $0 == "0" }
    return "\(set.lowercased())|\(trimmed.isEmpty ? "0" : String(trimmed).lowercased())"
  }

  func index(set: String, collectorNumber: String) -> Int? {
    indexBySetAndNumber[Self.key(set: set, collectorNumber: collectorNumber)]
  }

  func index(id: String) -> Int? {
    indexById[id]
  }

  func vector(at index: Int) -> ArraySlice<Float> {
    vectors[(index * dimension) ..< ((index + 1) * dimension)]
  }

  func similarities(to query: [Float]) -> [Float] {
    var scores = [Float](repeating: 0, count: printings.count)
    vectors.withUnsafeBufferPointer { matrix in
      query.withUnsafeBufferPointer { vector in
        scores.withUnsafeMutableBufferPointer { output in
          vDSP_mmul(
            matrix.baseAddress!, 1,
            vector.baseAddress!, 1,
            output.baseAddress!, 1,
            vDSP_Length(printings.count), 1, vDSP_Length(dimension)
          )
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
