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
  private let halves: Data
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
    halves = raw
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

  static let searchChunkRows = 4096

  func vector(at index: Int) -> [Float] {
    halves.withUnsafeBytes { buffer in
      let values = buffer.bindMemory(to: Float16.self)
      return (0 ..< dimension).map { Float(values[index * dimension + $0]) }
    }
  }

  func similarities(to queries: [[Float]]) -> [[Float]] {
    let count = printings.count
    let queryCount = queries.count
    var queryMatrix = [Float](repeating: 0, count: dimension * queryCount)
    for (column, query) in queries.enumerated() {
      for row in 0 ..< dimension { queryMatrix[row * queryCount + column] = query[row] }
    }
    var scores = [[Float]](repeating: [Float](repeating: 0, count: count), count: queryCount)
    var converted = [Float](repeating: 0, count: Self.searchChunkRows * dimension)
    var products = [Float](repeating: 0, count: Self.searchChunkRows * queryCount)
    halves.withUnsafeBytes { buffer in
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
