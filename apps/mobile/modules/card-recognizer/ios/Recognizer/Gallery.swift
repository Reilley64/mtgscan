import Accelerate
import Foundation

public struct GalleryPrinting: Codable, Sendable {
  public let id: String
  public let oracleId: String
  public let illustrationId: String?
  public let name: String
  public let faceNames: [String]
  public let set: String
  public let collectorNumber: String
  public let frame: String
  public let finishes: [String]
  public let basicLand: Bool

  private enum CodingKeys: String, CodingKey {
    case id, oracleId, illustrationId, name, faceNames, set, collectorNumber, frame, finishes, basicLand
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    oracleId = try container.decode(String.self, forKey: .oracleId)
    illustrationId = try container.decodeIfPresent(String.self, forKey: .illustrationId)
    name = try container.decode(String.self, forKey: .name)
    faceNames = try container.decodeIfPresent([String].self, forKey: .faceNames) ?? []
    set = try container.decode(String.self, forKey: .set)
    collectorNumber = try container.decode(String.self, forKey: .collectorNumber)
    frame = try container.decode(String.self, forKey: .frame)
    finishes = try container.decodeIfPresent([String].self, forKey: .finishes) ?? []
    basicLand = try container.decodeIfPresent(Bool.self, forKey: .basicLand) ?? false
  }
}

public struct GalleryHeader: Codable, Sendable {
  public static let float16 = "float16"

  public let count: Int
  public let dimension: Int
  public let revision: Int
  public let createdAt: String
  public let encoding: String?
  public let version: String?

  public init(count: Int, dimension: Int, revision: Int, createdAt: String, encoding: String?, version: String? = nil) {
    self.count = count
    self.dimension = dimension
    self.revision = revision
    self.createdAt = createdAt
    self.encoding = encoding
    self.version = version
  }
}

public enum GalleryFile {
  public static let printingList = "catalog.json"
  public static let header = "gallery.json"
  public static let float16Vectors = "gallery.f16"
}

public final class Gallery: Sendable {
  public static let searchChunkRows = 4096

  public let printings: [GalleryPrinting]
  public let dimension: Int
  public let printingsByIllustration: [String: [Int]]
  public let setCodes: Set<String>
  private let vectors: Data
  private let indexBySetAndNumber: [String: Int]
  private let indexById: [String: Int]

  public enum Failure: Error {
    case mismatch(String)
  }

  public static func printingList(in directory: URL) throws -> [GalleryPrinting] {
    try JSONDecoder().decode(
      [GalleryPrinting].self,
      from: Data(contentsOf: directory.appendingPathComponent(GalleryFile.printingList))
    )
  }

  public init(directory: URL) throws {
    printings = try Self.printingList(in: directory)
    let header = try JSONDecoder().decode(
      GalleryHeader.self,
      from: Data(contentsOf: directory.appendingPathComponent(GalleryFile.header))
    )
    guard header.count == printings.count, header.dimension == FeaturePrint.dimension else {
      throw Failure.mismatch("gallery has \(header.count)x\(header.dimension), printing list has \(printings.count)")
    }
    dimension = header.dimension
    guard (header.encoding ?? GalleryHeader.float16) == GalleryHeader.float16 else {
      throw Failure.mismatch("unknown gallery encoding \(header.encoding ?? "")")
    }
    let raw = try Data(contentsOf: directory.appendingPathComponent(GalleryFile.float16Vectors), options: .alwaysMapped)
    guard raw.count == header.count * header.dimension * MemoryLayout<Float16>.size else {
      throw Failure.mismatch("\(GalleryFile.float16Vectors) has \(raw.count) bytes")
    }
    vectors = raw
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

  public static func key(set: String, collectorNumber: String) -> String {
    "\(set.lowercased())|\(withoutLeadingZeros(collectorNumber).lowercased())"
  }

  static func withoutLeadingZeros(_ collectorNumber: String) -> String {
    let trimmed = collectorNumber.drop { $0 == "0" }
    return trimmed.isEmpty ? "0" : String(trimmed)
  }

  public func index(set: String, collectorNumber: String) -> Int? {
    indexBySetAndNumber[Self.key(set: set, collectorNumber: collectorNumber)]
  }

  public func index(id: String) -> Int? {
    indexById[id]
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
